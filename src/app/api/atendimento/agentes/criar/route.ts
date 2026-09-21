import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import { SECTOR_LABELS, type AtendimentoPapel, type Sector } from "@/lib/types";

// =====================================================================
// POST /api/atendimento/agentes/criar — cadastra uma pessoa nova.
//
// POR QUE ISTO PRECISOU EXISTIR: até 21/09/2026 não havia NENHUMA forma
// de criar agente pela interface. As 10 contas do banco vieram de
// `scripts/seed-users.js`, todas de demonstração ("Captador Demo",
// "Jurídico Demo") e todas com a mesma senha. Para pôr a equipe real no
// sistema era preciso rodar script com acesso ao servidor — ou seja, o
// cliente dependia do desenvolvedor para cada contratação.
//
// CRIAR AGENTE É CRIAR CREDENCIAL, e por isso mora no servidor:
//
//  · o usuário nasce em `auth.users` (só a service role cria), e o
//    trigger `trg_auth_new_user` copia para `profiles`. O trigger ENGOLE
//    erros de propósito, para não derrubar login — então não dá para
//    confiar que ele rodou, e aqui o perfil é garantido por upsert.
//  · se o perfil falhar mesmo assim, o usuário de auth é APAGADO. Conta
//    que entra no sistema mas não tem perfil é pior que conta nenhuma:
//    ela autentica e some em toda tela que lê `profiles`.
//  · a senha inicial é gerada aqui e devolvida UMA vez. Não há envio de
//    e-mail configurado (ver docs/ATENDIMENTO-PENDENCIAS.md, item 5), e
//    inventar uma senha padrão repetiria o problema das 10 contas que
//    dividem `Arini2026@!` — que o próprio fluxograma do cliente proíbe
//    em caixa alta: "nunca compartilhar credenciais".
// =====================================================================

const NOME_MAX = 60;
const CARGO_MAX = 40;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PAPEIS_VALIDOS: AtendimentoPapel[] = ["administrador", "recepcao", "atendente"];

/**
 * Senha inicial legível em voz alta, para a diretoria passar a pessoa sem
 * erro de digitação, e forte o bastante para não ser adivinhada. Evita
 * caracteres que se confundem (0/O, 1/l/I).
 */
function senhaInicial(): string {
  const silabas = "ba be bi bo ca ce co da de do fa fe fi ga go la le li lo ma me mi mo na ne no pa pe pi ra re ri ro sa se si ta te ti to va ve vi".split(" ");
  const pega = (n: number) => Array.from({ length: n }, () => silabas[Math.floor(Math.random() * silabas.length)]).join("");
  const numero = String(Math.floor(Math.random() * 90) + 10);
  const p = pega(3);
  return `${p[0].toUpperCase()}${p.slice(1)}-${pega(2)}${numero}!`;
}

export async function POST(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!sessao.profile?.is_admin_central) {
    return NextResponse.json({ error: "apenas a diretoria pode criar agentes" }, { status: 403 });
  }

  let body: {
    nome?: string;
    email?: string;
    sector?: string;
    cargo?: string | null;
    atendimento_papel?: string;
    access?: boolean;
    filas?: string[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const nome = (body.nome ?? "").trim();
  const email = (body.email ?? "").trim().toLowerCase();
  const sector = (body.sector ?? "recepcao") as Sector;
  const cargo = (body.cargo ?? "").trim() || null;
  const papel = (body.atendimento_papel ?? "atendente") as AtendimentoPapel;
  const access = body.access !== false;
  const filas = Array.isArray(body.filas) ? body.filas.filter(Boolean) : [];

  if (!nome) return NextResponse.json({ error: "informe o nome" }, { status: 400 });
  if (nome.length > NOME_MAX) {
    return NextResponse.json({ error: `o nome precisa ter no máximo ${NOME_MAX} caracteres` }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  if (cargo && cargo.length > CARGO_MAX) {
    return NextResponse.json({ error: `o cargo precisa ter no máximo ${CARGO_MAX} caracteres` }, { status: 400 });
  }
  if (!(sector in SECTOR_LABELS)) {
    return NextResponse.json({ error: `setor inválido: ${sector}` }, { status: 400 });
  }
  if (!PAPEIS_VALIDOS.includes(papel)) {
    return NextResponse.json({ error: `papel inválido: ${papel}` }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const senha = senhaInicial();

  // 1) A credencial. O metadata alimenta o trigger que cria o perfil.
  const { data: criado, error: erroAuth } = await admin.auth.admin.createUser({
    email,
    password: senha,
    email_confirm: true,
    user_metadata: { nome, sector },
  });
  if (erroAuth || !criado?.user) {
    const duplicado = /already|registered|exists/i.test(erroAuth?.message ?? "");
    return NextResponse.json(
      {
        error: duplicado
          ? `já existe uma conta com o e-mail ${email}`
          : `não foi possível criar o acesso: ${erroAuth?.message ?? "erro desconhecido"}`,
      },
      { status: 400 },
    );
  }
  const id = criado.user.id;

  // 2) O perfil. Upsert porque o trigger pode ter criado — ou ter falhado
  //    em silêncio, que é o comportamento dele por construção.
  const { data: perfil, error: erroPerfil } = await admin
    .from("profiles")
    .upsert(
      {
        id, nome, email, sector, cargo, ativo: true,
        atendimento_access: access,
        atendimento_papel: papel,
      },
      { onConflict: "id" },
    )
    .select("id, nome, email, sector, cargo, is_admin_central, atendimento_access, atendimento_papel")
    .maybeSingle();

  if (erroPerfil || !perfil) {
    // Sem perfil a conta autentica e some em toda tela que lê `profiles`.
    // Melhor não existir.
    await admin.auth.admin.deleteUser(id).catch(() => {});
    return NextResponse.json(
      { error: `o acesso foi desfeito: falha ao criar o perfil — ${erroPerfil?.message ?? "erro desconhecido"}` },
      { status: 400 },
    );
  }

  // 3) Filas. Sem fila, um `atendente` não enxerga conversa nenhuma — por
  //    isso o cadastro já deixa escolher, em vez de exigir uma segunda
  //    visita a outra tela.
  if (filas.length) {
    await admin
      .from("atendimento_team_members")
      .upsert(filas.map((team_id) => ({ team_id, profile_id: id })), { onConflict: "team_id,profile_id" });
  }

  await registrarAuditoria(admin, {
    atorId: sessao.user.id,
    atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
    acao: "criou",
    entidade: "profiles",
    entidadeId: id,
    detalhes: {
      alvo_nome: nome,
      alvo_email: email,
      alvo_setor: sector,
      atendimento_access: access,
      atendimento_papel: papel,
      filas: filas.length,
    },
    ip: ipDaRequisicao(req),
  });

  // A senha volta UMA vez. Não fica gravada em lugar nenhum nosso — o
  // hash é do Supabase Auth e não é reversível.
  return NextResponse.json({ ok: true, agente: perfil, senha });
}
