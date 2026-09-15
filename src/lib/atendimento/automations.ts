import type { SupabaseClient } from "@supabase/supabase-js";
import {
  emitirConversaAtualizada,
  emitirConversaResolvida,
} from "@/lib/atendimento/webhook-eventos";
import { enviarMensagem } from "@/lib/atendimento/outbound";
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
//   1. Sem proteção contra loop: uma regra em 'conversa_atualizada' que
//      atualiza a conversa vai reentrar. Ao ligar esse gancho, marque a
//      origem da alteração (ex.: remetente 'sistema') e ignore-a.
//
// JÁ RESOLVIDO (mantido aqui porque o comentário antigo listava como
// pendência e induzia a erro): o gancho do webhook existe desde que
// `triggers.ts` passou a chamar `dispararAutomacoes`, e a ação
// `enviar_mensagem` passou a ENTREGAR de verdade pelo canal em 15/09/2026
// — antes disso ela só gravava no banco com status 'enviada', o que fazia
// a tela mentir.
// =====================================================================

/** Recorte da conversa que as condições e ações enxergam. */
export interface ConversaContexto {
  id: string;
  canal?: ConversationChannel | string | null;
  /** Conexão que recebeu (multi-WhatsApp). Nulo em canais sem cadastro. */
  channel_id?: string | null;
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
    case "channel_id":
      return c.channel_id ?? null;
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
  /**
   * Para onde ENTREGAR o que a ação `enviar_mensagem` produzir.
   *
   * Sem isto a mensagem era só gravada no banco — e gravada com
   * `status: 'enviada'`, então aparecia no inbox com cara de entregue
   * enquanto o cliente não recebia nada. Quem chama informa o canal e o
   * destino; sem eles a mensagem continua sendo gravada, mas marcada como
   * falha, que é a verdade.
   */
  entrega?: {
    canal: ConversationChannel;
    channelId: string | null;
    destino: string | null;
  } | null;
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
    // O `select` no update é o que permite montar o payload do webhook sem
    // uma segunda leitura — e devolve o estado JÁ aplicado, que é o que o
    // consumidor precisa ver.
    const { data: atualizada, error } = await supabase
      .from("conversations")
      .update(patch)
      .eq("id", conversationId)
      .select("id, canal, status, contato_nome, contato_telefone, lead_id")
      .maybeSingle();
    if (error) erros.push(`Falha ao atualizar a conversa: ${error.message}`);

    // Webhooks de saída das AUTOMAÇÕES: uma regra que resolve ou reatribui
    // a conversa é uma mudança real, e o integrador não tem como saber que
    // ela aconteceu (não houve clique de ninguém).
    //
    // Só dispara quando o `select` volta: com um client sem service role a
    // leitura de `atendimento_webhooks` é barrada pela RLS e o disparo não
    // teria efeito nenhum mesmo. Nada aqui bloqueia — ver webhook-eventos.
    if (atualizada) {
      const evento = {
        id: atualizada.id as string,
        canal: atualizada.canal as string | null,
        status: atualizada.status as string | null,
        contato_nome: atualizada.contato_nome as string | null,
        contato_telefone: atualizada.contato_telefone as string | null,
        lead_id: atualizada.lead_id as string | null,
      };
      if (patch.status === "resolvida") {
        emitirConversaResolvida(supabase, evento, {
          resolvida_em: patch.resolvida_em ?? null,
          // Automação não tem gente por trás — o campo fica nulo de propósito.
          resolvida_por: null,
        });
      } else {
        emitirConversaAtualizada(supabase, evento, {
          por: "automacao",
          campos: Object.keys(patch),
        });
      }
    }
  }

  if (mensagens.length > 0) {
    // ENTREGA DE VERDADE.
    //
    // Antes daqui só saía um `insert` com `status: 'enviada'` — a mensagem
    // aparecia no inbox como entregue e o cliente nunca recebia nada. A
    // tela afirmava o contrário do que tinha acontecido, que é a pior
    // forma de uma automação falhar: ninguém vai atrás do que parece ter
    // dado certo.
    //
    // Agora cada mensagem NÃO-interna é despachada pelo canal antes de ser
    // gravada, e o `status` reflete o resultado. Nota interna não passa por
    // aqui: ela nasce "enviada" porque, por definição, não sai para o
    // cliente — o destino dela é a própria tela.
    const linhas: Record<string, unknown>[] = [];

    for (const m of mensagens) {
      let status: "enviada" | "falha" = "enviada";
      let externalId: string | null = null;

      if (!m.interna) {
        const entrega = opts.entrega;
        if (!entrega?.destino) {
          // Sem para onde mandar, gravar como "enviada" seria repetir o
          // bug. Fica registrada como falha e o motivo vai para os erros.
          status = "falha";
          erros.push(
            "Ação \"enviar_mensagem\": a conversa não tem destino para entrega — " +
              "a mensagem ficou registrada como falha e NÃO foi para o cliente.",
          );
        } else {
          const r = await enviarMensagem(supabase, {
            canal: entrega.canal,
            channelId: entrega.channelId,
            destino: entrega.destino,
            texto: m.conteudo,
            conversationId,
          });
          if (r.ok) {
            externalId = r.externalId ?? null;
          } else {
            status = "falha";
            erros.push(`Ação "enviar_mensagem" não entregue: ${r.reason}`);
          }
        }
      }

      linhas.push({
        conversation_id: conversationId,
        direcao: "out",
        remetente: "sistema",
        autor_id: opts.autorId ?? null,
        tipo: "texto",
        conteudo: m.conteudo,
        interna: m.interna,
        status,
        external_id: externalId,
      });
    }

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
      // Para onde entregar, se a regra mandar mensagem. O contexto já
      // carrega tudo: o canal, QUAL conexão recebeu (multi-WhatsApp) e o
      // telefone do contato.
      entrega: {
        canal: (ctx.conversa.canal as ConversationChannel) ?? "whatsapp",
        channelId: ctx.conversa.channel_id ?? null,
        destino: ctx.conversa.contato_telefone ?? null,
      },
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
