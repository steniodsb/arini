import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";

// =====================================================================
// POST /api/atendimento/agentes   { profileId, access }
//
// Liga/desliga o acesso de um usuário ao Atendimento. Só a diretoria
// (is_admin_central) pode gerenciar agentes.
//
// Por que a escrita mora aqui e não no cliente (AgentsManager.tsx): dar
// ou tirar acesso ao inbox é mudança de PERMISSÃO — quem passou a poder
// ler as conversas de todos os clientes, e por ordem de quem. Isso exige
// rastro, e `atendimento_audit_log` não tem policy de escrita para o
// usuário (só a service role grava), então do navegador é impossível
// registrar. O `AgentsManager` já chamava esta rota; o que faltava era
// ela gravar o log.
// =====================================================================

export async function POST(req: Request) {
  const result = await getAtendimentoUser();
  if (!result?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!result.profile?.is_admin_central) {
    return NextResponse.json({ error: "apenas a diretoria pode gerenciar agentes" }, { status: 403 });
  }

  let body: { profileId?: string; access?: boolean };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "payload inválido" }, { status: 400 }); }
  if (!body.profileId || typeof body.access !== "boolean") {
    return NextResponse.json({ error: "profileId e access são obrigatórios" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  // `select` no update devolve o alvo já atualizado: precisamos do nome e
  // do e-mail dele para o log ser legível ("liberou acesso a Fulano"), e
  // uma linha vazia denuncia profileId inexistente.
  const { data: alvo, error } = await admin
    .from("profiles")
    .update({ atendimento_access: body.access })
    .eq("id", body.profileId)
    .select("id, nome, email, sector")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!alvo) return NextResponse.json({ error: "agente não encontrado" }, { status: 404 });

  await registrarAuditoria(admin, {
    atorId: result.user.id,
    atorNome: result.profile?.nome ?? result.user.email ?? null,
    acao: body.access ? "liberou_acesso" : "revogou_acesso",
    entidade: "profiles",
    entidadeId: alvo.id as string,
    detalhes: {
      alvo_nome: alvo.nome ?? null,
      alvo_email: alvo.email ?? null,
      alvo_setor: alvo.sector ?? null,
      atendimento_access: body.access,
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true });
}
