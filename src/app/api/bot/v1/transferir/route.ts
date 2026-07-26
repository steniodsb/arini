import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { autenticarBot, conversaDoBot, transferirParaHumano } from "@/lib/atendimento/bots";

// =====================================================================
// POST /api/bot/v1/transferir
//   Authorization: Bearer <token do bot>
//   { conversationId, motivo?, equipeId?, agenteId? }
//
// O handoff. O bot desiste (ou o cliente pediu gente) e devolve a conversa
// para a equipe. A partir daqui `entregarAoBot` para de entregar mensagem
// nesta conversa — é isso que impede o bot de continuar falando por cima
// do atendente.
//
// `equipeId` / `agenteId` são opcionais: transferir SEM destino já é útil
// (a conversa volta para a fila geral), mas um bot que consegue triar
// ("isto é financeiro") deve poder entregar na porta certa.
//
// Idempotente na prática: transferir de novo só reescreve o carimbo e
// registra outra nota. Preferimos isso a devolver erro para um bot que
// tentou duas vezes por causa de timeout de rede.
// =====================================================================

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function POST(req: Request) {
  const admin = createSupabaseAdmin();

  const bot = await autenticarBot(admin, req);
  if (!bot) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  let body: {
    conversationId?: string;
    motivo?: string;
    equipeId?: string | null;
    agenteId?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ erro: "corpo inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim() ?? "";
  if (!conversationId) {
    return NextResponse.json({ erro: "conversationId é obrigatório" }, { status: 400 });
  }

  const conversa = await conversaDoBot(admin, bot.id, conversationId);
  if (!conversa) {
    return NextResponse.json({ erro: "conversa não encontrada" }, { status: 404 });
  }

  const resultado = await transferirParaHumano(admin, conversationId, body.motivo ?? null);
  if (!resultado.ok) {
    return NextResponse.json({ erro: resultado.erro ?? "falha ao transferir" }, { status: 400 });
  }

  // ---- Atribuição opcional -------------------------------------------
  // Feita DEPOIS da transferência e em bloco separado: se a equipe ou o
  // agente informados não existirem, a conversa já está com o humano (que
  // é o essencial) e o erro de atribuição não desfaz isso.
  const patch: Record<string, unknown> = {};
  const avisos: string[] = [];

  if (body.equipeId) {
    const { data } = await admin
      .from("atendimento_teams")
      .select("id")
      .eq("id", body.equipeId)
      .maybeSingle();
    if (data) patch.team_id = body.equipeId;
    else avisos.push("equipeId desconhecido — a conversa ficou sem equipe");
  }

  if (body.agenteId) {
    // Confere que o destinatário é mesmo alguém do atendimento: atribuir a
    // conversa a um perfil sem acesso a esconderia da fila para sempre.
    const { data } = await admin
      .from("profiles")
      .select("id, ativo, atendimento_access, is_admin_central")
      .eq("id", body.agenteId)
      .maybeSingle();
    const perfil = data as {
      ativo: boolean;
      atendimento_access: boolean;
      is_admin_central: boolean;
    } | null;
    if (perfil?.ativo && (perfil.atendimento_access || perfil.is_admin_central)) {
      patch.responsavel_id = body.agenteId;
    } else {
      avisos.push("agenteId inválido ou sem acesso ao atendimento — a conversa ficou sem responsável");
    }
  }

  if (Object.keys(patch).length > 0) {
    await admin.from("conversations").update(patch).eq("id", conversationId);
  }

  return NextResponse.json({
    ok: true,
    conversationId,
    botStatus: "transferida",
    equipeId: (patch.team_id as string | undefined) ?? null,
    agenteId: (patch.responsavel_id as string | undefined) ?? null,
    avisos,
  });
}
