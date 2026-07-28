import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { autenticarBot, conversaDoBot } from "@/lib/atendimento/bots";
import { enviarMensagem } from "@/lib/atendimento/outbound";
import type { ConversationChannel, MessageStatus, MessageTipo } from "@/lib/types";

// =====================================================================
// POST /api/bot/v1/mensagens
//   Authorization: Bearer <token do bot>
//   { conversationId, texto, mediaUrl?, mediaTipo?, privada? }
//
// O bot fala. Duas coisas acontecem, nesta ordem:
//   1. a mensagem é ENTREGUE ao cliente de verdade, pelo canal da conversa
//      (`enviarMensagem` resolve WhatsApp/Telegram/e-mail/SMS/API);
//   2. ela é gravada no histórico com `remetente: 'bot'` e `bot_id`.
//
// `privada: true` grava como NOTA INTERNA e não envia nada: é como o bot
// deixa contexto para o atendente que vai assumir ("cliente já informou o
// CPF", "tentei 3 vezes e não entendi") sem o cliente ver.
//
// O `remetente: 'bot'` é diferente de 'ia' de propósito: 'ia' é o copiloto
// interno da Arini, 'bot' é um sistema de terceiro plugado numa caixa. Os
// relatórios precisam conseguir separar os dois.
// =====================================================================

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tipos de mídia aceitos — o mesmo conjunto que o inbox sabe renderizar. */
const TIPOS_MIDIA: MessageTipo[] = ["imagem", "audio", "video", "documento"];

export async function POST(req: Request) {
  const admin = createSupabaseAdmin();

  const bot = await autenticarBot(admin, req);
  // 401 GENÉRICO: não dizemos se o token não existe, se o bot foi desligado
  // ou se o header veio torto. Diferenciar isso vira oráculo para quem
  // estiver testando tokens no escuro.
  if (!bot) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  let body: {
    conversationId?: string;
    texto?: string;
    mediaUrl?: string;
    mediaTipo?: string;
    privada?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim() ?? "";
  const texto = body.texto?.trim() || null;
  const mediaUrl = body.mediaUrl?.trim() || null;
  const privada = body.privada === true;

  if (!conversationId) {
    return NextResponse.json({ erro: "conversationId é obrigatório" }, { status: 400 });
  }
  if (!texto && !mediaUrl) {
    return NextResponse.json({ erro: "envie texto ou mediaUrl" }, { status: 400 });
  }

  // Isolamento: o bot só escreve em conversa de uma caixa que ele atende.
  // 404 e não 403 — um bot não deve nem confirmar que aquele id existe.
  const conversa = await conversaDoBot(admin, bot.id, conversationId);
  if (!conversa) {
    return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  }

  const tipoInformado = body.mediaTipo as MessageTipo | undefined;
  const tipo: MessageTipo = mediaUrl
    ? (tipoInformado && TIPOS_MIDIA.includes(tipoInformado) ? tipoInformado : "documento")
    : "texto";

  // ---------------- Nota interna: só registra ----------------
  if (privada) {
    const { data: nota, error } = await admin
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direcao: "out",
        remetente: "bot",
        bot_id: bot.id,
        tipo,
        conteudo: texto,
        media_url: mediaUrl,
        interna: true,
        status: "enviada",
      })
      .select("id, created_at")
      .single();
    if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

    // Nota interna NÃO mexe em last_message_preview: o preview da lista é o
    // que o cliente vê da conversa, e recado da equipe não pertence a ele.
    return NextResponse.json({
      ok: true,
      mensagemId: nota?.id ?? null,
      entregue: null,
      privada: true,
    });
  }

  // ---------------- Resposta ao cliente ----------------
  const canal = conversa.canal as ConversationChannel;

  // Chat do site é a exceção conhecida (mesma regra da auto-resposta da IA):
  // o widget lê o histórico por polling direto do banco, então GRAVAR a
  // mensagem já É a entrega. Passar por `enviarMensagem` cairia no despacho
  // legado e devolveria erro numa entrega que deu certo.
  let entregue: boolean | null = null;
  let via: string | null = null;
  let motivo: string | null = null;
  let externalId: string | null = null;

  if (canal === "site") {
    entregue = true;
    via = "widget";
  } else {
    const destino = conversa.contato_telefone ?? "";
    const envio = await enviarMensagem(admin, {
      canal,
      channelId: conversa.channel_id,
      // O canal de e-mail precisa do id para montar o assunto ("Re: ...")
      // e o Message-ID que mantém a thread do cliente.
      conversationId,
      destino: destino || (await externalIdDaConversa(admin, conversationId)),
      texto,
      media: mediaUrl ? { url: mediaUrl, tipo, nome: null, mime: null } : null,
    });
    entregue = envio.ok;
    via = envio.ok ? envio.via : null;
    motivo = envio.ok ? null : envio.reason;
    externalId = envio.ok ? envio.externalId : null;
  }

  const status: MessageStatus = entregue ? "enviada" : "falha";

  // Grava SEMPRE, mesmo com falha de envio: o time precisa ver o que o bot
  // tentou dizer, e o motivo, em vez de um buraco no histórico.
  const { data: msg, error } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "out",
      remetente: "bot",
      bot_id: bot.id,
      tipo,
      conteudo: texto,
      media_url: mediaUrl,
      external_id: externalId,
      status,
    })
    .select("id, created_at")
    .single();
  if (error) return NextResponse.json({ erro: error.message }, { status: 400 });

  await admin
    .from("conversations")
    .update({
      last_message_at: new Date().toISOString(),
      last_message_preview: texto?.slice(0, 140) ?? `[${tipo}]`,
    })
    .eq("id", conversationId);

  return NextResponse.json({
    ok: true,
    mensagemId: msg?.id ?? null,
    entregue,
    via,
    motivo,
  });
}

/**
 * Destino de última instância quando a conversa não tem telefone: o
 * `external_id` é a chave da thread naquele canal (e-mail do cliente,
 * chat_id do Telegram, número do SMS). Leitura barata, por chave primária.
 */
async function externalIdDaConversa(
  admin: ReturnType<typeof createSupabaseAdmin>,
  conversationId: string,
): Promise<string> {
  const { data } = await admin
    .from("conversations")
    .select("external_id")
    .eq("id", conversationId)
    .maybeSingle();
  return (data as { external_id: string | null } | null)?.external_id ?? "";
}
