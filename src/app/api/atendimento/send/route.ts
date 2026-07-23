import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { sendOutboundText } from "@/lib/whatsapp";
import type { ConversationChannel, MessageStatus } from "@/lib/types";

/**
 * Envia uma resposta do atendente numa conversa.
 * - Autentica pela sessão e usa RLS (o usuário só responde conversas que
 *   ele pode ver — do seu setor, ou recepção/diretoria).
 * - Grava a mensagem de saída SEMPRE (mesmo se o envio externo falhar, o
 *   time vê o que foi digitado) e dispara pela Cloud API quando configurada.
 */
export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  let body: { conversationId?: string; texto?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim();
  const texto = body.texto?.trim();
  if (!conversationId || !texto) {
    return NextResponse.json({ error: "conversationId e texto são obrigatórios" }, { status: 400 });
  }

  // RLS garante que o usuário só acessa conversas permitidas.
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, canal, external_id, contato_telefone")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 400 });
  if (!conv) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });

  const canal = conv.canal as ConversationChannel;
  const destino = conv.contato_telefone ?? conv.external_id;

  // Dispara pela plataforma (admin lê as credenciais em social_integrations).
  const admin = createSupabaseAdmin();
  const send = await sendOutboundText(admin, canal, destino, texto);

  const status: MessageStatus = send.ok ? "enviada" : "falha";

  const { data: msg, error: msgErr } = await supabase
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "out",
      remetente: "atendente",
      autor_id: user.id,
      tipo: "texto",
      conteudo: texto,
      external_id: send.ok ? send.externalId : null,
      status,
    })
    .select("*")
    .single();
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    message: msg,
    delivered: send.ok,
    reason: send.ok ? null : send.reason,
  });
}
