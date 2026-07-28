import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { gerarToken, hashToken, prefixoDe } from "@/lib/atendimento/api-tokens";
import { registrarAuditoria, ipDaRequisicao } from "@/lib/atendimento/audit";
import { API_SCOPE_LABELS, type ApiScope } from "@/lib/types";

// =====================================================================
// POST   /api/atendimento/tokens   { nome, escopos, dias? }  → cria
// DELETE /api/atendimento/tokens   { id }                    → revoga
//
// O token é gerado AQUI, no servidor, e nunca no navegador: o cliente não
// tem fonte de aleatoriedade auditável nem como esconder o valor, e queremos
// que o segredo exista em claro num único lugar (a resposta desta chamada).
//
// Guardamos só o sha256 em `token_hash`. Isso significa que nem nós
// conseguimos recuperar a chave depois — se o usuário perder, gera outra.
// É o mesmo desenho do GitHub/Stripe e é o que torna um vazamento do banco
// menos catastrófico.
// =====================================================================

const ESCOPOS_VALIDOS = Object.keys(API_SCOPE_LABELS) as ApiScope[];

/** Só a diretoria mexe em tokens (a tabela também restringe isso no RLS). */
async function exigirDiretoria() {
  const result = await getAtendimentoUser();
  if (!result?.user) {
    return { erro: NextResponse.json({ error: "não autenticado" }, { status: 401 }) } as const;
  }
  if (!result.profile?.is_admin_central) {
    return {
      erro: NextResponse.json({ error: "apenas a diretoria pode gerenciar tokens" }, { status: 403 }),
    } as const;
  }
  return { user: result.user, profile: result.profile } as const;
}

export async function POST(req: Request) {
  const auth = await exigirDiretoria();
  if ("erro" in auth) return auth.erro;

  let body: { nome?: string; escopos?: string[]; dias?: number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const nome = (body.nome ?? "").trim();
  if (!nome) return NextResponse.json({ error: "nome é obrigatório" }, { status: 400 });

  // Filtra contra a lista conhecida: escopo inventado no cliente não entra
  // no banco, senão a checagem de permissão futura vira letra morta.
  const escopos = (body.escopos ?? []).filter((e): e is ApiScope =>
    ESCOPOS_VALIDOS.includes(e as ApiScope),
  );
  if (escopos.length === 0) {
    return NextResponse.json({ error: "escolha ao menos um escopo" }, { status: 400 });
  }

  const dias = typeof body.dias === "number" && body.dias > 0 ? body.dias : null;
  const expira_em = dias ? new Date(Date.now() + dias * 86_400_000).toISOString() : null;

  const token = gerarToken();
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("atendimento_api_tokens")
    .insert({
      nome,
      token_hash: hashToken(token),
      prefixo: prefixoDe(token),
      escopos,
      expira_em,
      criado_por: auth.user.id,
    })
    .select("id, nome, prefixo, escopos, ultimo_uso_em, expira_em, revogado, criado_por, created_at")
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  await registrarAuditoria(admin, {
    atorId: auth.user.id,
    atorNome: auth.profile?.nome ?? auth.user.email ?? null,
    acao: "criou",
    entidade: "token_api",
    entidadeId: data.id as string,
    // Nunca o token nem o hash no log — o log é lido por todo o atendimento.
    detalhes: { nome, escopos, expira_em },
    ip: ipDaRequisicao(req),
  });

  // `token` em claro sai daqui e nunca mais. A tela mostra uma única vez.
  return NextResponse.json({ ok: true, token, registro: data });
}

export async function DELETE(req: Request) {
  const auth = await exigirDiretoria();
  if ("erro" in auth) return auth.erro;

  let body: { id?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  if (!body.id) return NextResponse.json({ error: "id é obrigatório" }, { status: 400 });

  const admin = createSupabaseAdmin();
  // Revoga, não apaga: a linha continua existindo para o histórico dizer que
  // aquele token existiu, quem criou e quando morreu.
  const { data, error } = await admin
    .from("atendimento_api_tokens")
    .update({ revogado: true })
    .eq("id", body.id)
    .select("id, nome, prefixo")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!data) return NextResponse.json({ error: "token não encontrado" }, { status: 404 });

  await registrarAuditoria(admin, {
    atorId: auth.user.id,
    atorNome: auth.profile?.nome ?? auth.user.email ?? null,
    acao: "revogou",
    entidade: "token_api",
    entidadeId: data.id as string,
    detalhes: { nome: data.nome, prefixo: data.prefixo },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true });
}
