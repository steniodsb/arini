import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AtendimentoAutomation,
  AutomationCondition,
  AutomationEvent,
  ConversationChannel,
  ConversationPriority,
  ConversationStatus,
  MacroAction,
} from "@/lib/types";

// =====================================================================
// MOTOR DE AUTOMAÇÕES DO ATENDIMENTO — lógica pura, sem React.
//
// Fluxo: evento → busca regras ativas → avalia condições (AND) → aplica
// as ações no banco → grava o log em atendimento_automation_logs.
//
// O QUE AINDA FALTA PARA FICAR 100%:
//   1. GANCHO NO WEBHOOK — ninguém chama `executarAutomacoes` ainda. É
//      preciso invocá-la no handler de entrada de mensagens (a rota do
//      webhook do WhatsApp/Evolution) com o client de SERVICE ROLE, logo
//      após gravar a mensagem/conversa, passando o evento correspondente
//      ('mensagem_criada' e 'conversa_criada') e o contexto montado.
//   2. Eventos 'conversa_atualizada' e 'conversa_resolvida' precisam de
//      gancho equivalente onde a conversa é alterada pela UI/API.
//   3. `dentroHorarioComercial` precisa ser calculado a partir de
//      atendimento_business_hours da caixa (aqui ele chega pronto no ctx).
//   4. A ação `enviar_mensagem` grava a mensagem no banco, mas NÃO faz o
//      envio ao provedor (Evolution/Cloud API) — o disparo real fica a
//      cargo de quem chamar (ou de um trigger de saída) e ainda não está
//      ligado.
//   5. Sem proteção contra loop: uma regra em 'conversa_atualizada' que
//      atualiza a conversa vai reentrar. Ao ligar o gancho, marque a
//      origem da alteração (ex.: remetente 'sistema') e ignore-a.
// =====================================================================

/** Recorte da conversa que as condições e ações enxergam. */
export interface ConversaContexto {
  id: string;
  canal?: ConversationChannel | string | null;
  status?: ConversationStatus | null;
  prioridade?: ConversationPriority | null;
  responsavel_id?: string | null;
  team_id?: string | null;
  tags?: string[] | null;
  contato_nome?: string | null;
  contato_telefone?: string | null;
}

/** Recorte da mensagem que disparou o evento (quando houver). */
export interface MensagemContexto {
  conteudo?: string | null;
  direcao?: "in" | "out";
  interna?: boolean;
}

export interface ContextoAutomacao {
  conversa: ConversaContexto;
  mensagem?: MensagemContexto;
  /** Calculado fora (business hours da caixa). Indefinido = desconhecido. */
  dentroHorarioComercial?: boolean;
}

/** Valor bruto de um campo do contexto: texto, lista (tags) ou ausente. */
type ValorCampo = string | string[] | null;

// ---------------------------------------------------------------------
// 1. AVALIAÇÃO DE CONDIÇÕES
// ---------------------------------------------------------------------

/** Lê o campo da condição dentro do contexto. Nomes batem com a UI. */
function lerCampo(campo: string, ctx: ContextoAutomacao): ValorCampo {
  const c = ctx.conversa;
  switch (campo) {
    case "status":
      return c.status ?? null;
    case "prioridade":
      return c.prioridade ?? null;
    case "canal":
      return c.canal ?? null;
    case "responsavel_id":
      return c.responsavel_id ?? null;
    case "team_id":
      return c.team_id ?? null;
    case "tags":
      return c.tags ?? [];
    case "contato_nome":
      return c.contato_nome ?? null;
    case "contato_telefone":
      return c.contato_telefone ?? null;
    case "mensagem":
      return ctx.mensagem?.conteudo ?? null;
    case "horario_comercial":
      // A UI grava "sim"/"nao"; indefinido = não dá para afirmar nada.
      if (ctx.dentroHorarioComercial === undefined) return null;
      return ctx.dentroHorarioComercial ? "sim" : "nao";
    default:
      return null;
  }
}

/** Comparação sempre insensível a caixa e a espaços nas pontas. */
function normalizar(v: string): string {
  return v.trim().toLowerCase();
}

/** Campo "preenchido": string não vazia ou array com pelo menos um item. */
function temValor(valor: ValorCampo): boolean {
  if (valor === null) return false;
  if (Array.isArray(valor)) return valor.length > 0;
  return valor.trim() !== "";
}

function avaliarCondicao(cond: AutomationCondition, ctx: ContextoAutomacao): boolean {
  const atual = lerCampo(cond.campo, ctx);
  const esperado = normalizar(cond.valor ?? "");

  switch (cond.operador) {
    case "existe":
      return temValor(atual);
    case "nao_existe":
      return !temValor(atual);
    case "igual":
      return Array.isArray(atual)
        ? atual.some((t) => normalizar(t) === esperado)
        : atual !== null && normalizar(atual) === esperado;
    case "diferente":
      return Array.isArray(atual)
        ? !atual.some((t) => normalizar(t) === esperado)
        : atual === null || normalizar(atual) !== esperado;
    case "contem":
      // Em array (tags) "contém" = alguma etiqueta casa parcialmente.
      return Array.isArray(atual)
        ? atual.some((t) => normalizar(t).includes(esperado))
        : atual !== null && normalizar(atual).includes(esperado);
    case "nao_contem":
      return Array.isArray(atual)
        ? !atual.some((t) => normalizar(t).includes(esperado))
        : atual === null || !normalizar(atual).includes(esperado);
    default:
      return false;
  }
}

/**
 * Todas as condições precisam ser verdadeiras (AND), igual à UI.
 * Lista vazia = regra sem filtro, dispara sempre.
 */
export function avaliarCondicoes(
  condicoes: AutomationCondition[],
  ctx: ContextoAutomacao,
): boolean {
  if (!condicoes || condicoes.length === 0) return true;
  return condicoes.every((c) => avaliarCondicao(c, ctx));
}

// ---------------------------------------------------------------------
// 2. APLICAÇÃO DAS AÇÕES
// ---------------------------------------------------------------------

export interface AplicarAcoesOpts {
  /** Autor das mensagens/notas criadas (perfil do agente ou null = sistema). */
  autorId?: string | null;
  /** Tags atuais da conversa; se não vier, o motor lê do banco quando precisar. */
  tagsAtuais?: string[];
}

export interface ResultadoAcoes {
  aplicadas: number;
  erros: string[];
}

/** Patch acumulado para a tabela conversations. */
type PatchConversa = {
  responsavel_id?: string | null;
  team_id?: string | null;
  status?: ConversationStatus;
  prioridade?: ConversationPriority;
  tags?: string[];
  resolvida_em?: string | null;
};

const STATUS_VALIDOS: ConversationStatus[] = ["aberta", "pendente", "resolvida", "adiada"];
const PRIORIDADES_VALIDAS: ConversationPriority[] = ["baixa", "media", "alta", "urgente"];

/**
 * Executa a sequência de ações de uma macro/regra sobre uma conversa.
 * Recebe o client por parâmetro: no webhook ele é service role, na UI é
 * o client do usuário — quem chama decide o nível de permissão.
 */
export async function aplicarAcoes(
  supabase: SupabaseClient,
  conversationId: string,
  acoes: MacroAction[],
  opts: AplicarAcoesOpts = {},
): Promise<ResultadoAcoes> {
  const erros: string[] = [];
  let aplicadas = 0;

  const patch: PatchConversa = {};
  const mensagens: { conteudo: string; interna: boolean }[] = [];

  // As tags são lidas uma única vez e mutadas em memória — assim várias
  // ações de etiqueta na mesma macro não sobrescrevem umas às outras.
  let tags: string[] | null = opts.tagsAtuais ? [...opts.tagsAtuais] : null;
  async function garantirTags(): Promise<string[]> {
    if (tags !== null) return tags;
    const { data } = await supabase
      .from("conversations")
      .select("tags")
      .eq("id", conversationId)
      .single();
    const lidas = (data as { tags: string[] | null } | null)?.tags ?? [];
    tags = [...lidas];
    return tags;
  }

  for (const acao of acoes) {
    const valor = (acao.valor ?? "").trim();
    if (!valor) {
      erros.push(`Ação "${acao.tipo}" ignorada: sem valor.`);
      continue;
    }

    switch (acao.tipo) {
      case "atribuir_agente":
        patch.responsavel_id = valor;
        aplicadas++;
        break;

      case "atribuir_equipe":
        patch.team_id = valor;
        aplicadas++;
        break;

      case "mudar_status": {
        if (!STATUS_VALIDOS.includes(valor as ConversationStatus)) {
          erros.push(`Status inválido: ${valor}`);
          break;
        }
        const status = valor as ConversationStatus;
        patch.status = status;
        // Mantém o carimbo de resolução coerente com o status.
        patch.resolvida_em = status === "resolvida" ? new Date().toISOString() : null;
        aplicadas++;
        break;
      }

      case "mudar_prioridade": {
        if (!PRIORIDADES_VALIDAS.includes(valor as ConversationPriority)) {
          erros.push(`Prioridade inválida: ${valor}`);
          break;
        }
        patch.prioridade = valor as ConversationPriority;
        aplicadas++;
        break;
      }

      case "adicionar_etiqueta": {
        const atuais = await garantirTags();
        if (!atuais.some((t) => t.toLowerCase() === valor.toLowerCase())) {
          atuais.push(valor);
        }
        patch.tags = [...atuais];
        aplicadas++;
        break;
      }

      case "remover_etiqueta": {
        const atuais = await garantirTags();
        tags = atuais.filter((t) => t.toLowerCase() !== valor.toLowerCase());
        patch.tags = [...tags];
        aplicadas++;
        break;
      }

      case "enviar_mensagem":
        mensagens.push({ conteudo: valor, interna: false });
        aplicadas++;
        break;

      case "adicionar_nota":
        mensagens.push({ conteudo: valor, interna: true });
        aplicadas++;
        break;

      default:
        erros.push(`Tipo de ação desconhecido: ${String(acao.tipo)}`);
    }
  }

  if (Object.keys(patch).length > 0) {
    const { error } = await supabase.from("conversations").update(patch).eq("id", conversationId);
    if (error) erros.push(`Falha ao atualizar a conversa: ${error.message}`);
  }

  if (mensagens.length > 0) {
    const linhas = mensagens.map((m) => ({
      conversation_id: conversationId,
      direcao: "out" as const,
      // Nota interna nasce como "enviada" porque não sai para o cliente;
      // a mensagem de verdade ainda depende do envio ao provedor.
      remetente: "sistema" as const,
      autor_id: opts.autorId ?? null,
      tipo: "texto" as const,
      conteudo: m.conteudo,
      interna: m.interna,
      status: "enviada" as const,
    }));
    const { error } = await supabase.from("messages").insert(linhas);
    if (error) erros.push(`Falha ao inserir mensagens: ${error.message}`);
  }

  return { aplicadas, erros };
}

// ---------------------------------------------------------------------
// 3. ORQUESTRAÇÃO POR EVENTO
// ---------------------------------------------------------------------

export interface ResultadoAutomacao {
  automationId: string;
  nome: string;
  disparou: boolean;
  aplicadas: number;
  erros: string[];
}

/**
 * Busca as regras ativas do evento, avalia cada uma contra o contexto,
 * aplica as ações das que baterem e registra o resultado no log.
 * Nunca lança: erros voltam dentro do resultado para não derrubar o webhook.
 */
export async function executarAutomacoes(
  supabase: SupabaseClient,
  evento: AutomationEvent,
  ctx: ContextoAutomacao,
): Promise<ResultadoAutomacao[]> {
  const { data, error } = await supabase
    .from("atendimento_automations")
    .select("*")
    .eq("evento", evento)
    .eq("ativo", true)
    .order("created_at", { ascending: true });

  if (error || !data) return [];

  const regras = data as AtendimentoAutomation[];
  const resultados: ResultadoAutomacao[] = [];

  for (const regra of regras) {
    const bateu = avaliarCondicoes(regra.condicoes ?? [], ctx);
    if (!bateu) {
      resultados.push({
        automationId: regra.id,
        nome: regra.nome,
        disparou: false,
        aplicadas: 0,
        erros: [],
      });
      continue;
    }

    const r = await aplicarAcoes(supabase, ctx.conversa.id, regra.acoes ?? [], {
      // Ação automática não tem agente humano por trás.
      autorId: null,
      tagsAtuais: ctx.conversa.tags ?? undefined,
    });

    resultados.push({
      automationId: regra.id,
      nome: regra.nome,
      disparou: true,
      aplicadas: r.aplicadas,
      erros: r.erros,
    });

    // Log de auditoria — responde "por que essa conversa foi atribuída?".
    await supabase.from("atendimento_automation_logs").insert({
      automation_id: regra.id,
      conversation_id: ctx.conversa.id,
      resultado:
        r.erros.length > 0
          ? `Executada com ${r.aplicadas} ação(ões) e erros: ${r.erros.join("; ")}`
          : `Executada com ${r.aplicadas} ação(ões).`,
    });
  }

  return resultados;
}
