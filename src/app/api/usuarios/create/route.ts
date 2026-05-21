import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: profile } = await ssr.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.is_admin_central) return NextResponse.json({ error: "Apenas Admin Central" }, { status: 403 });

  const body = await req.json();
  const { nome, email, password, sector, is_admin_central } = body;
  if (!nome || !email || !password || !sector) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }
  const admin = createSupabaseAdmin();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome, sector },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // o trigger fn_handle_new_user já cria o profile com setor; só atualizamos is_admin_central e nome
  await admin
    .from("profiles")
    .update({ nome, sector, is_admin_central: !!is_admin_central })
    .eq("id", created.user.id);

  return NextResponse.json({ ok: true, id: created.user.id });
}
