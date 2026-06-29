import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const body = await req.json();
  const { approvalId, entityTable, entityId, stage, status, comentario } = body;
  if (!status || !entityId || !stage) return NextResponse.json({ error: "Parâmetros inválidos" }, { status: 400 });

  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });

  const { data: profile } = await ssr.from("profiles").select("*").eq("id", user.id).single();
  if (!profile) return NextResponse.json({ error: "Perfil não encontrado" }, { status: 403 });

  const isDiretoria = profile.is_admin_central || profile.sector === "admin_central";
  // A aprovação de marketing publica o imóvel no site → exclusiva da diretoria.
  // A autorização da etapa de captação pode ser feita pela gerência (administrativo).
  if (stage === "marketing" || entityTable !== "properties") {
    if (!isDiretoria) {
      return NextResponse.json({ error: "Apenas a diretoria pode aprovar esta etapa" }, { status: 403 });
    }
  } else if (!isDiretoria && profile.sector !== "administrativo") {
    return NextResponse.json({ error: "Sem permissão para aprovar" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();

  // Se a approval existir, atualiza; senão, cria já decidida (auto-corrige
  // itens "órfãos" que ficaram sem linha de aprovação).
  if (approvalId) {
    await admin
      .from("approvals")
      .update({
        status,
        aprovador_id: user.id,
        comentario,
        decidido_em: new Date().toISOString(),
      })
      .eq("id", approvalId);
  } else {
    await admin.from("approvals").insert({
      entity_table: entityTable,
      entity_id: entityId,
      stage,
      status,
      aprovador_id: user.id,
      comentario,
      decidido_em: new Date().toISOString(),
    });
  }

  // Efeitos colaterais por stage
  if (entityTable === "properties") {
    if (stage === "captacao") {
      // aprovado → aprovado_captacao. Reprovado E correção voltam para "rascunho":
      // o imóvel retorna à captação 100% editável (mantendo o MESMO código e o
      // vínculo do Google Drive), para corrigir o que estava errado e reenviar —
      // sem precisar excluir e recriar. Mesmo padrão da etapa de marketing, que
      // devolve o item ao estado de trabalho editável em vez de inativá-lo.
      const newStatus = status === "aprovado" ? "aprovado_captacao" : "rascunho";
      await admin.from("properties").update({ status: newStatus }).eq("id", entityId);
    } else if (stage === "marketing") {
      if (status === "aprovado") {
        await admin.from("properties").update({ status: "publicado", publicado_no_site: true }).eq("id", entityId);
        await admin.from("marketing_campaigns").update({ status: "publicado", data_publicacao_realizada: new Date().toISOString().slice(0, 10) }).eq("property_id", entityId);
      } else {
        // reprovado ou corrigir → volta para em_marketing para o marketing reajustar e reenviar
        await admin.from("properties").update({ status: "em_marketing" }).eq("id", entityId);
        await admin
          .from("marketing_campaigns")
          .update({ status: status === "reprovado" ? "reprovado" : "rascunho" })
          .eq("property_id", entityId);
      }
    }
  }

  // Notifica o setor responsável quando reprovado ou correção solicitada (ciclo de etapas).
  if (status === "reprovado" || status === "corrigir") {
    const sectorToNotify = stage === "marketing" ? "marketing" : stage === "captacao" ? "captacao" : null;
    if (sectorToNotify) {
      await admin.from("notifications").insert({
        sector: sectorToNotify,
        tipo: "aprovacao",
        titulo: status === "reprovado" ? "Aprovação reprovada" : "Correção solicitada",
        mensagem: comentario || (status === "reprovado" ? "Item reprovado pela aprovação." : "Foram solicitados ajustes."),
        link: stage === "marketing" ? `/admin/marketing/${entityId}` : `/admin/captacao/${entityId}`,
      });
    }
  }

  return NextResponse.json({ ok: true });
}
