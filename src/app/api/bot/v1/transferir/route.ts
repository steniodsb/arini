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

  // Estado ANTES: alimenta o "de → para" do log e diz se a conversa já
  // tinha saído da caixa central.
  const { data: antes } = await admin
    .from("conversations")
    .select("team_id, responsavel_id, triada_em")
    .eq("id", conversationId)
    .maybeSingle();
  const deEquipe = (antes?.team_id as string | null) ?? null;
  const deAgente = (antes?.responsavel_id as string | null) ?? null;
  const jaTriada = Boolean(antes?.triada_em);

  if (body.equipeId) {
    const { data } = await admin
      .from("atendimento_teams")
      .select("id")
      .eq("id", body.equipeId)
      .maybeSingle();
    if (data) {
      patch.team_id = body.equipeId;
      // O CARIMBO DA TRIAGEM. Sem ele a conversa ganhava equipe mas
      // continuava na caixa central: o filtro por fila já a mostrava
      // (`team_id` preenchido), enquanto o painel de Triagem seguia
      // pedindo para atribuí-la (`triada_em` nulo). Quem integra via API
      // via a atribuição "funcionar" num lugar e ser ignorada no outro.
      //
      // Entregar numa fila É triar — é exatamente o que o botão
      // "Encaminhar" da tela faz. `triada_por` fica nulo porque aponta
      // para `profiles` e bot não tem perfil; quem triou fica registrado
      // no log de transferências abaixo, com o nome do bot no motivo.
      if (!jaTriada) patch.triada_em = new Date().toISOString();
    } else {
      avisos.push("equipeId desconhecido — a conversa ficou sem equipe");
    }
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

    // Log da mudança de dono, o mesmo que a tela grava. "Quem tirou esse
    // cliente de mim?" precisa ter resposta também quando quem move é um
    // bot — senão a conversa troca de fila sozinha e não há linha nenhuma
    // explicando. `feito_por` fica nulo (aponta para `profiles`), e o bot
    // é identificado no motivo.
    const paraEquipe = (patch.team_id as string | undefined) ?? deEquipe;
    const paraAgente = (patch.responsavel_id as string | undefined) ?? deAgente;
    await admin.from("atendimento_transferencias").insert({
      conversation_id: conversationId,
      // "triagem" só quando a conversa REALMENTE saiu da caixa central
      // agora; se já estava triada, isto é uma troca de fila.
      acao: patch.triada_em ? "triagem" : "transferencia",
      de_equipe: deEquipe,
      para_equipe: paraEquipe,
      de_agente: deAgente,
      para_agente: paraAgente,
      motivo: `Bot "${bot.nome}"${body.motivo?.trim() ? ` — ${body.motivo.trim()}` : ""}`,
      feito_por: null,
    });
  }

  return NextResponse.json({
    ok: true,
    conversationId,
    botStatus: "transferida",
    equipeId: (patch.team_id as string | undefined) ?? null,
    agenteId: (patch.responsavel_id as string | undefined) ?? null,
    // Confirma se a conversa saiu da caixa central nesta chamada. É o que
    // o integrador precisa para saber que a atribuição valeu de ponta a
    // ponta, e não só no filtro por fila.
    triada: Boolean(patch.triada_em) || jaTriada,
    avisos,
  });
}
