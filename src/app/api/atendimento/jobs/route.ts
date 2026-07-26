import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { enviarMensagem } from "@/lib/atendimento/outbound";
import type { ConversationChannel } from "@/lib/types";

// =====================================================================
// Motor de tarefas em segundo plano do Atendimento.
//
// O Next serverless não tem "worker" próprio: este endpoint concentra os
// jobs periódicos e é chamado por um cron externo (Dokploy/cron do VPS):
//     curl -X POST https://atendimento.<dominio>/api/atendimento/jobs \
//          -H "x-jobs-secret: $ATENDIMENTO_JOBS_SECRET"
//
// Roda três coisas, todas idempotentes (pode chamar de minuto em minuto):
//   1. despertar    — conversa adiada cujo prazo venceu volta para "aberta"
//   2. sla          — marca violação de 1ª resposta / resolução
//   3. campanhas    — envia os alvos pendentes das campanhas em disparo
//
// Segurança: exige ATENDIMENTO_JOBS_SECRET. Sem a env configurada o
// endpoint responde 503 em vez de rodar aberto para a internet.
// =====================================================================

type Admin = ReturnType<typeof createSupabaseAdmin>;

/** Quantos envios por chamada — evita estourar o tempo da requisição. */
const LOTE_CAMPANHA = 25;

export async function POST(req: Request) {
  const segredo = process.env.ATENDIMENTO_JOBS_SECRET;
  if (!segredo) {
    return NextResponse.json(
      { error: "ATENDIMENTO_JOBS_SECRET não configurado no servidor" },
      { status: 503 },
    );
  }
  if (req.headers.get("x-jobs-secret") !== segredo) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const admin = createSupabaseAdmin();
  const [despertadas, sla, campanhas] = await Promise.all([
    despertarAdiadas(admin),
    marcarViolacoesSla(admin),
    processarCampanhas(admin),
  ]);

  return NextResponse.json({ ok: true, despertadas, sla, campanhas });
}

// ---------------------------------------------------------------------
// 1. Conversas adiadas (snooze) que venceram voltam para a caixa
// ---------------------------------------------------------------------
async function despertarAdiadas(admin: Admin): Promise<number> {
  const agora = new Date().toISOString();
  const { data, error } = await admin
    .from("conversations")
    .update({ status: "aberta", snoozed_until: null })
    .eq("status", "adiada")
    .lte("snoozed_until", agora)
    .select("id");
  if (error) return 0;
  return data?.length ?? 0;
}

// ---------------------------------------------------------------------
// 2. SLA — marca violação quando o prazo passou sem o marco ser cumprido
// ---------------------------------------------------------------------
async function marcarViolacoesSla(admin: Admin): Promise<{ violadas: number; erro?: string }> {
  const agora = new Date().toISOString();

  // 1ª resposta: prazo venceu e ninguém respondeu ainda.
  const { data: semResposta, error: e1 } = await admin
    .from("conversations")
    .update({ sla_violado: true })
    .eq("sla_violado", false)
    .is("primeira_resposta_em", null)
    .not("sla_first_response_due", "is", null)
    .lte("sla_first_response_due", agora)
    .select("id");

  // Resolução: prazo venceu e a conversa continua aberta/pendente.
  const { data: semResolver, error: e2 } = await admin
    .from("conversations")
    .update({ sla_violado: true })
    .eq("sla_violado", false)
    .in("status", ["aberta", "pendente", "adiada"])
    .not("sla_resolution_due", "is", null)
    .lte("sla_resolution_due", agora)
    .select("id");

  const erro = e1?.message ?? e2?.message;
  return {
    violadas: (semResposta?.length ?? 0) + (semResolver?.length ?? 0),
    ...(erro ? { erro } : {}),
  };
}

// ---------------------------------------------------------------------
// 3. Campanhas — envia os alvos pendentes
// ---------------------------------------------------------------------
async function processarCampanhas(
  admin: Admin,
): Promise<{ enviados: number; falhas: number; campanhas: number }> {
  const agora = new Date().toISOString();

  // Agendadas cujo horário chegou entram em "enviando".
  await admin
    .from("atendimento_campaigns")
    .update({ status: "enviando" })
    .eq("status", "agendada")
    .eq("tipo", "disparo")
    .not("agendado_para", "is", null)
    .lte("agendado_para", agora);

  const { data: campanhas } = await admin
    .from("atendimento_campaigns")
    .select("id, mensagem, inbox_id, enviados, falhas")
    .eq("status", "enviando")
    .eq("tipo", "disparo")
    .limit(3);

  if (!campanhas || campanhas.length === 0) {
    return { enviados: 0, falhas: 0, campanhas: 0 };
  }

  let enviados = 0;
  let falhas = 0;

  for (const c of campanhas as { id: string; mensagem: string | null; inbox_id: string | null; enviados: number; falhas: number }[]) {
    // Canal da caixa da campanha (para saber por onde enviar).
    let canal: ConversationChannel = "whatsapp";
    let channelId: string | null = null;
    if (c.inbox_id) {
      const { data: caixa } = await admin
        .from("atendimento_inboxes")
        .select("canal, channel_id")
        .eq("id", c.inbox_id)
        .maybeSingle();
      if (caixa) {
        canal = (caixa.canal as ConversationChannel) ?? "whatsapp";
        channelId = (caixa.channel_id as string | null) ?? null;
      }
    }

    const { data: alvos } = await admin
      .from("atendimento_campaign_targets")
      .select("id, lead_id")
      .eq("campaign_id", c.id)
      .eq("status", "pendente")
      .limit(LOTE_CAMPANHA);

    if (!alvos || alvos.length === 0) {
      // Sem pendentes = campanha terminou.
      await admin.from("atendimento_campaigns").update({ status: "concluida" }).eq("id", c.id);
      continue;
    }

    for (const alvo of alvos as { id: string; lead_id: string }[]) {
      const { data: lead } = await admin
        .from("leads")
        .select("whatsapp, telefone, bloqueado")
        .eq("id", alvo.lead_id)
        .maybeSingle();

      const destino = (lead?.whatsapp as string | null) ?? (lead?.telefone as string | null) ?? "";

      if (!destino || lead?.bloqueado) {
        await admin
          .from("atendimento_campaign_targets")
          .update({ status: "falha", erro: lead?.bloqueado ? "contato bloqueado" : "contato sem telefone" })
          .eq("id", alvo.id);
        falhas += 1;
        continue;
      }

      const r = await enviarMensagem(admin, {
        canal,
        channelId,
        destino,
        texto: c.mensagem ?? "",
      });

      if (r.ok) {
        await admin
          .from("atendimento_campaign_targets")
          .update({ status: "enviado", enviado_em: new Date().toISOString(), erro: null })
          .eq("id", alvo.id);
        enviados += 1;
      } else {
        await admin
          .from("atendimento_campaign_targets")
          .update({ status: "falha", erro: r.reason })
          .eq("id", alvo.id);
        falhas += 1;
      }
    }

    await admin
      .from("atendimento_campaigns")
      .update({ enviados: c.enviados + enviados, falhas: c.falhas + falhas })
      .eq("id", c.id);
  }

  return { enviados, falhas, campanhas: campanhas.length };
}
