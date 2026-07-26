import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";

// Liga/desliga o acesso de um usuário ao Atendimento. Só a diretoria
// (is_admin_central) pode gerenciar agentes.
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
  const { error } = await admin
    .from("profiles")
    .update({ atendimento_access: body.access })
    .eq("id", body.profileId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}
