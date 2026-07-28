import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { enviarMensagem } from "@/lib/atendimento/outbound";
import { emitirMensagemCriada } from "@/lib/atendimento/webhook-eventos";
import type { ConversationChannel, MessageStatus, MessageTipo } from "@/lib/types";

/**
 * Envia uma resposta do atendente numa conversa.
 * - Autentica pela sessão e usa RLS (o usuário só responde conversas que
 *   ele pode ver).
 * - Grava a mensagem de saída SEMPRE (mesmo se o envio externo falhar, o
 *   time vê o que foi digitado) e despacha pelo canal conectado da
 *   conversa — Evolution ou Cloud API, texto ou mídia.
 *
 * Body:
 *   conversationId  obrigatório
 *   texto           texto da mensagem (opcional se houver mídia)
 *   interna         true = nota interna (não sai para o cliente)
 *   mentions        uuid[] de agentes mencionados na nota
 *   assinar         anexa profiles.assinatura ao final (só resposta)
 *   replyToId       id da mensagem citada
 *   mediaUrl/mediaNome/mediaMime/mediaTamanho/tipo  anexo já hospedado
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  let body: {
    conversationId?: string;
    texto?: string;
    interna?: boolean;
    mentions?: string[];
    assinar?: boolean;
    replyToId?: string | null;
    mediaUrl?: string;
    mediaNome?: string;
    mediaMime?: string;
    mediaTamanho?: number;
    tipo?: MessageTipo;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim();
  const texto = body.texto?.trim() || null;
  const interna = body.interna === true;
  const mediaUrl = body.mediaUrl?.trim() || null;
  const mentions = Array.isArray(body.mentions) ? body.mentions.filter(Boolean) : [];
  const replyToId = body.replyToId ?? null;

  if (!conversationId) {
    return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
  }
  if (!texto && !mediaUrl) {
    return NextResponse.json({ error: "envie um texto ou um anexo" }, { status: 400 });
  }

  // RLS garante que o usuário só acessa conversas permitidas.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    // contato_nome e lead_id entram só para montar o payload do webhook
    // `mensagem_criada` sem precisar de uma segunda leitura da conversa.
    .select(
      "id, canal, external_id, contato_nome, contato_telefone, lead_id, primeira_resposta_em, channel_id, status",
    )
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 400 });
  if (!conv) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });

  const tipo: MessageTipo = mediaUrl ? (body.tipo ?? "documento") : "texto";

  // ---------------- Nota interna: só registra ----------------
  if (interna) {
    const { data: nota, error: notaErr } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        direcao: "out",
        remetente: "atendente",
        autor_id: user.id,
        tipo,
        conteudo: texto,
        media_url: mediaUrl,
        media_nome: body.mediaNome ?? null,
        media_mime: body.mediaMime ?? null,
        media_tamanho: body.mediaTamanho ?? null,
        reply_to_id: replyToId,
        mentions,
        interna: true,
        status: "enviada",
      })
      .select("*")
      .single();
    if (notaErr) return NextResponse.json({ error: notaErr.message }, { status: 400 });

    // Menção avisa o colega no sino do sistema (não depende de e-mail).
    if (mentions.length > 0) {
      const admin = createSupabaseAdmin();
      await admin.from("notifications").insert(
        mentions.map((id) => ({
          user_id: id,
          tipo: "atendimento",
          titulo: "Você foi mencionado numa conversa",
          mensagem: (texto ?? "").slice(0, 140),
          link: `/atendimento?c=${conversationId}`,
        })),
      );
    }

    return NextResponse.json({ ok: true, message: nota, delivered: null, interna: true });
  }

  // ---------------- Resposta ao cliente ----------------
  // Assinatura do agente vai no texto enviado E no que fica gravado, para o
  // histórico bater exatamente com o que o cliente recebeu.
  let textoFinal = texto;
  if (body.assinar && texto) {
    const { data: perfil } = await supabase
      .from("profiles").select("assinatura").eq("id", user.id).maybeSingle();
    const assinatura = (perfil?.assinatura as string | null)?.trim();
    if (assinatura) textoFinal = `${texto}\n\n${assinatura}`;
  }

  const canal = conv.canal as ConversationChannel;
  const destino = conv.contato_telefone ?? conv.external_id;

  const admin = createSupabaseAdmin();
  const send = await enviarMensagem(admin, {
    canal,
    channelId: (conv.channel_id as string | null) ?? null,
    destino,
    // O canal de e-mail precisa do id da conversa para montar o assunto
    // ("Re: ...") e o Message-ID que mantém a thread do cliente.
    conversationId,
    texto: textoFinal,
    media: mediaUrl
      ? { url: mediaUrl, tipo, nome: body.mediaNome ?? null, mime: body.mediaMime ?? null }
      : null,
  });

  const status: MessageStatus = send.ok ? "enviada" : "falha";

  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "out",
      remetente: "atendente",
      autor_id: user.id,
      tipo,
      conteudo: textoFinal,
      media_url: mediaUrl,
      media_nome: body.mediaNome ?? null,
      media_mime: body.mediaMime ?? null,
      media_tamanho: body.mediaTamanho ?? null,
      reply_to_id: replyToId,
      external_id: send.ok ? send.externalId : null,
      status,
    })
    .select("*")
    .single();
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 400 });

  // Denormalização do inbox + marcação da 1ª resposta (métrica de SLA).
  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {
    last_message_at: agora,
    last_message_preview: textoFinal?.slice(0, 140) ?? `[${tipo}]`,
  };
  if (!conv.primeira_resposta_em) patch.primeira_resposta_em = agora;
  // Responder reabre a conversa adiada — senão ela sumiria da caixa logo
  // depois de o atendente falar com o cliente.
  if (conv.status === "adiada") { patch.status = "aberta"; patch.snoozed_until = null; }
  await supabase.from("conversations").update(patch).eq("id", conversationId);

  // Webhook `mensagem_criada` da resposta do agente.
  //
  // Está DEPOIS do insert e do patch de propósito: o evento só sai quando
  // a mensagem existe de verdade no histórico. Sai mesmo que o envio ao
  // provedor tenha falhado (`delivered:false`) — do ponto de vista do
  // inbox a mensagem foi criada, e esconder isso do integrador daria um
  // histórico com buracos.
  //
  // NOTA INTERNA NÃO CHEGA AQUI: o ramo `interna` retorna bem antes. Isso
  // é regra, não acaso — nota é conversa da equipe e não pode ser POSTada
  // para um endpoint de terceiro.
  emitirMensagemCriada(
    admin,
    {
      id: conversationId,
      canal,
      status: (patch.status as string | undefined) ?? (conv.status as string | null),
      contato_nome: (conv.contato_nome as string | null) ?? null,
      contato_telefone: (conv.contato_telefone as string | null) ?? null,
      lead_id: (conv.lead_id as string | null) ?? null,
    },
    {
      id: (msg?.id as string) ?? null,
      direcao: "out",
      remetente: "atendente",
      tipo,
      texto: textoFinal,
      criada_em: (msg?.created_at as string) ?? agora,
    },
  );

  return NextResponse.json({
    ok: true,
    message: msg,
    delivered: send.ok,
    via: send.ok ? send.via : null,
    reason: send.ok ? null : send.reason,
  });
}
