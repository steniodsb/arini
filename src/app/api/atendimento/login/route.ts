import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";

// =====================================================================
// POST /api/atendimento/login   (sem corpo)
//
// Registra "fulano entrou no atendimento" no log de auditoria.
//
// COMO FUNCIONA: o login em si continua sendo feito pelo Supabase no
// navegador (LoginForm.tsx). Esta rota é chamada LOGO DEPOIS do
// `signInWithPassword` dar certo. Como o cliente do browser e o do
// servidor compartilham o mesmo cookie (@supabase/ssr), aqui já dá para
// ler a sessão recém-criada — não recebemos e nunca vemos a senha.
//
// POR QUE NÃO NO `getAtendimentoUser`: ele roda em TODA página do
// sistema. Registrar ali encheria o log de uma linha por navegação e
// tornaria a tela de auditoria inútil justamente por excesso de dados.
// Aqui é uma linha por login, que é a pergunta real ("quem entrou?").
//
// PROTEÇÃO CONTRA INUNDAÇÃO: a rota é acessível a qualquer sessão
// válida, então alguém poderia chamá-la em laço. Por isso ela só grava
// se não houver um "entrou" do mesmo usuário na última meia hora — uma
// sessão de trabalho normal gera uma linha, um script não gera mil.
//
// Responde 200 mesmo quando não grava: para a tela de login, isto é um
// efeito colateral; falhar aqui não pode impedir ninguém de entrar.
// =====================================================================

/** Janela de deduplicação do evento de login. */
const JANELA_MINUTOS = 30;

export async function POST(req: Request) {
  const sessao = await getAtendimentoUser();
  // Sem sessão não há o que registrar (e não é erro: pode ser um POST
  // atrasado de uma aba cuja sessão já expirou).
  if (!sessao?.user) return NextResponse.json({ ok: true, registrado: false });

  const admin = createSupabaseAdmin();

  const desde = new Date(Date.now() - JANELA_MINUTOS * 60_000).toISOString();
  const { data: recente } = await admin
    .from("atendimento_audit_log")
    .select("id")
    .eq("ator_id", sessao.user.id)
    .eq("acao", "entrou")
    .gte("created_at", desde)
    .limit(1)
    .maybeSingle();
  if (recente) return NextResponse.json({ ok: true, registrado: false });

  await registrarAuditoria(admin, {
    atorId: sessao.user.id,
    atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
    acao: "entrou",
    entidade: "profiles",
    entidadeId: sessao.user.id,
    detalhes: {
      email: sessao.user.email ?? null,
      // Guardar isto responde "por que fulano viu o inbox?" — e também
      // registra a tentativa de quem entrou SEM acesso ao atendimento.
      com_acesso: hasAtendimentoAccess(sessao.profile),
      user_agent: (req.headers.get("user-agent") ?? "").slice(0, 300) || null,
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true, registrado: true });
}
