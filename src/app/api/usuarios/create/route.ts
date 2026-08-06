import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { AtendimentoPapel } from "@/lib/types";

// =====================================================================
// POST /api/usuarios/create — cria o acesso individual de um colaborador.
//
// Uma pessoa, um login. É aqui que nasce a conta, e por isso é aqui que
// se decide de uma vez:
//   · o SETOR do CRM de imóveis   (o que ela vê no /admin);
//   · o CARGO                     (como ela se identifica — 0043);
//   · o ACESSO ao Atendimento     (entra na caixa multicanal ou não);
//   · o PAPEL no Atendimento      (tria, atende ou administra — 0040).
//
// Os dois últimos entraram porque o caminho antigo obrigava a criar o
// usuário aqui e depois ir a OUTRO sistema (Atendimento › Configurações ›
// Agentes) ligar o acesso. Na prática ninguém lembrava do segundo passo, e
// o colaborador novo passava o primeiro dia sem conseguir entrar.
// =====================================================================

const PAPEIS_VALIDOS: AtendimentoPapel[] = ["administrador", "recepcao", "atendente"];
const CARGO_MAX = 40;

export async function POST(req: Request) {
  const ssr = createSupabaseServer();
  const { data: { user } } = await ssr.auth.getUser();
  if (!user) return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
  const { data: profile } = await ssr.from("profiles").select("*").eq("id", user.id).single();
  if (!profile?.is_admin_central) return NextResponse.json({ error: "Apenas Admin Central" }, { status: 403 });

  const body = await req.json();
  const {
    nome, email, password, sector, is_admin_central,
    cargo, atendimento_access, atendimento_papel,
  } = body;
  if (!nome || !email || !password || !sector) {
    return NextResponse.json({ error: "Campos obrigatórios faltando" }, { status: 400 });
  }

  const cargoLimpo = typeof cargo === "string" ? cargo.trim() : "";
  if (cargoLimpo.length > CARGO_MAX) {
    return NextResponse.json(
      { error: `O cargo precisa ter no máximo ${CARGO_MAX} caracteres` },
      { status: 400 },
    );
  }

  const papel = atendimento_papel as AtendimentoPapel | undefined;
  if (papel !== undefined && !PAPEIS_VALIDOS.includes(papel)) {
    return NextResponse.json(
      { error: `Papel de atendimento inválido — use um de: ${PAPEIS_VALIDOS.join(", ")}` },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();
  const { data: created, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { nome, sector },
  });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // o trigger fn_handle_new_user já cria o profile com setor; aqui
  // completamos o que o trigger não sabe (nome, cargo, poderes).
  const { error: erroPerfil } = await admin
    .from("profiles")
    .update({
      nome,
      sector,
      cargo: cargoLimpo || null,
      is_admin_central: !!is_admin_central,
      atendimento_access: !!atendimento_access,
      // Sem papel escolhido, `atendente` — o menos poderoso dos três. Um
      // atendente sem fila não enxerga nada, então o pior caso de errar
      // aqui é a pessoa não ver conversa, nunca ver conversa demais.
      atendimento_papel: papel ?? "atendente",
    })
    .eq("id", created.user.id);

  // A conta de login já existe neste ponto. Falhar em silêncio deixaria um
  // usuário que entra mas cai no lugar errado — pior do que avisar.
  if (erroPerfil) {
    return NextResponse.json(
      { error: `Usuário criado, mas o perfil não foi completado: ${erroPerfil.message}` },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true, id: created.user.id });
}
