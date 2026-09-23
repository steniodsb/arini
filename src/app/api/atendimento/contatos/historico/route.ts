import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

// =====================================================================
// GET /api/atendimento/contatos/historico?conversa=<id>[&mensagens=<id>]
//
// O HISTÓRICO COMPLETO DO CONTATO, para quem está atendendo agora.
//
// Relatado em 23/09: "quando atribuídos ao nosso setor, não temos acesso
// ao histórico de conversas, nos obrigando a perguntar o que já foi
// respondido". A RLS de `conversations` mostra ao atendente só o que está
// na fila dele — as conversas ANTERIORES do mesmo cliente, atendidas por
// outro setor, ficam invisíveis. O painel do contato listava "conversas
// anteriores" pela mesma RLS, então para o atendente a lista vinha vazia.
//
// A regra aqui: quem consegue VER a conversa atual (a RLS decide, pela
// sessão) pode LER o passado desse mesmo contato — mesmo lead, ou mesmo
// telefone. Só leitura, e só do que já aconteceu; escrever continua
// limitado à conversa que está na mão da pessoa.
//
//   sem `mensagens`: lista as conversas anteriores (sem as mensagens);
//   com `mensagens=<id>`: as mensagens daquela conversa anterior — desde
//   que ela pertença ao mesmo contato (conferido aqui, não confiado).
// =====================================================================

type ConvRow = {
  id: string; canal: string; status: string; lead_id: string | null;
  contato_telefone: string | null; external_id: string | null;
  last_message_at: string; last_message_preview: string | null;
  team_id: string | null; responsavel_id: string | null;
  created_at: string; resolvida_em: string | null;
};

export async function GET(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao Atendimento" }, { status: 403 });
  }

  const url = new URL(req.url);
  const conversaId = url.searchParams.get("conversa")?.trim();
  const mensagensDe = url.searchParams.get("mensagens")?.trim() || null;
  if (!conversaId) return NextResponse.json({ error: "informe ?conversa=<id>" }, { status: 400 });

  // A porta: a RLS diz se esta pessoa enxerga a conversa ATUAL.
  const supabase = createSupabaseServer();
  const { data: atual } = await supabase
    .from("conversations")
    .select("id, lead_id, contato_telefone, external_id, canal")
    .eq("id", conversaId)
    .maybeSingle();
  if (!atual) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });

  const admin = createSupabaseAdmin();
  const telefone = (atual.contato_telefone as string | null)?.replace(/\D/g, "") || null;
  const leadId = atual.lead_id as string | null;

  // O mesmo contato = mesmo lead OU mesmo telefone. Os dois porque há
  // conversa sem lead (canal por API) e lead sem telefone (e-mail).
  const filtros: string[] = [];
  if (leadId) filtros.push(`lead_id.eq.${leadId}`);
  if (telefone) filtros.push(`contato_telefone.eq.${telefone}`);
  if (filtros.length === 0) return NextResponse.json({ conversas: [] });

  const { data: todas } = await admin
    .from("conversations")
    .select("id, canal, status, lead_id, contato_telefone, external_id, last_message_at, last_message_preview, team_id, responsavel_id, created_at, resolvida_em")
    .or(filtros.join(","))
    .neq("id", conversaId)
    .order("last_message_at", { ascending: false })
    .limit(20);
  const anteriores = (todas ?? []) as ConvRow[];

  if (!mensagensDe) return NextResponse.json({ conversas: anteriores });

  // Mensagens de UMA conversa anterior — só se ela for do mesmo contato.
  if (!anteriores.some((c) => c.id === mensagensDe)) {
    return NextResponse.json({ error: "essa conversa não é deste contato" }, { status: 403 });
  }
  const { data: mensagens } = await admin
    .from("messages")
    .select("id, direcao, remetente, autor_id, tipo, conteudo, media_url, media_nome, interna, created_at, apagada_em")
    .eq("conversation_id", mensagensDe)
    .order("created_at", { ascending: true })
    .limit(500);

  return NextResponse.json({ conversas: anteriores, mensagens: mensagens ?? [] });
}
