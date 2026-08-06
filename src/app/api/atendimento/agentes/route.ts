import { NextResponse } from "next/server";
import { getAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import { PAPEL_LABELS, type AtendimentoPapel } from "@/lib/types";

// =====================================================================
// POST /api/atendimento/agentes
//   { profileId, access? }              → liga/desliga o acesso ao inbox
//   { profileId, atendimento_papel? }   → troca o papel (0040)
//   { profileId, cargo? }               → identificação do colaborador (0043)
//
// Só a diretoria (is_admin_central) pode gerenciar agentes.
//
// Por que a escrita mora aqui e não no cliente (AgentsManager.tsx): dar
// ou tirar acesso ao inbox é mudança de PERMISSÃO — quem passou a poder
// ler as conversas de todos os clientes, e por ordem de quem. Isso exige
// rastro, e `atendimento_audit_log` não tem policy de escrita para o
// usuário (só a service role grava), então do navegador é impossível
// registrar.
//
// O PAPEL entrou pelo mesmo motivo, e com peso maior: `atendimento_papel`
// é o eixo que a RLS da 0040 usa para decidir quem vê a caixa central,
// quem vê só as próprias filas e quem vê tudo. Promover alguém a
// `administrador` é dar acesso a todas as conversas da imobiliária — a
// mudança mais sensível desta tela. Escrever isso direto do navegador
// significaria fazê-la sem deixar rastro nenhum.
//
// O CARGO veio junto por conveniência de tela, não por segurança: ele não
// decide acesso a nada, é o rótulo que aparece ao lado do nome quando
// alguém assume um lead. Passa por aqui porque a tela que o edita é a
// mesma (Configurações › Agentes) e porque quem define cargo alheio é a
// diretoria — a checagem já está feita no topo desta rota.
//
// Os três campos são independentes e opcionais: a tela manda o que o
// usuário mexeu, e não precisa reenviar o estado inteiro da linha.
// =====================================================================

const PAPEIS_VALIDOS: AtendimentoPapel[] = ["administrador", "recepcao", "atendente"];

/** Cabe em uma linha de tabela e num select sem estourar o layout. */
const CARGO_MAX = 40;

export async function POST(req: Request) {
  const result = await getAtendimentoUser();
  if (!result?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!result.profile?.is_admin_central) {
    return NextResponse.json({ error: "apenas a diretoria pode gerenciar agentes" }, { status: 403 });
  }

  let body: {
    profileId?: string;
    access?: boolean;
    atendimento_papel?: string;
    cargo?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  if (!body.profileId) {
    return NextResponse.json({ error: "profileId é obrigatório" }, { status: 400 });
  }

  const temAccess = typeof body.access === "boolean";
  const papel = body.atendimento_papel as AtendimentoPapel | undefined;
  if (papel !== undefined && !PAPEIS_VALIDOS.includes(papel)) {
    return NextResponse.json(
      { error: `papel inválido — use um de: ${PAPEIS_VALIDOS.join(", ")}` },
      { status: 400 },
    );
  }

  // `undefined` = não mexe. String vazia = apagar o cargo (o campo da tela
  // esvaziado tem que virar "sem cargo", não ser ignorado em silêncio).
  const temCargo = body.cargo !== undefined;
  const cargo = temCargo ? (body.cargo ?? "").trim() || null : undefined;
  if (cargo && cargo.length > CARGO_MAX) {
    return NextResponse.json(
      { error: `o cargo precisa ter no máximo ${CARGO_MAX} caracteres` },
      { status: 400 },
    );
  }

  if (!temAccess && papel === undefined && !temCargo) {
    return NextResponse.json(
      { error: "informe access, atendimento_papel e/ou cargo" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();

  // Estado ANTES: o log de troca de papel só é útil se disser "de → para".
  // Também serve de porteiro — linha vazia denuncia profileId inexistente.
  const { data: antes } = await admin
    .from("profiles")
    .select("id, nome, email, sector, cargo, atendimento_access, atendimento_papel, is_admin_central")
    .eq("id", body.profileId)
    .maybeSingle();
  if (!antes) return NextResponse.json({ error: "agente não encontrado" }, { status: 404 });

  const patch: Record<string, unknown> = {};
  if (temAccess) patch.atendimento_access = body.access;
  if (papel !== undefined) patch.atendimento_papel = papel;
  if (temCargo) patch.cargo = cargo;

  const { data: alvo, error } = await admin
    .from("profiles")
    .update(patch)
    .eq("id", body.profileId)
    .select("id, nome, email, sector, cargo, atendimento_access, atendimento_papel")
    .maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  if (!alvo) return NextResponse.json({ error: "agente não encontrado" }, { status: 404 });

  const base = {
    atorId: result.user.id,
    atorNome: result.profile?.nome ?? result.user.email ?? null,
    entidade: "profiles",
    entidadeId: alvo.id as string,
    ip: ipDaRequisicao(req),
  };
  const alvoDescrito = {
    alvo_nome: alvo.nome ?? null,
    alvo_email: alvo.email ?? null,
    alvo_setor: alvo.sector ?? null,
  };

  // Duas linhas quando as duas coisas mudam: são permissões diferentes e
  // um log que junta tudo em "atualizou" some com a informação que
  // importa na hora de auditar.
  if (temAccess) {
    await registrarAuditoria(admin, {
      ...base,
      acao: body.access ? "liberou_acesso" : "revogou_acesso",
      detalhes: { ...alvoDescrito, atendimento_access: body.access },
    });
  }
  // O cargo é cosmético, mas "quem me rebaixou de Gerente para Estagiário
  // no sistema?" é pergunta que aparece — e sem linha no log não tem
  // resposta. Custa um insert.
  if (temCargo && cargo !== (antes.cargo as string | null)) {
    await registrarAuditoria(admin, {
      ...base,
      acao: "atualizou",
      detalhes: {
        ...alvoDescrito,
        campo: "cargo",
        de: (antes.cargo as string | null) ?? null,
        para: cargo ?? null,
      },
    });
  }
  if (papel !== undefined && papel !== antes.atendimento_papel) {
    const de = antes.atendimento_papel as AtendimentoPapel;
    await registrarAuditoria(admin, {
      ...base,
      acao: "atualizou",
      detalhes: {
        ...alvoDescrito,
        campo: "atendimento_papel",
        de,
        para: papel,
        de_rotulo: PAPEL_LABELS[de] ?? de,
        para_rotulo: PAPEL_LABELS[papel],
      },
    });
  }

  return NextResponse.json({ ok: true, agente: alvo });
}
