import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { transferirParaHumano } from "@/lib/atendimento/bots";

// =====================================================================
// POST /api/atendimento/bots/transferir   { conversationId, motivo?, assumir? }
//
// O lado HUMANO do handoff: é o que o botão "Assumir conversa" chama.
//
// POR QUE NÃO REUSA /api/bot/v1/transferir: aquela rota é autenticada
// pelo TOKEN DO BOT, que o navegador do atendente não tem (e não pode
// ter). Aqui a autenticação é a sessão do atendimento, e o efeito no
// banco é o mesmo — `transferirParaHumano`.
//
// `assumir: true` (padrão) também põe o atendente como responsável: quem
// clicou em "assumir" está dizendo que vai cuidar. Sem isso a conversa
// sairia do bot e cairia numa fila sem dono, que é o pior dos dois mundos.
//
// A leitura da conversa usa o client de SESSÃO de propósito: a RLS
// continua sendo a autoridade sobre quais conversas aquele agente pode
// tocar. A service role entra só para escrever a nota interna do sistema.
// =====================================================================

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao atendimento" }, { status: 403 });
  }

  let body: { conversationId?: string; motivo?: string; assumir?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim() ?? "";
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
  }

  // Passa pela RLS antes de qualquer escrita com service role.
  const supabase = createSupabaseServer();
  const { data: conv, error: convErr } = await supabase
    .from("conversations")
    .select("id, bot_status")
    .eq("id", conversationId)
    .maybeSingle();
  if (convErr) return NextResponse.json({ error: convErr.message }, { status: 400 });
  if (!conv) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });

  const admin = createSupabaseAdmin();
  const motivo =
    body.motivo?.trim() ||
    `${sessao.profile?.nome ?? sessao.user.email ?? "Um atendente"} assumiu a conversa.`;

  const resultado = await transferirParaHumano(admin, conversationId, motivo);
  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro ?? "falha ao transferir" }, { status: 400 });
  }

  const assumir = body.assumir !== false;
  if (assumir) {
    await supabase
      .from("conversations")
      .update({ responsavel_id: sessao.user.id })
      .eq("id", conversationId);
  }

  return NextResponse.json({
    ok: true,
    conversationId,
    botStatus: "transferida",
    responsavelId: assumir ? sessao.user.id : null,
  });
}
