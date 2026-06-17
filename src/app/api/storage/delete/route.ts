import { NextResponse } from "next/server";
import { createSupabaseServer } from "@/lib/supabase/server";
import { isR2Configured, deleteR2Object } from "@/lib/storage";

/** Remove um objeto do R2. Body: { key }. Requer usuário autenticado. */
export async function POST(req: Request) {
  if (!isR2Configured()) {
    return NextResponse.json({ error: "R2 não configurado" }, { status: 501 });
  }
  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { key } = await req.json();
  if (!key) return NextResponse.json({ error: "key obrigatória" }, { status: 400 });

  try {
    await deleteR2Object(String(key));
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "erro" }, { status: 500 });
  }
}
