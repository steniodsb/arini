import type { SupabaseClient } from "@supabase/supabase-js";
import { enviarMensagem } from "@/lib/atendimento/outbound";
import {
  INTENCOES,
  classificarIntencao,
  iaConfigurada,
  resumirConversa,
  sugerirResposta,
  type IaIntencao,
} from "@/lib/atendimento/ia";
import type { ConversationChannel } from "@/lib/types";

// =====================================================================
// TRIAGEM AUTOMÁTICA DA IA — o que roda SOZINHO quando chega mensagem.
//
// `src/lib/atendimento/ia.ts` só tem as ações do copiloto (o atendente
// clica, a IA responde). Aqui é o oposto: ninguém clica. Os webhooks de
// entrada chamam estas duas funções depois de gravar a mensagem.
//
// REGRAS DE OURO DESTE MÓDULO:
//   · NUNCA lança. Quem chama é webhook — uma exceção aqui faria a
//     Meta/Telegram reenfileirar o evento e a mensagem entrar duas vezes.
//   · Tudo é opt-in por caixa (`ia_triagem` / `ia_auto_resposta`). Caixa
//     sem a chave ligada não gasta um token sequer.
//   · Sem `ANTHROPIC_API_KEY` no ambiente, sai antes de qualquer I/O.
// =====================================================================

type Admin = SupabaseClient;

/** Fuso da operação (imobiliária em MG/SP), igual ao usado em triggers.ts. */
const TZ_OFFSET_MIN = -180; // UTC-3

/** A partir de quantas mensagens vale a pena gastar token gerando resumo. */
const MIN_MENSAGENS_PARA_RESUMO = 3;

/** Janela mínima entre duas auto-respostas na MESMA conversa (ms). */
const INTERVALO_AUTO_RESPOSTA_MS = 60 * 60 * 1000; // 1 hora

// ---------------------------------------------------------------------
// Resultados — sempre objeto, nunca exceção.
// ---------------------------------------------------------------------

export type TriagemResultado = {
  executada: boolean;
  /** Por que não rodou (ou o que rodou), em pt-BR, para log do webhook. */
  motivo: string;
  intencao?: IaIntencao;
  etiquetaAplicada?: string;
  equipeAtribuida?: string;
  resumiu?: boolean;
};

export type AutoRespostaResultado = {
  enviada: boolean;
  motivo: string;
  /** Como o despacho ao provedor terminou (null = não houve despacho). */
  entregue?: boolean | null;
};

// ---------------------------------------------------------------------
// ROTEAMENTO INTENÇÃO → EQUIPE (convenção, sem tabela nova)
// ---------------------------------------------------------------------

/**
 * CONVENÇÃO DE ROTEAMENTO — leia antes de renomear uma equipe.
 *
 * Não existe tabela de-para. A equipe que atende uma intenção é
 * descoberta por CONVENÇÃO, em duas camadas (a primeira vence):
 *
 *  1) MARCADOR EXPLÍCITO na descrição da equipe: escreva `ia:<intencao>`
 *     em qualquer ponto de `atendimento_teams.descricao`.
 *     Ex.: equipe "Time Azul", descrição "Plantão do fim de semana —
 *     ia:alugar" passa a receber tudo que a IA classificar como `alugar`.
 *     Use isto quando o nome da equipe não tem nada a ver com a intenção.
 *
 *  2) NOME DA EQUIPE: se o nome (sem acento, minúsculo) contiver uma das
 *     palavras-chave da intenção, a equipe é escolhida.
 *     Ex.: intenção `alugar` → equipe "Locação" casa por "locacao".
 *
 * Empate (duas equipes casam): vence a de nome mais curto, porque é a
 * mais específica ("Locação" antes de "Locação e Vendas Litoral").
 *
 * Intenção `outro` NUNCA roteia — é a cesta do "não deu para classificar",
 * e jogar isso numa equipe geraria atribuição errada em massa.
 */
const PALAVRAS_DA_INTENCAO: Record<IaIntencao, string[]> = {
  // "Vendas" fica em `comprar` de propósito: numa imobiliária o time de
  // vendas atende QUEM QUER COMPRAR. Quem quer vender fala com captação.
  comprar: ["comprar", "compra", "vendas", "comercial"],
  alugar: ["alugar", "aluguel", "locacao", "locatario", "locacoes"],
  vender: ["vender", "captacao", "captar", "proprietario", "proprietarios"],
  avaliar: ["avaliar", "avaliacao", "avaliacoes", "precificacao"],
  visita: ["visita", "visitas", "agendamento", "agenda"],
  financiamento: ["financiamento", "credito", "financeiro", "banco"],
  suporte: ["suporte", "posvenda", "pos-venda", "administrativo", "manutencao"],
  outro: [],
};

/** Cor da etiqueta criada no catálogo quando a intenção ainda não existe lá. */
const COR_DA_INTENCAO: Record<IaIntencao, string> = {
  comprar: "#3b82f6",
  alugar: "#10b981",
  vender: "#f59e0b",
  avaliar: "#14b8a6",
  visita: "#a855f7",
  financiamento: "#8b5cf6",
  suporte: "#ef4444",
  outro: "#6b7280",
};

/** Minúsculo, sem acento e sem pontuação — base de toda comparação daqui. */
function normalizar(texto: string): string {
  return texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

type EquipeRow = { id: string; nome: string; descricao: string | null };

/** Aplica a convenção documentada acima. Devolve null quando nada casa. */
function escolherEquipe(equipes: EquipeRow[], intencao: IaIntencao): EquipeRow | null {
  if (intencao === "outro") return null;

  // Camada 1 — marcador explícito na descrição.
  const marcador = `ia:${intencao}`;
  const explicitas = equipes.filter((e) => normalizar(e.descricao ?? "").includes(marcador));
  if (explicitas.length > 0) {
    return [...explicitas].sort((a, b) => a.nome.length - b.nome.length)[0];
  }

  // Camada 2 — palavra-chave no nome.
  const palavras = PALAVRAS_DA_INTENCAO[intencao];
  const porNome = equipes.filter((e) => {
    const nome = normalizar(e.nome);
    return palavras.some((p) => nome.includes(p));
  });
  if (porNome.length === 0) return null;
  return [...porNome].sort((a, b) => a.nome.length - b.nome.length)[0];
}

// ---------------------------------------------------------------------
// TRIAGEM
// ---------------------------------------------------------------------

type ConversaTriagem = {
  id: string;
  inbox_id: string | null;
  team_id: string | null;
  tags: string[] | null;
};

/**
 * Classifica a conversa, etiqueta, resume (quando já há conversa o
 * bastante) e roteia para a equipe da intenção.
 *
 * Chamada pelos webhooks logo depois de gravar a mensagem do cliente.
 */
export async function triagemAutomatica(
  admin: Admin,
  conversationId: string,
  opcoes: { conversaNova?: boolean } = {},
): Promise<TriagemResultado> {
  try {
    // Sem chave da Anthropic nada disso funciona — sai antes de qualquer I/O.
    if (!iaConfigurada()) {
      return { executada: false, motivo: "IA não configurada (sem ANTHROPIC_API_KEY)." };
    }

    // Triagem é, por definição, uma coisa que acontece UMA vez: classificar,
    // etiquetar e encaminhar. Rodá-la a cada mensagem gastaria token à toa e,
    // pior, somaria até 30 s de latência dentro do webhook — o Telegram
    // estouraria o timeout dele e reentregaria o update. Depois da primeira
    // vez só reprocessamos se a intenção ainda não tiver sido definida.
    if (opcoes.conversaNova === false) {
      const { data: jaClassificada } = await admin
        .from("conversations")
        .select("ia_intencao")
        .eq("id", conversationId)
        .maybeSingle();
      if ((jaClassificada as { ia_intencao?: string | null } | null)?.ia_intencao) {
        return { executada: false, motivo: "conversa já triada" };
      }
    }

    const { data: convRaw } = await admin
      .from("conversations")
      .select("id, inbox_id, team_id, tags")
      .eq("id", conversationId)
      .maybeSingle();
    const conversa = convRaw as ConversaTriagem | null;
    if (!conversa) return { executada: false, motivo: "Conversa não encontrada." };

    // Triagem é configuração DA CAIXA. Conversa sem caixa não tem onde ler
    // a preferência — e ligar por padrão gastaria token do cliente sem ele pedir.
    if (!conversa.inbox_id) {
      return { executada: false, motivo: "Conversa sem caixa de entrada — triagem não se aplica." };
    }

    const { data: caixa } = await admin
      .from("atendimento_inboxes")
      .select("ia_triagem")
      .eq("id", conversa.inbox_id)
      .maybeSingle();
    if (!caixa?.ia_triagem) {
      return { executada: false, motivo: "Triagem por IA desligada nesta caixa." };
    }

    // ---- 1) Intenção (a própria função grava conversations.ia_intencao) ----
    const r = await classificarIntencao(admin, conversationId);
    if (!r.ok) return { executada: false, motivo: `Falha ao classificar: ${r.erro}` };

    const intencao = ((INTENCOES as readonly string[]).includes(r.conteudo)
      ? r.conteudo
      : "outro") as IaIntencao;

    const resultado: TriagemResultado = {
      executada: true,
      motivo: "Triagem executada.",
      intencao,
      resumiu: false,
    };

    // ---- 2) Resumo — só quando já existe conversa de verdade --------------
    // Resumir uma conversa de uma frase custa token e devolve a própria frase.
    const { count: totalMensagens } = await admin
      .from("messages")
      .select("id", { count: "exact", head: true })
      .eq("conversation_id", conversationId)
      .eq("interna", false);

    if ((totalMensagens ?? 0) >= MIN_MENSAGENS_PARA_RESUMO) {
      const resumo = await resumirConversa(admin, conversationId);
      resultado.resumiu = resumo.ok;
    }

    // ---- 3) Etiqueta da intenção ------------------------------------------
    const etiqueta = await aplicarEtiquetaDaIntencao(admin, conversa, intencao);
    if (etiqueta) resultado.etiquetaAplicada = etiqueta;

    // ---- 4) Roteamento por intenção ---------------------------------------
    // Só roteia conversa SEM equipe: se um humano já direcionou, a IA não
    // desfaz a decisão dele.
    if (!conversa.team_id) {
      const { data: equipesRaw } = await admin
        .from("atendimento_teams")
        .select("id, nome, descricao");
      const equipe = escolherEquipe((equipesRaw ?? []) as EquipeRow[], intencao);
      if (equipe) {
        const { error } = await admin
          .from("conversations")
          .update({ team_id: equipe.id })
          .eq("id", conversationId);
        if (!error) {
          resultado.equipeAtribuida = equipe.nome;
          // Nota interna: o atendente precisa saber POR QUE a conversa caiu
          // na equipe dele — senão o roteamento automático vira mistério.
          await notaInterna(
            admin,
            conversationId,
            `🤖 Triagem automática: intenção detectada "${intencao}" — conversa encaminhada para a equipe "${equipe.nome}".`,
          );
        }
      }
    }

    return resultado;
  } catch (e) {
    // Engolir é proposital: ver cabeçalho do arquivo.
    return {
      executada: false,
      motivo: e instanceof Error ? e.message : "erro desconhecido na triagem",
    };
  }
}

/**
 * Garante a etiqueta da intenção no catálogo (`atendimento_labels`) e a
 * aplica em `conversations.tags`. Devolve o nome aplicado, ou null.
 */
async function aplicarEtiquetaDaIntencao(
  admin: Admin,
  conversa: ConversaTriagem,
  intencao: IaIntencao,
): Promise<string | null> {
  // "outro" não vira etiqueta: encheria a base de uma etiqueta que não
  // separa nada e ainda apareceria no topo do relatório de etiquetas.
  if (intencao === "outro") return null;

  const nome = intencao; // etiqueta = a própria palavra da intenção, minúscula

  // Catálogo: cria se não existir. `nome` é UNIQUE (0030), então uma corrida
  // entre dois webhooks resolve sozinha — o segundo insert falha e tudo bem.
  const { data: existente } = await admin
    .from("atendimento_labels")
    .select("id")
    .eq("nome", nome)
    .maybeSingle();
  if (!existente) {
    await admin
      .from("atendimento_labels")
      .insert({ nome, cor: COR_DA_INTENCAO[intencao] })
      .then(undefined, () => undefined);
  }

  const atuais = conversa.tags ?? [];
  if (atuais.some((t) => normalizar(t) === nome)) return nome; // já etiquetada

  const { error } = await admin
    .from("conversations")
    .update({ tags: [...atuais, nome] })
    .eq("id", conversa.id);
  return error ? null : nome;
}

// ---------------------------------------------------------------------
// AUTO-RESPOSTA
// ---------------------------------------------------------------------

type ConversaAuto = {
  id: string;
  canal: ConversationChannel;
  external_id: string | null;
  contato_telefone: string | null;
  channel_id: string | null;
  inbox_id: string | null;
};

/**
 * Responde o cliente SOZINHA quando não há humano para responder.
 *
 * Só dispara com `ia_auto_resposta` ligado na caixa E (fora do horário
 * comercial OU nenhum agente com disponibilidade "online").
 *
 * A trave de segurança é o coração desta função: sem ela, dois bots
 * conversando (ou um cliente com autoresponder de e-mail) geram um
 * ping-pong infinito que só para quando alguém percebe a conta da API.
 */
export async function autoResposta(
  admin: Admin,
  conversationId: string,
): Promise<AutoRespostaResultado> {
  try {
    if (!iaConfigurada()) {
      return { enviada: false, motivo: "IA não configurada (sem ANTHROPIC_API_KEY)." };
    }

    const { data: convRaw } = await admin
      .from("conversations")
      .select("id, canal, external_id, contato_telefone, channel_id, inbox_id")
      .eq("id", conversationId)
      .maybeSingle();
    const conversa = convRaw as ConversaAuto | null;
    if (!conversa) return { enviada: false, motivo: "Conversa não encontrada." };
    if (!conversa.inbox_id) {
      return { enviada: false, motivo: "Conversa sem caixa — auto-resposta não se aplica." };
    }

    const { data: caixa } = await admin
      .from("atendimento_inboxes")
      .select("ia_auto_resposta")
      .eq("id", conversa.inbox_id)
      .maybeSingle();
    if (!caixa?.ia_auto_resposta) {
      return { enviada: false, motivo: "Auto-resposta desligada nesta caixa." };
    }

    // ---- Gatilho: fora do expediente OU sem ninguém online ---------------
    const fora = await foraDoExpediente(admin, conversa.inbox_id);
    const agentes = await agentesOnline(admin);
    if (!fora && agentes > 0) {
      return {
        enviada: false,
        motivo: `Dentro do expediente e com ${agentes} agente(s) online — quem responde é gente.`,
      };
    }
    const gatilho = fora ? "fora do horário comercial" : "nenhum agente disponível";

    // ---- TRAVE DE SEGURANÇA ----------------------------------------------
    const trava = await travaDeSeguranca(admin, conversationId);
    if (trava) return { enviada: false, motivo: trava };

    // ---- Gera a sugestão --------------------------------------------------
    const sugestao = await sugerirResposta(admin, conversationId);
    if (!sugestao.ok) {
      return { enviada: false, motivo: `Falha ao gerar a resposta: ${sugestao.erro}` };
    }
    const texto = sugestao.conteudo.trim();
    if (!texto) return { enviada: false, motivo: "A IA devolveu resposta vazia." };

    // ---- Entrega ao cliente -----------------------------------------------
    // Chat do site é a exceção: o widget lê o histórico por polling direto do
    // banco, então gravar a mensagem JÁ É a entrega. Mandar para `enviarMensagem`
    // cairia no despacho legado e voltaria erro numa entrega que deu certo.
    let entregue: boolean | null = null;
    let status: "enviada" | "falha" = "enviada";
    if (conversa.canal !== "site") {
      const destino = conversa.contato_telefone ?? conversa.external_id ?? "";
      const envio = await enviarMensagem(admin, {
        canal: conversa.canal,
        channelId: conversa.channel_id,
        destino,
        conversationId,
        texto,
      });
      entregue = envio.ok;
      status = envio.ok ? "enviada" : "falha";
    }

    const { error: msgErr } = await admin.from("messages").insert({
      conversation_id: conversationId,
      direcao: "out",
      // 'ia' é o que distingue a auto-resposta da resposta de um atendente
      // — inclusive para a própria trave de segurança logo acima.
      remetente: "ia",
      autor_id: null,
      tipo: "texto",
      conteudo: texto,
      interna: false,
      status,
    });
    if (msgErr) return { enviada: false, motivo: `Falha ao gravar a mensagem: ${msgErr.message}` };

    // Denormaliza o inbox. `primeira_resposta_em` fica INTOCADO de propósito:
    // marcar a fala do bot como primeira resposta zeraria o SLA da equipe e
    // o relatório passaria a mentir que o humano respondeu em segundos.
    await admin
      .from("conversations")
      .update({
        last_message_at: new Date().toISOString(),
        last_message_preview: texto.slice(0, 140),
      })
      .eq("id", conversationId);

    // Toda auto-resposta deixa rastro para a equipe.
    await notaInterna(
      admin,
      conversationId,
      `🤖 Resposta automática enviada pela IA (motivo: ${gatilho}).` +
        (entregue === false ? " ATENÇÃO: o provedor recusou a entrega." : "") +
        " Revise antes de continuar o atendimento.",
    );

    return { enviada: true, motivo: `Auto-resposta enviada (${gatilho}).`, entregue };
  } catch (e) {
    return {
      enviada: false,
      motivo: e instanceof Error ? e.message : "erro desconhecido na auto-resposta",
    };
  }
}

/**
 * As duas travas contra loop de bot. Devolve o MOTIVO do bloqueio, ou
 * null quando está liberado.
 *
 *  1) no máximo 1 auto-resposta por conversa por hora;
 *  2) nunca duas auto-respostas seguidas sem o cliente falar no meio.
 */
async function travaDeSeguranca(admin: Admin, conversationId: string): Promise<string | null> {
  // (1) Última fala da IA nesta conversa.
  const { data: ultimaIa } = await admin
    .from("messages")
    .select("created_at")
    .eq("conversation_id", conversationId)
    .eq("remetente", "ia")
    .eq("interna", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (ultimaIa?.created_at) {
    const desde = Date.now() - new Date(ultimaIa.created_at as string).getTime();
    if (desde < INTERVALO_AUTO_RESPOSTA_MS) {
      const min = Math.max(1, Math.round((INTERVALO_AUTO_RESPOSTA_MS - desde) / 60_000));
      return `Já houve auto-resposta nesta conversa há menos de 1 h (libera em ~${min} min).`;
    }
  }

  // (2) A última mensagem visível tem que ser do CLIENTE. Se for nossa
  //     (IA, atendente ou sistema), responder de novo é falar sozinho.
  const { data: ultima } = await admin
    .from("messages")
    .select("direcao, remetente")
    .eq("conversation_id", conversationId)
    .eq("interna", false)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!ultima) return "Conversa sem mensagens.";
  if (ultima.direcao !== "in" || ultima.remetente !== "cliente") {
    return "A última mensagem não é do cliente — a IA não responde duas vezes seguidas.";
  }

  return null;
}

/** Nota interna do sistema — best-effort, nunca derruba o fluxo. */
async function notaInterna(admin: Admin, conversationId: string, texto: string): Promise<void> {
  await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "out",
      remetente: "sistema",
      autor_id: null,
      tipo: "texto",
      conteudo: texto,
      interna: true,
      status: "enviada",
    })
    .then(undefined, () => undefined);
}

/**
 * Estamos FORA do expediente da caixa?
 *
 * Só devolve `true` quando dá para AFIRMAR isso: caixa sem expediente
 * cadastrado devolve `false` (desconhecido), porque tratar "não sei" como
 * "está fechado" faria o bot responder no meio do dia de trabalho.
 */
async function foraDoExpediente(admin: Admin, inboxId: string): Promise<boolean> {
  const { data } = await admin
    .from("atendimento_business_hours")
    .select("dia_semana, aberto, abre, fecha")
    .eq("inbox_id", inboxId);

  const linhas = (data ?? []) as {
    dia_semana: number;
    aberto: boolean;
    abre: string;
    fecha: string;
  }[];
  if (linhas.length === 0) return false;

  // "Agora" no fuso da operação, independente do TZ do container.
  const agora = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
  const hoje = linhas.find((d) => d.dia_semana === agora.getUTCDay());
  if (!hoje || !hoje.aberto) return true;

  const emMinutos = (hhmm: string) => {
    const [h, m] = (hhmm ?? "").split(":");
    return Number(h ?? 0) * 60 + Number(m ?? 0);
  };
  const minutosAgora = agora.getUTCHours() * 60 + agora.getUTCMinutes();
  return minutosAgora < emMinutos(hoje.abre) || minutosAgora >= emMinutos(hoje.fecha);
}

/** Quantos agentes do atendimento estão com disponibilidade "online". */
async function agentesOnline(admin: Admin): Promise<number> {
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("ativo", true)
    .eq("disponibilidade", "online")
    .or("atendimento_access.eq.true,is_admin_central.eq.true");
  return count ?? 0;
}
