import type { SupabaseClient } from "@supabase/supabase-js";
import { assinarCorpo } from "@/lib/atendimento/webhooks-out";
import { hashToken } from "@/lib/atendimento/api-tokens";

// =====================================================================
// AGENT BOTS — o motor.
//
// O QUE É: o equivalente ao "Agent Bot" do Chatwoot. Um sistema de fora
// (n8n, Dialogflow, script caseiro) é registrado como se fosse um agente
// de uma CAIXA DE ENTRADA. Toda mensagem que o cliente manda naquela
// caixa é POSTada para a `outgoing_url` do bot; o bot responde chamando
// a nossa API (/api/bot/v1/*) de volta com o token dele.
//
// POR QUE O DESENHO É IGUAL AO DE webhooks-out.ts: é o mesmo problema.
// Um endpoint de terceiro no meio do caminho de recebimento de mensagem
// não pode derrubar o recebimento. Então valem as mesmas três regras:
//
//   · NUNCA lança. Quem chama é o handler do webhook de ENTRADA, que
//     precisa devolver 200 para o provedor (senão o WhatsApp/Telegram
//     fica reentregando a mesma mensagem para sempre).
//   · Cada tentativa vira uma linha em `atendimento_bot_deliveries`, para
//     dar para depurar do lado de cá quando o integrador jurar que "não
//     chegou nada".
//   · Depois de LIMITE_FALHAS_BOT erros seguidos o bot é desligado
//     sozinho. Sem isso, um bot morto adiciona 10 s de espera em TODA
//     mensagem que entra na caixa dele.
//
// O HANDOFF (bot → humano) é o que diferencia isto de um webhook comum.
// `conversations.bot_status` manda:
//   'sem_bot'     → a caixa não tem bot; nada acontece.
//   'ativo'       → o bot está conduzindo; entregamos as mensagens a ele.
//   'transferida' → um humano assumiu; PARAMOS de entregar. É a trava que
//                   impede o bot de continuar falando por cima do
//                   atendente e confundir o cliente.
//
// Como o bot confere a assinatura do que recebe (Node):
//   const esperado = "sha256=" + crypto
//     .createHmac("sha256", SECRET_DO_BOT)
//     .update(corpoBrutoDaRequisicao)   // o texto CRU, não o JSON.parse
//     .digest("hex");
//   crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(header));
// =====================================================================

/** Erros seguidos até o bot ser desligado automaticamente. */
export const LIMITE_FALHAS_BOT = 10;

/** Tempo máximo esperando o bot responder o POST de entrega. */
const TIMEOUT_MS = 10_000;

/** Linha mínima de `atendimento_agent_bots` necessária para entregar. */
export type BotAlvo = {
  id: string;
  outgoing_url: string;
  secret: string;
  falhas_seguidas: number;
};

export type ResultadoEntregaBot = {
  ok: boolean;
  /** Status HTTP devolvido pelo bot, ou null se nem chegou a responder. */
  status: number | null;
  duracao_ms: number;
  erro: string | null;
};

/**
 * A mensagem, como o motor precisa vê-la. É de propósito um subconjunto
 * de `Message`: quem chama monta este objeto com o que já tem em mãos, e
 * assim fica impossível vazar `raw_payload` por descuido.
 */
export type MensagemParaBot = {
  id: string | null;
  direcao: "in" | "out";
  remetente: string;
  tipo: string;
  texto: string | null;
  mediaUrl?: string | null;
  mediaNome?: string | null;
  mediaMime?: string | null;
  criadaEm?: string | null;
  /** Nota interna NUNCA vai para o bot — ver `entregarAoBot`. */
  interna?: boolean;
};

/** Colunas da conversa que o motor lê. Lista fechada, ver "LISTA BRANCA". */
type ConversaBot = {
  id: string;
  canal: string;
  status: string;
  prioridade: string | null;
  tags: string[] | null;
  inbox_id: string | null;
  channel_id: string | null;
  lead_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  bot_status: string;
  bot_id: string | null;
  created_at: string;
  custom_attributes: Record<string, unknown> | null;
};

const COLUNAS_CONVERSA =
  "id, canal, status, prioridade, tags, inbox_id, channel_id, lead_id, " +
  "contato_nome, contato_telefone, bot_status, bot_id, created_at, custom_attributes";

// =====================================================================
// LISTA BRANCA DO PAYLOAD
//
// O bot é um sistema de TERCEIRO. Ele recebe o que precisa para
// responder o cliente e NADA além disso. Ficam de fora, sempre:
//
//   · `raw_payload` da mensagem — carrega o corpo cru do provedor e às
//     vezes credencial dentro dele;
//   · qualquer token: `atendimento_api_tokens`, `widget_token` da caixa,
//     `contact_token` da sessão do widget (quem tem esse token lê a
//     conversa inteira pelo endpoint público);
//   · `webhook_secret` / `secret` de canal ou de webhook;
//   · NOTA INTERNA — é conversa da equipe. Um bot que lê nota interna é
//     um vazamento com cara de recurso.
//
// Se um dia alguém precisar de um campo novo aqui, ACRESCENTE
// explicitamente. Nunca troque isto por um spread da linha do banco.
// =====================================================================

function montarPayloadBot(conversa: ConversaBot, mensagem: MensagemParaBot, contato: ContatoBot) {
  return {
    evento: "mensagem" as const,
    enviado_em: new Date().toISOString(),
    conversa: {
      id: conversa.id,
      canal: conversa.canal,
      status: conversa.status,
      prioridade: conversa.prioridade,
      etiquetas: conversa.tags ?? [],
      inbox_id: conversa.inbox_id,
      bot_status: conversa.bot_status,
      criada_em: conversa.created_at,
      atributos: conversa.custom_attributes ?? {},
    },
    contato: {
      id: contato.id,
      nome: contato.nome,
      telefone: contato.telefone,
      email: contato.email,
    },
    mensagem: {
      id: mensagem.id,
      direcao: mensagem.direcao,
      remetente: mensagem.remetente,
      tipo: mensagem.tipo,
      texto: mensagem.texto,
      media_url: mensagem.mediaUrl ?? null,
      media_nome: mensagem.mediaNome ?? null,
      media_mime: mensagem.mediaMime ?? null,
      criada_em: mensagem.criadaEm ?? null,
    },
  };
}

type ContatoBot = {
  id: string | null;
  nome: string | null;
  telefone: string | null;
  email: string | null;
};

// =====================================================================
// Resolução da caixa e do bot
// =====================================================================

/**
 * Qual caixa atende esta conversa?
 *
 * `conversations.inbox_id` é a resposta certa — mas só o chat do site o
 * preenche hoje; WhatsApp, Telegram, e-mail e SMS abrem a conversa sem
 * caixa. Se parássemos aí, o recurso só funcionaria no widget.
 *
 * O plano B casa a conversa com a caixa pelo `channel_id` (a caixa
 * aponta para a conexão em `atendimento_inboxes.channel_id`). É a mesma
 * ligação que o usuário faz na tela de Caixas de entrada, então não há
 * adivinhação: ou a caixa está amarrada àquela conexão, ou não está.
 */
async function inboxDaConversa(
  admin: SupabaseClient,
  conversa: Pick<ConversaBot, "inbox_id" | "channel_id">,
): Promise<string | null> {
  if (conversa.inbox_id) return conversa.inbox_id;
  if (!conversa.channel_id) return null;
  const { data } = await admin
    .from("atendimento_inboxes")
    .select("id")
    .eq("channel_id", conversa.channel_id)
    .eq("ativo", true)
    .limit(1)
    .maybeSingle();
  return (data as { id: string } | null)?.id ?? null;
}

/** O bot ATIVO amarrado a esta caixa, ou null. Uma caixa tem no máximo um. */
async function botDaCaixa(admin: SupabaseClient, inboxId: string): Promise<BotAlvo | null> {
  const { data: vinculo } = await admin
    .from("atendimento_inbox_bots")
    .select("bot_id")
    .eq("inbox_id", inboxId)
    .maybeSingle();
  const botId = (vinculo as { bot_id: string } | null)?.bot_id;
  if (!botId) return null;

  const { data: bot } = await admin
    .from("atendimento_agent_bots")
    .select("id, outgoing_url, secret, falhas_seguidas")
    .eq("id", botId)
    .eq("ativo", true)
    .maybeSingle();
  return (bot as BotAlvo | null) ?? null;
}

// =====================================================================
// 1) Ativação — a conversa nasceu numa caixa com bot
// =====================================================================

/**
 * Marca a conversa como conduzida pelo bot da caixa dela.
 *
 * Chame NA CRIAÇÃO da conversa, junto de `dispararAutomacoes`. Se a
 * caixa não tem bot (ou o bot está desligado), não faz nada e a conversa
 * fica em 'sem_bot' — o padrão da coluna.
 *
 * Nunca lança e nunca sobrescreve um handoff: se a conversa já foi
 * 'transferida' para um humano, ela NÃO volta para o bot só porque o
 * cliente escreveu de novo. Quem devolve ao bot é gente, à mão.
 */
export async function ativarBotNaConversa(
  admin: SupabaseClient,
  conversationId: string,
): Promise<string | null> {
  try {
    const { data } = await admin
      .from("conversations")
      .select("id, inbox_id, channel_id, bot_status")
      .eq("id", conversationId)
      .maybeSingle();
    const conversa = data as Pick<ConversaBot, "inbox_id" | "channel_id" | "bot_status"> | null;
    if (!conversa) return null;
    // Só saímos de 'sem_bot'. 'ativo' já está ativo; 'transferida' é sagrado.
    if (conversa.bot_status !== "sem_bot") return null;

    const inboxId = await inboxDaConversa(admin, conversa);
    if (!inboxId) return null;

    const bot = await botDaCaixa(admin, inboxId);
    if (!bot) return null;

    await admin
      .from("conversations")
      .update({ bot_status: "ativo", bot_id: bot.id })
      .eq("id", conversationId);

    return bot.id;
  } catch {
    /* silencioso de propósito — ver cabeçalho do arquivo */
    return null;
  }
}

// =====================================================================
// 2) Entrega — o cliente falou, o bot precisa saber
// =====================================================================

/**
 * Entrega UMA mensagem ao bot da conversa: POST assinado, log da
 * tentativa e atualização do estado do bot. Nunca lança.
 *
 * Só entrega quando as DUAS condições valem:
 *   · a caixa da conversa tem um bot ativo, e
 *   · `conversations.bot_status === 'ativo'` (ou seja, ninguém assumiu).
 *
 * Fora disso volta em silêncio — inclusive para nota interna, que jamais
 * sai daqui.
 */
export async function entregarAoBot(
  admin: SupabaseClient,
  conversationId: string,
  mensagem: MensagemParaBot,
): Promise<ResultadoEntregaBot | null> {
  try {
    // Nota interna é conversa da equipe: nem chega a consultar o banco.
    if (mensagem.interna) return null;

    const { data } = await admin
      .from("conversations")
      .select(COLUNAS_CONVERSA)
      .eq("id", conversationId)
      .maybeSingle();
    const conversa = data as ConversaBot | null;
    if (!conversa) return null;

    // A trava do handoff. 'transferida' e 'sem_bot' não entregam.
    if (conversa.bot_status !== "ativo") return null;

    const inboxId = await inboxDaConversa(admin, conversa);
    if (!inboxId) return null;

    // Resolvemos pela CAIXA e não por `conversations.bot_id` de propósito:
    // se a diretoria trocar o bot da caixa, a conversa em andamento passa a
    // ser entregue ao bot novo em vez de continuar batendo num bot que já
    // não atende mais aquela caixa.
    const bot = await botDaCaixa(admin, inboxId);
    if (!bot) return null;

    const contato = await carregarContato(admin, conversa);
    const payload = montarPayloadBot(conversa, mensagem, contato);
    const corpo = JSON.stringify(payload);
    const inicio = Date.now();

    let status: number | null = null;
    let erro: string | null = null;

    try {
      const resposta = await fetch(bot.outgoing_url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Arini-Signature": assinarCorpo(bot.secret, corpo),
          "X-Arini-Bot": bot.id,
          "X-Arini-Evento": "mensagem",
        },
        body: corpo,
        // AbortSignal.timeout evita ficar pendurado num bot que aceita a
        // conexão e nunca responde — seguraria a resposta ao provedor.
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      status = resposta.status;
      if (!resposta.ok) {
        // Só o começo do corpo: a resposta de erro pode ser um HTML gigante.
        const texto = await resposta.text().catch(() => "");
        erro = `HTTP ${resposta.status}${texto ? ` — ${texto.slice(0, 300)}` : ""}`;
      }
    } catch (e) {
      // TimeoutError, DNS, TLS, connection refused... tudo cai aqui.
      erro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
    }

    const duracao_ms = Date.now() - inicio;
    const ok = erro == null;

    await registrarEntrega(admin, bot, {
      conversationId,
      payload,
      status,
      erro,
      duracao_ms,
      desativarAposFalhas: true,
    });

    return { ok, status, duracao_ms, erro };
  } catch {
    /* silencioso de propósito — ver cabeçalho do arquivo */
    return null;
  }
}

/**
 * Bookkeeping da entrega: grava a tentativa e atualiza o estado do bot.
 * Separado porque a rota de teste manual reusa isto com
 * `desativarAposFalhas: false` — quem está testando está justamente
 * consertando a integração, seria hostil desligar o bot por causa disso.
 *
 * Engole erro de banco de propósito: a entrega em si já aconteceu e não
 * pode virar exceção para quem chamou.
 */
async function registrarEntrega(
  admin: SupabaseClient,
  bot: BotAlvo,
  info: {
    conversationId: string | null;
    payload: unknown;
    status: number | null;
    erro: string | null;
    duracao_ms: number;
    desativarAposFalhas: boolean;
  },
): Promise<void> {
  try {
    await admin.from("atendimento_bot_deliveries").insert({
      bot_id: bot.id,
      conversation_id: info.conversationId,
      payload: info.payload,
      status: info.status,
      erro: info.erro,
      duracao_ms: info.duracao_ms,
    });

    const falhas = info.erro == null ? 0 : (bot.falhas_seguidas ?? 0) + 1;
    const estourou = info.desativarAposFalhas && falhas >= LIMITE_FALHAS_BOT;
    await admin
      .from("atendimento_agent_bots")
      .update({
        ultimo_status: info.status,
        ultimo_erro: estourou
          ? `Desativado automaticamente após ${falhas} falhas seguidas. Último erro: ${info.erro ?? "desconhecido"}`
          : info.erro,
        ultimo_envio_em: new Date().toISOString(),
        falhas_seguidas: falhas,
        ...(estourou ? { ativo: false } : {}),
      })
      .eq("id", bot.id);
  } catch {
    /* auditoria da entrega é best-effort */
  }
}

/**
 * Entrega avulsa usada pelo botão "Testar" da tela de configuração.
 * Mesmo caminho de rede e mesma assinatura da entrega real — a diferença
 * é o payload de exemplo e não desligar o bot por falha.
 */
export async function entregarTeste(
  admin: SupabaseClient,
  bot: BotAlvo,
  payload: Record<string, unknown>,
): Promise<ResultadoEntregaBot> {
  const corpo = JSON.stringify(payload);
  const inicio = Date.now();

  let status: number | null = null;
  let erro: string | null = null;

  try {
    const resposta = await fetch(bot.outgoing_url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arini-Signature": assinarCorpo(bot.secret, corpo),
        "X-Arini-Bot": bot.id,
        "X-Arini-Evento": "teste",
      },
      body: corpo,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = resposta.status;
    if (!resposta.ok) {
      const texto = await resposta.text().catch(() => "");
      erro = `HTTP ${resposta.status}${texto ? ` — ${texto.slice(0, 300)}` : ""}`;
    }
  } catch (e) {
    erro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  const duracao_ms = Date.now() - inicio;
  await registrarEntrega(admin, bot, {
    conversationId: null,
    payload,
    status,
    erro,
    duracao_ms,
    desativarAposFalhas: false,
  });

  return { ok: erro == null, status, duracao_ms, erro };
}

/** Dados do contato para o payload — só nome/telefone/e-mail. */
async function carregarContato(admin: SupabaseClient, conversa: ConversaBot): Promise<ContatoBot> {
  const base: ContatoBot = {
    id: conversa.lead_id,
    nome: conversa.contato_nome,
    telefone: conversa.contato_telefone,
    email: null,
  };
  if (!conversa.lead_id) return base;
  try {
    const { data } = await admin
      .from("leads")
      // Lista fechada: a ficha do lead tem muito mais coisa (valores de
      // negociação, anotações internas) que não é da conta do bot.
      .select("id, nome, telefone, whatsapp, email")
      .eq("id", conversa.lead_id)
      .maybeSingle();
    const lead = data as {
      id: string;
      nome: string | null;
      telefone: string | null;
      whatsapp: string | null;
      email: string | null;
    } | null;
    if (!lead) return base;
    return {
      id: lead.id,
      nome: lead.nome ?? base.nome,
      telefone: lead.whatsapp ?? lead.telefone ?? base.telefone,
      email: lead.email,
    };
  } catch {
    return base;
  }
}

// =====================================================================
// 3) Handoff — o bot passa a bola para um humano
// =====================================================================

export type ResultadoTransferencia = { ok: boolean; erro?: string };

/**
 * Encerra a condução do bot e devolve a conversa à equipe.
 *
 * Depois disto `entregarAoBot` para de entregar naquela conversa — é o
 * ponto inteiro do recurso. A nota interna registrada aqui é o que faz o
 * atendente entender, ao abrir a conversa, POR QUE ela caiu no colo dele
 * (o bot não achou resposta? o cliente pediu humano? deu erro?).
 *
 * Nunca lança.
 */
export async function transferirParaHumano(
  admin: SupabaseClient,
  conversationId: string,
  motivo?: string | null,
): Promise<ResultadoTransferencia> {
  try {
    const agora = new Date().toISOString();
    const { data, error } = await admin
      .from("conversations")
      .update({
        bot_status: "transferida",
        bot_transferida_em: agora,
        // Transferir para humano reabre: uma conversa adiada/resolvida que
        // volta para a equipe precisa aparecer na caixa de novo.
        status: "aberta",
        snoozed_until: null,
      })
      .eq("id", conversationId)
      .select("id, bot_id")
      .maybeSingle();

    if (error) return { ok: false, erro: error.message };
    if (!data) return { ok: false, erro: "conversa não encontrada" };

    const texto = motivo?.trim()
      ? `O bot transferiu esta conversa para a equipe. Motivo: ${motivo.trim()}`
      : "O bot transferiu esta conversa para a equipe.";

    // Nota INTERNA: é recado para o time, não pode sair para o cliente.
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direcao: "out",
      remetente: "sistema",
      tipo: "texto",
      conteudo: texto,
      interna: true,
      status: "enviada",
      bot_id: (data as { bot_id: string | null }).bot_id,
    });

    return { ok: true };
  } catch (e) {
    return { ok: false, erro: e instanceof Error ? e.message : "falha ao transferir" };
  }
}

// =====================================================================
// 4) Autenticação da API que o bot consome
// =====================================================================

/** O bot, como a API /api/bot/v1 precisa vê-lo. */
export type BotAutenticado = {
  id: string;
  nome: string;
  outgoing_url: string;
};

/**
 * `Authorization: Bearer <token do bot>` → linha de `atendimento_agent_bots`.
 *
 * Guardamos só o sha256 do token (mesmo desenho de `api-tokens.ts`), então
 * a comparação é: hash do que veio no header × `token_hash` da tabela. Um
 * índice unique cuida do resto — não há varredura nem comparação em
 * memória de segredo nenhum.
 *
 * Bot desativado NÃO autentica. Isso inclui o bot que se auto-desligou por
 * acumular falhas: se não conseguimos falar com ele, não faz sentido ele
 * continuar escrevendo nas conversas como se estivesse conduzindo.
 *
 * Devolve null em qualquer falha — a rota transforma isso num 401
 * genérico, sem dizer se o token não existe, expirou ou está desligado.
 */
export async function autenticarBot(
  admin: SupabaseClient,
  req: Request,
): Promise<BotAutenticado | null> {
  try {
    const header = req.headers.get("authorization");
    if (!header) return null;
    const token = header.replace(/^Bearer\s+/i, "").trim();
    if (!token) return null;

    const { data } = await admin
      .from("atendimento_agent_bots")
      .select("id, nome, outgoing_url")
      .eq("token_hash", hashToken(token))
      .eq("ativo", true)
      .maybeSingle();

    return (data as BotAutenticado | null) ?? null;
  } catch {
    return null;
  }
}

/**
 * A conversa pertence a uma caixa DESTE bot?
 *
 * É a trava de isolamento da API pública do bot: sem ela, qualquer bot
 * cadastrado leria e escreveria em qualquer conversa da operação só por
 * saber um id. Devolve a conversa quando pode, null quando não.
 */
export async function conversaDoBot(
  admin: SupabaseClient,
  botId: string,
  conversationId: string,
): Promise<ConversaBot | null> {
  try {
    if (!conversationId) return null;
    const { data } = await admin
      .from("conversations")
      .select(COLUNAS_CONVERSA)
      .eq("id", conversationId)
      .maybeSingle();
    const conversa = data as ConversaBot | null;
    if (!conversa) return null;

    const inboxId = await inboxDaConversa(admin, conversa);
    if (!inboxId) return null;

    const { data: vinculo } = await admin
      .from("atendimento_inbox_bots")
      .select("bot_id")
      .eq("inbox_id", inboxId)
      .maybeSingle();

    if ((vinculo as { bot_id: string } | null)?.bot_id !== botId) return null;
    return conversa;
  } catch {
    return null;
  }
}

/** Re-exporta o tipo da conversa para as rotas não redeclararem as colunas. */
export type ConversaDoBot = ConversaBot;
