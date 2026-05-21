import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { approvalId, entityTable, entityId, stage, status, comentario } = body;
  if (!approvalId || !status) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });

  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: profile } = await ssr.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });
  if (!profile.is_admin_central && profile.sector !== "administrativo") {
    return NextResponse.json({ error: "Sem permissão para aprovar" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();

  await admin
    .from("approvals")
    .update({
      status,
      aprovador_id: user.id,
      comentario,
      decidido_em: new Date().toISOString(),
    })
    .eq("id", approvalId);

  // Efeitos colaterais por stage
  if (entityTable === "properties") {
    if (stage === "captacao") {
      const newStatus = status === "aprovado" ? "aprovado_captacao" : status === "reprovado" ? "inativo" : "rascunho";
      await admin.from("properties").update({ status: newStatus }).eq("id", entityId);
    } else if (stage === "marketing") {
      if (status === "aprovado") {
        await admin.from("properties").update({ status: "publicado", publicado_no_site: true }).eq("id", entityId);
        await admin.from("marketing_campaigns").update({ status: "publicado", data_publicacao_realizada: new Date().toISOString().slice(0, 10) }).eq("property_id", entityId);
      } else if (status === "reprovado") {
        await admin.from("marketing_campaigns").update({ status: "reprovado" }).eq("property_id", entityId);
      }
    }
  }

  return NextResponse.json({ ok: true });
}
