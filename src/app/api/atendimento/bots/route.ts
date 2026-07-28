import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { gerarToken, hashToken, prefixoDe } from "@/lib/atendimento/api-tokens";
import { registrarAuditoria, ipDaRequisicao } from "@/lib/atendimento/audit";

// =====================================================================
// POST /api/atendimento/bots   { nome, descricao?, outgoingUrl, inboxId? }
//
// Cria um Agent Bot. Só a criação passa por aqui; editar, ligar/desligar
// e excluir a tela faz direto no Supabase (a RLS restringe à diretoria),
// igual à tela de Webhooks.
//
// POR QUE A CRIAÇÃO É DIFERENTE: o token do bot é gerado NO SERVIDOR e
// nunca no navegador — o cliente não tem fonte de aleatoriedade auditável
// e queremos que o segredo exista em claro num único lugar (a resposta
// desta chamada). Guardamos só o sha256 em `token_hash`; nem nós
// conseguimos recuperá-lo depois. Mesmo desenho do GitHub/Stripe.
//
// O `secret` (que assina o que MANDAMOS ao bot) é gerado pelo default da
// coluna no Postgres e continua legível na tela — ele não dá acesso a
// nada, só permite conferir a origem da chamada.
// =====================================================================

export const dynamic = "force-dynamic";

/** Só a diretoria mexe em bots (a tabela também restringe isso no RLS). */
async function exigirDiretoria() {
  const result = await getAtendimentoUser();
  if (!result?.user) {
    return { erro: NextResponse.json({ error: "não autenticado" }, { status: 401 }) } as const;
  }
  if (!result.profile?.is_admin_central) {
    return {
      erro: NextResponse.json({ error: "apenas a diretoria pode gerenciar bots" }, { status: 403 }),
    } as const;
  }
  return { user: result.user, profile: result.profile } as const;
}

export async function POST(req: Request) {
  const auth = await exigirDiretoria();
  if ("erro" in auth) return auth.erro;

  let body: { nome?: string; descricao?: string; outgoingUrl?: string; inboxId?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const nome = (body.nome ?? "").trim();
  const outgoingUrl = (body.outgoingUrl ?? "").trim();
  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });

  // https:// é exigência, não preferência: o corpo leva a conversa do
  // cliente. Assinado, mas em claro no fio se for http.
  if (!/^https:\/\/.+\..+/i.test(outgoingUrl)) {
    return NextResponse.json(
      { error: "a URL do bot precisa começar com https://" },
      { status: 400 },
    );
  }

  const token = gerarToken();
  const admin = createSupabaseAdmin();

  const { data, error } = await admin
    .from("atendimento_agent_bots")
    .insert({
      nome,
      descricao: (body.descricao ?? "").trim() || null,
      outgoing_url: outgoingUrl,
      token_hash: hashToken(token),
      prefixo: prefixoDe(token),
      criado_por: auth.user.id,
    })
    .select("*")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  // Vínculo com a caixa. Upsert por `inbox_id` (chave primária): trocar o
  // bot de uma caixa é substituir a linha, porque uma caixa só pode ter um
  // bot — dois bots responderiam o mesmo cliente ao mesmo tempo.
  let inboxId: string | null = null;
  if (body.inboxId) {
    const { error: vErr } = await admin
      .from("atendimento_inbox_bots")
      .upsert({ inbox_id: body.inboxId, bot_id: data.id }, { onConflict: "inbox_id" });
    if (!vErr) inboxId = body.inboxId;
  }

  await registrarAuditoria(admin, {
    atorId: auth.user.id,
    atorNome: auth.profile?.nome ?? auth.user.email ?? null,
    acao: "criou",
    entidade: "bot",
    entidadeId: data.id as string,
    // Nunca o token nem o hash no log — o log é lido por todo o atendimento.
    detalhes: { nome, outgoing_url: outgoingUrl, inbox_id: inboxId },
    ip: ipDaRequisicao(req),
  });

  // `token` em claro sai daqui e nunca mais. A tela mostra uma única vez.
  return NextResponse.json({ ok: true, token, registro: data, inboxId });
}
