import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { getFileUrl } from "@/lib/telegram";
import { guardarMidiaRecebida } from "@/lib/atendimento/media-inbound";
import { dispararAutomacoes } from "@/lib/atendimento/triggers";
import { ativarBotNaConversa, entregarAoBot } from "@/lib/atendimento/bots";
import { autoResposta, triagemAutomatica } from "@/lib/atendimento/ia-triagem";
import {
  emitirContatoCriado,
  emitirConversaCriada,
  emitirMensagemCriada,
} from "@/lib/atendimento/webhook-eventos";
import type { MessageTipo } from "@/lib/types";

type Admin = ReturnType<typeof createSupabaseAdmin>;

// =====================================================================
// Webhook do Telegram (Bot API).
//
// Mesma estrutura do webhook da Evolution: acha o canal → valida o
// segredo → acha-ou-cria conversa/lead → grava a mensagem → denormaliza
// o inbox → dispara as automações.
//
// Duas diferenças que mudam o desenho em relação ao WhatsApp:
//
//  1) O Telegram NÃO diz qual bot recebeu o update — só manda o conteúdo.
//     Por isso a URL registrada no setWebhook carrega `?canal=<id>`: é ele
//     que identifica o canal. Como querystring é forjável, o segredo do
//     header X-Telegram-Bot-Api-Secret-Token continua sendo a única prova
//     de autenticidade, e é conferido em tempo constante.
//
//  2) O Telegram NÃO fornece telefone do contato. Logo `contato_telefone`
//     fica nulo e o dedupe do lead NÃO pode ser por telefone (isso juntaria
//     contatos diferentes). Deduplicamos por leads.external_id, usando a
//     chave "telegram:<chat_id>".
// =====================================================================

/** Prefixo do external_id do lead — evita colidir com ids de outras redes. */
const LEAD_PREFIX = "telegram:";

type TelegramFile = {
  file_id?: string;
  file_name?: string;
  mime_type?: string;
};

type TelegramUser = {
  id?: number;
  first_name?: string;
  last_name?: string;
  username?: string;
  is_bot?: boolean;
};

type TelegramMessage = {
  message_id?: number;
  from?: TelegramUser;
  chat?: TelegramUser & { type?: string; title?: string };
  date?: number;
  text?: string;
  caption?: string;
  photo?: TelegramFile[];
  video?: TelegramFile;
  audio?: TelegramFile;
  voice?: TelegramFile;
  video_note?: TelegramFile;
  document?: TelegramFile;
  sticker?: TelegramFile;
  location?: { latitude?: number; longitude?: number };
  contact?: { phone_number?: string; first_name?: string; last_name?: string };
};

type TelegramUpdate = {
  update_id?: number;
  message?: TelegramMessage;
  edited_message?: TelegramMessage;
};

type CanalRow = {
  id: string;
  canal: string;
  config: Record<string, string | undefined>;
};

/** Compara o segredo em tempo constante (evita descobrir por temporização). */
function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const a = Buffer.from(recebido.trim());
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** Nome legível do contato: "Nome Sobrenome", ou @usuario, ou o id do chat. */
function nomeDoContato(chat: TelegramMessage["chat"], from: TelegramUser | undefined): string | null {
  const fonte = chat?.first_name || chat?.username ? chat : from;
  if (!fonte) return null;
  const completo = [fonte.first_name, fonte.last_name].filter(Boolean).join(" ").trim();
  if (completo) return completo;
  if (fonte.username) return `@${fonte.username}`;
  return null;
}

type ConteudoTelegram = {
  texto: string | null;
  tipo: MessageTipo;
  fileId: string | null;
  mediaNome: string | null;
  mediaMime: string | null;
};

/**
 * Traduz a mensagem do Telegram para o formato do inbox. Só extrai o
 * `file_id`: a URL de download exige uma chamada extra (getFile) e só é
 * feita quando realmente há mídia, para não gastar round-trip à toa.
 */
function extrairConteudo(msg: TelegramMessage): ConteudoTelegram {
  const vazio: ConteudoTelegram = {
    texto: null,
    tipo: "texto",
    fileId: null,
    mediaNome: null,
    mediaMime: null,
  };

  if (typeof msg.text === "string" && msg.text.trim()) {
    return { ...vazio, texto: msg.text };
  }

  const legenda = typeof msg.caption === "string" ? msg.caption : null;

  // Foto vem como um array de tamanhos; o último é o de maior resolução.
  if (Array.isArray(msg.photo) && msg.photo.length > 0) {
    const maior = msg.photo[msg.photo.length - 1];
    return {
      texto: legenda,
      tipo: "imagem",
      fileId: maior?.file_id ?? null,
      mediaNome: null,
      mediaMime: "image/jpeg",
    };
  }

  // Sticker é imagem para efeito de atendimento (webp/tgs).
  if (msg.sticker?.file_id) {
    return { texto: legenda, tipo: "imagem", fileId: msg.sticker.file_id, mediaNome: null, mediaMime: msg.sticker.mime_type ?? "image/webp" };
  }

  // Áudio (arquivo) e voz (nota de voz) caem no mesmo tipo do inbox.
  const audio = msg.voice ?? msg.audio;
  if (audio?.file_id) {
    return {
      texto: legenda,
      tipo: "audio",
      fileId: audio.file_id,
      mediaNome: audio.file_name ?? null,
      mediaMime: audio.mime_type ?? "audio/ogg",
    };
  }

  const video = msg.video ?? msg.video_note;
  if (video?.file_id) {
    return {
      texto: legenda,
      tipo: "video",
      fileId: video.file_id,
      mediaNome: video.file_name ?? null,
      mediaMime: video.mime_type ?? "video/mp4",
    };
  }

  if (msg.document?.file_id) {
    return {
      texto: legenda,
      tipo: "documento",
      fileId: msg.document.file_id,
      mediaNome: msg.document.file_name ?? null,
      mediaMime: msg.document.mime_type ?? "application/octet-stream",
    };
  }

  if (msg.location) {
    const { latitude, longitude } = msg.location;
    return { ...vazio, texto: `📍 Localização: https://maps.google.com/?q=${latitude},${longitude}` };
  }

  if (msg.contact) {
    const nome = [msg.contact.first_name, msg.contact.last_name].filter(Boolean).join(" ");
    return { ...vazio, texto: `👤 Contato: ${nome} ${msg.contact.phone_number ?? ""}`.trim() };
  }

  return vazio;
}

export async function POST(req: Request) {
  let payload: TelegramUpdate;
  try {
    payload = (await req.json()) as TelegramUpdate;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  // O canal vem da querystring porque o Telegram não identifica o bot.
  const canalId = new URL(req.url).searchParams.get("canal");
  if (!canalId) return NextResponse.json({ error: "canal não informado" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: canalRow } = await admin
    .from("atendimento_channels")
    .select("id, canal, config")
    .eq("id", canalId)
    .eq("provedor", "telegram_bot")
    .maybeSingle();

  const canal = canalRow as CanalRow | null;
  if (!canal) return NextResponse.json({ ok: true, ignored: "canal desconhecido" });

  // O segredo é obrigatório: sem ele, qualquer um que descubra o id do
  // canal conseguiria injetar mensagem falsa no inbox.
  const esperado = canal.config.webhook_secret;
  if (!esperado) {
    return NextResponse.json({ error: "canal sem segredo de webhook — reconecte" }, { status: 401 });
  }
  if (!segredoConfere(req.headers.get("x-telegram-bot-api-secret-token"), esperado)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const msg = payload.message ?? payload.edited_message;
  if (!msg) return NextResponse.json({ ok: true, ignored: "update sem mensagem" });

  const chatId = msg.chat?.id;
  if (chatId == null) return NextResponse.json({ ok: true, ignored: "mensagem sem chat" });

  // Grupo/canal do Telegram fica fora do atendimento 1-a-1, igual ao WhatsApp.
  if (msg.chat?.type && msg.chat.type !== "private") {
    return NextResponse.json({ ok: true, ignored: "não é conversa individual" });
  }

  const externalIdConversa = String(chatId);
  // O Telegram reenvia o update quando não recebe 200; a chave composta
  // (chat + mensagem) é o que garante que não gravamos duas vezes.
  const externalIdMensagem = `${chatId}:${msg.message_id ?? ""}`;

  const conteudo = extrairConteudo(msg);
  if (!conteudo.texto && !conteudo.fileId) {
    return NextResponse.json({ ok: true, ignored: "mensagem sem conteúdo legível" });
  }

  // CONTATO BLOQUEADO — descarte silencioso, ANTES de gravar qualquer coisa.
  // Feito aqui, e não depois: se gravássemos a mensagem e só então
  // ignorássemos, o bloqueio não bloquearia nada — a conversa subiria para o
  // topo da caixa do mesmo jeito. Respondemos 200 para o Telegram parar de
  // reenviar o update, e o remetente não recebe nenhum sinal de que foi
  // bloqueado (é justamente o ponto de "silencioso").
  const { data: leadBloqueio } = await admin
    .from("leads")
    .select("bloqueado")
    .eq("external_id", `${LEAD_PREFIX}${chatId}`)
    .limit(1)
    .maybeSingle();
  if (leadBloqueio?.bloqueado) {
    return NextResponse.json({ ok: true, ignored: "contato bloqueado" });
  }

  const { data: dup } = await admin
    .from("messages")
    .select("id")
    .eq("external_id", externalIdMensagem)
    .maybeSingle();
  if (dup) return NextResponse.json({ ok: true, duplicate: true });

  // Mídia: resolve a URL agora, enquanto o file_id é válido. Se falhar,
  // seguimos gravando a mensagem sem link — perder o texto seria pior.
  // ATENÇÃO: esta URL contém o token do bot e expira em ~1 h. Ela NUNCA
  // vai para o banco — logo abaixo, com a conversa já criada, o arquivo é
  // copiado para o nosso storage e é essa cópia que fica gravada.
  let urlTemporaria: string | null = null;
  if (conteudo.fileId) {
    urlTemporaria = await getFileUrl(canal.config.bot_token ?? "", conteudo.fileId).catch(() => null);
  }

  const nome = nomeDoContato(msg.chat, msg.from);

  // 1) Acha-ou-cria a conversa por (canal telegram, chat_id).
  const { data: convExistente } = await admin
    .from("conversations")
    .select("id, lead_id, unread_count")
    .eq("canal", "telegram")
    .eq("external_id", externalIdConversa)
    .maybeSingle();

  let conversationId = convExistente?.id as string | undefined;
  let leadId = (convExistente?.lead_id as string | null) ?? null;

  if (!conversationId) {
    // 2) Dedupe do contato pelo external_id — o Telegram não dá telefone,
    //    então casar por número é impossível (e casar por nome seria errado).
    const leadExternalId = `${LEAD_PREFIX}${chatId}`;
    const { data: lead } = await admin
      .from("leads")
      .select("id")
      .eq("external_id", leadExternalId)
      .limit(1)
      .maybeSingle();
    leadId = (lead?.id as string) ?? null;

    if (!leadId) {
      const nomeLead = nome || `Contato Telegram ${chatId}`;
      const { data: novoLead } = await admin
        .from("leads")
        .insert({
          nome: nomeLead,
          // Sem telefone: o Telegram só entrega o chat_id e o @username.
          telefone: null,
          external_id: leadExternalId,
          // O enum lead_origin não tem 'telegram' (migração fora do escopo),
          // então usamos 'outros' — o canal real fica na conversa.
          origem: "telegram",
          stage: "novo",
        })
        .select("id")
        .single();
      leadId = (novoLead?.id as string) ?? null;

      // Webhook `contato_criado` — o dedupe por external_id não achou
      // ninguém, então este chat é mesmo um contato novo.
      if (leadId) {
        emitirContatoCriado(admin, {
          id: leadId,
          nome: nomeLead,
          // O Telegram não entrega telefone; deixar explícito evita o
          // integrador achar que perdemos o dado.
          telefone: null,
          origem: "telegram",
        });
      }
    }

    const { data: novaConv, error: convErr } = await admin
      .from("conversations")
      .insert({
        canal: "telegram",
        external_id: externalIdConversa,
        channel_id: canal.id,
        lead_id: leadId,
        contato_nome: nome,
        contato_telefone: null,
        setor_responsavel: "recepcao",
        status: "aberta",
      })
      .select("id")
      .single();
    if (convErr || !novaConv) {
      return NextResponse.json(
        { error: convErr?.message ?? "falha ao abrir conversa" },
        { status: 500 },
      );
    }
    conversationId = novaConv.id as string;

    // Webhook `conversa_criada` — este ramo É o nascimento da conversa.
    emitirConversaCriada(admin, {
      id: conversationId,
      canal: "telegram",
      status: "aberta",
      contato_nome: nome,
      contato_telefone: null,
      lead_id: leadId,
    });

    // Agent bot: se a caixa desta conversa tem bot, ela já nasce conduzida
    // por ele. Awaitado (ao contrário dos `emitir*`) porque é este passo
    // que grava `bot_status='ativo'` — sem ele a entrega mais abaixo veria
    // 'sem_bot' e não mandaria nada. São updates locais, não rede.
    await ativarBotNaConversa(admin, conversationId);
  }

  // 3) Grava a mensagem. Update de bot só chega para mensagem do cliente —
  //    o que nós enviamos é registrado pela rota /api/atendimento/send.
  const preview = conteudo.texto?.slice(0, 140) ?? `[${conteudo.tipo}]`;
  // Copia o arquivo para o nosso storage: a URL do Telegram carrega o
  // token do bot e morre em ~1 h, então guardá-la seria vazar credencial
  // e perder o anexo do histórico. Falhou o download? Grava sem mídia.
  const guardada = urlTemporaria
    ? await guardarMidiaRecebida(admin, {
        urlTemporaria,
        conversationId,
        nomeOriginal: conteudo.mediaNome,
      })
    : null;

  const { data: msgCriada } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "in",
      remetente: "cliente",
      tipo: conteudo.tipo,
      conteudo: conteudo.texto,
      media_url: guardada?.url ?? null,
      media_nome: conteudo.mediaNome,
      media_mime: guardada?.mime ?? conteudo.mediaMime,
      media_tamanho: guardada?.tamanho ?? null,
      external_id: externalIdMensagem,
      raw_payload: payload as unknown as Record<string, unknown>,
      status: "recebida",
    })
    // id/created_at servem só para identificar a mensagem no payload.
    .select("id, created_at")
    .maybeSingle();

  // Webhook `mensagem_criada`. Nem `raw_payload` nem a URL temporária do
  // Telegram entram no corpo — aquela URL carrega o token do bot.
  emitirMensagemCriada(
    admin,
    {
      id: conversationId,
      canal: "telegram",
      status: "aberta",
      contato_nome: nome,
      contato_telefone: null,
      lead_id: leadId,
    },
    {
      id: (msgCriada?.id as string) ?? null,
      direcao: "in",
      remetente: "cliente",
      tipo: conteudo.tipo,
      texto: conteudo.texto,
      criada_em: (msgCriada?.created_at as string) ?? null,
    },
  );

  // 4) Denormaliza o inbox: a mensagem do cliente conta como não lida e
  //    reabre a conversa adiada.
  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: preview,
      contato_nome: nome ?? undefined,
      unread_count: ((convExistente?.unread_count as number) ?? 0) + 1,
      status: "aberta",
      snoozed_until: null,
    })
    .eq("id", conversationId);

  if (leadId) {
    await admin
      .from("leads")
      .update({ ultima_interacao_em: new Date().toISOString() })
      .eq("id", leadId);
  }

  await notificarRecepcao(admin, preview);

  // 5) Automações — mesmo gancho do WhatsApp.
  const automacao = await dispararAutomacoes(admin, conversationId, {
    conversaNova: !convExistente,
    conteudo: conteudo.texto,
    direcao: "in",
    interna: false,
  });

  // 5.5) Agent bot — depois das automações (que podem etiquetar/rotear, e
  //      o payload do bot já sai com esse estado) e ANTES da IA: quando a
  //      caixa tem bot, é ele quem conduz, não o copiloto interno.
  //      `entregarAoBot` nunca lança e sai na primeira linha quando a caixa
  //      não tem bot ou quando um humano já assumiu.
  await entregarAoBot(admin, conversationId, {
    id: (msgCriada?.id as string) ?? null,
    direcao: "in",
    remetente: "cliente",
    tipo: conteudo.tipo,
    texto: conteudo.texto,
    // A URL guardada no nosso storage, nunca a temporária do Telegram —
    // aquela carrega o token do bot e morre em ~1 h.
    mediaUrl: guardada?.url ?? null,
    mediaNome: conteudo.mediaNome,
    mediaMime: guardada?.mime ?? conteudo.mediaMime,
    criadaEm: (msgCriada?.created_at as string) ?? null,
  });

  // 6) IA — triagem e auto-resposta, na mesma ordem sempre: primeiro
  //    classificar/etiquetar/rotear, depois responder. Assim a auto-resposta
  //    já sai com a conversa na equipe certa. Nenhuma das duas lança, e as
  //    duas saem na primeira linha quando a caixa não tem a chave ligada.
  const triagem = await triagemAutomatica(admin, conversationId, {
    conversaNova: !convExistente,
  });
  const auto = await autoResposta(admin, conversationId);

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    automacoes: automacao.regrasDisparadas,
    ia_triagem: triagem.executada,
    ia_auto_resposta: auto.enviada,
  });
}

async function notificarRecepcao(admin: Admin, mensagem: string) {
  await admin.from("notifications").insert({
    sector: "recepcao",
    tipo: "atendimento",
    titulo: "Nova mensagem no Telegram",
    mensagem,
    link: "/atendimento",
  });
}

/** Ping de sanidade — útil para conferir se a rota está publicada. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook telegram" });
}
