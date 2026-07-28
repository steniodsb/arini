import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { entregarWebhook, type WebhookAlvo } from "@/lib/atendimento/webhooks-out";
import { registrarAuditoria, ipDaRequisicao } from "@/lib/atendimento/audit";

// =====================================================================
// POST /api/atendimento/webhooks/testar   { id }
//
// Dispara um evento "teste" assinado contra a URL cadastrada, para o
// usuário conferir na hora se o endpoint dele está de pé e se a validação
// da assinatura do outro lado bate.
//
// Roda no servidor porque:
//   1. o `secret` do webhook nunca pode passar pelo navegador;
//   2. chamar a URL do cliente pelo browser bateria em CORS.
//
// Nunca devolve 500 por causa do endpoint do cliente: se o fetch falhar,
// isso é o RESULTADO do teste (200 com ok:false), não um erro nosso. Só
// devolve erro HTTP quando o problema é nosso (não autenticado, sem
// permissão, id inexistente).
// =====================================================================

export async function POST(req: Request) {
  const result = await getAtendimentoUser();
  if (!result?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!result.profile?.is_admin_central) {
    return NextResponse.json({ error: "apenas a diretoria pode testar webhooks" }, { status: 403 });
  }

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("atendimento_webhooks")
    .select("id, nome, url, secret, falhas_seguidas")
    .eq("id", body.id)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "webhook não encontrado" }, { status: 404 });

  const alvo = data as WebhookAlvo & { nome: string };

  // Payload de exemplo com a cara de um evento real, para o dev do outro
  // lado já conseguir escrever o parser em cima dele.
  const entrega = await entregarWebhook(
    admin,
    alvo,
    "teste",
    {
      mensagem: "Disparo de teste do Atendimento Arini.",
      conversa: {
        id: "00000000-0000-0000-0000-000000000000",
        canal: "whatsapp",
        status: "aberta",
        contato: { nome: "Contato de exemplo", telefone: "+5511999999999" },
      },
      disparado_por: result.profile?.nome ?? result.user.email ?? null,
    },
    // Um teste manual não deve desligar o webhook por acumular falhas —
    // quem está testando está justamente consertando a integração.
    { desativarAposFalhas: false },
  );

  await registrarAuditoria(admin, {
    atorId: result.user.id,
    atorNome: result.profile?.nome ?? result.user.email ?? null,
    acao: "testou",
    entidade: "webhook",
    entidadeId: alvo.id,
    detalhes: { nome: alvo.nome, url: alvo.url, status: entrega.status, ok: entrega.ok },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json(entrega);
}
