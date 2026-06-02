import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: profile } = await ssr.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.is_admin_central) return NextResponse.json({ error: "Apenas Admin Central" }, { status: 403 });

  const { id } = await req.json();
  if (!id) return NextResponse.json({ error: "id obrigatório" }, { status: 400 });
  if (id === user.id) return NextResponse.json({ error: "Não é possível excluir o próprio usuário" }, { status: 400 });

  const admin = createSupabaseAdmin();
  // Remove o usuário de auth; o profile cai em cascata (FK on delete cascade).
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
