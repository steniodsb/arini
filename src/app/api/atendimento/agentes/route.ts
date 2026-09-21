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

// TRANSFERIR CARTEIRA ficou de fora, e a decisão tem prazo de validade.
//
// Das 53 colunas que apontam para `profiles`, 7 significam "de quem é
// isso AGORA" (conversations.responsavel_id, leads.corretor_id,
// agenda_events.responsavel_id, lead_appointments.responsavel_id,
// legal_records.responsavel_id, marketing_campaigns.responsavel_id,
// atendimento_csat.agente_id) e 46 significam "quem FEZ isso" — e essas
// nunca devem mudar de dono: reatribuir uma mensagem é dizer que outra
// pessoa escreveu o que ela não escreveu.
//
// Hoje transferir não moveria nada: em 21/09/2026, das 345 conversas
// abertas, ZERO tinham responsável. Ninguém assumiu nada ainda, então
// desativar sozinho não deixa trabalho órfão.
//
// QUANDO ISTO DEIXA DE VALER: no dia em que as pessoas passarem a
// "Assumir" conversas de verdade. Aí desativar alguém deixa as conversas
// dela com um dono que não entra mais — some da vista de quem poderia
// pegar, e parece atendida. É o momento de implementar a transferência
// das 7 colunas acima, e só delas.

/** Cabe em uma linha de tabela e num select sem estourar o layout. */
const CARGO_MAX = 40;

/**
 * O NOME não é mais cosmético desde que a caixa pode assinar a resposta
 * com ele (0053): o primeiro nome vai para o WhatsApp do cliente. Foi
 * exatamente assim que as contas de demonstração vazaram — em 21/09/2026
 * onze respostas reais saíram assinadas "*Admin:*", porque a tela não
 * tinha como trocar "Admin Arini" pelo nome de quem estava atendendo.
 */
const NOME_MAX = 60;

/** Simples de propósito: quem valida e-mail de verdade é o Supabase Auth. */
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

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
    nome?: string;
    email?: string;
    /** Desligar/religar a pessoa sem apagar o histórico dela. */
    ativo?: boolean;
    /** Nova senha definida pela diretoria (mínimo 8). Nunca vai para o log. */
    senha?: string;
    /** Gera o link de acesso individual e o devolve nesta resposta. */
    gerarLink?: boolean;
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

  // Nome: vazio NÃO é apagar. Perfil sem nome deixa a assinatura muda e a
  // lista de agentes ilegível — é erro de digitação, não intenção.
  const temNome = body.nome !== undefined;
  const nome = temNome ? (body.nome ?? "").trim() : undefined;
  if (temNome && !nome) {
    return NextResponse.json({ error: "o nome não pode ficar vazio" }, { status: 400 });
  }
  if (nome && nome.length > NOME_MAX) {
    return NextResponse.json(
      { error: `o nome precisa ter no máximo ${NOME_MAX} caracteres` },
      { status: 400 },
    );
  }

  const temEmail = body.email !== undefined;
  const email = temEmail ? (body.email ?? "").trim().toLowerCase() : undefined;
  if (temEmail && (!email || !EMAIL_RE.test(email))) {
    return NextResponse.json({ error: "e-mail inválido" }, { status: 400 });
  }

  const temAtivo = typeof body.ativo === "boolean";
  const temSenha = typeof body.senha === "string";
  const senha = temSenha ? (body.senha as string) : undefined;
  if (temSenha && (senha as string).length < 8) {
    return NextResponse.json({ error: "a senha precisa ter pelo menos 8 caracteres" }, { status: 400 });
  }

  // DESATIVAR A SI MESMO tranca a diretoria para fora do próprio sistema,
  // e não há outra tela que devolva o acesso — sobraria mexer no banco.
  if (temAtivo && body.ativo === false && body.profileId === result.user.id) {
    return NextResponse.json(
      { error: "você não pode desativar a própria conta" },
      { status: 400 },
    );
  }

  if (
    !temAccess && papel === undefined && !temCargo && !temNome && !temEmail &&
    !temAtivo && !temSenha && !body.gerarLink
  ) {
    return NextResponse.json({ error: "nada para alterar" }, { status: 400 });
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

  // O E-MAIL É A IDENTIDADE DE LOGIN, e mora em DOIS lugares: `auth.users`
  // (onde a autenticação acontece) e `profiles.email` (o espelho que as
  // telas leem). Gravar só o espelho deixaria a pessoa vendo o e-mail novo
  // na tela e entrando com o antigo — ou, pior, sem conseguir entrar.
  //
  // O Auth vai PRIMEIRO porque é ele que rejeita duplicado. Se falhar,
  // nada mais é escrito e a linha fica intacta.
  if (temEmail && email !== (antes.email as string | null)?.toLowerCase()) {
    const { error: erroAuth } = await admin.auth.admin.updateUserById(body.profileId, { email });
    if (erroAuth) {
      const duplicado = /already|registered|exists/i.test(erroAuth.message);
      return NextResponse.json(
        {
          error: duplicado
            ? `já existe uma conta com o e-mail ${email}`
            : `não foi possível trocar o e-mail: ${erroAuth.message}`,
        },
        { status: 400 },
      );
    }
  }

  // SENHA definida pela diretoria. Sem caixa de e-mail real, "esqueci minha
  // senha" por e-mail nunca vai funcionar aqui — alguém precisa destravar,
  // e esse alguém é quem administra.
  //
  // Consequência que fica registrada de propósito: quem pode definir a
  // senha de alguém pode entrar como essa pessoa. Numa operação de sete
  // pessoas em que o dono é o administrador isso é inevitável; o que não
  // pode é acontecer sem deixar linha no log.
  if (temSenha) {
    const { error: erroSenha } = await admin.auth.admin.updateUserById(body.profileId, {
      password: senha,
    });
    if (erroSenha) {
      return NextResponse.json(
        { error: `não foi possível definir a senha: ${erroSenha.message}` },
        { status: 400 },
      );
    }
  }

  const patch: Record<string, unknown> = {};
  if (temAccess) patch.atendimento_access = body.access;
  if (papel !== undefined) patch.atendimento_papel = papel;
  if (temCargo) patch.cargo = cargo;
  if (temNome) patch.nome = nome;
  if (temEmail) patch.email = email;
  if (temAtivo) patch.ativo = body.ativo;

  const COLUNAS = "id, nome, email, sector, cargo, ativo, atendimento_access, atendimento_papel";

  // Só define senha ou só gera link não mexe em `profiles` — e um
  // `.update({})` vazio não tem o que fazer. Nesse caso a linha é apenas
  // relida, para a tela receber o estado atual do mesmo jeito.
  const { data: alvo, error } = Object.keys(patch).length
    ? await admin.from("profiles").update(patch).eq("id", body.profileId).select(COLUNAS).maybeSingle()
    : await admin.from("profiles").select(COLUNAS).eq("id", body.profileId).maybeSingle();
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

  // NOME: deixou de ser cosmético quando a caixa passou a assinar a
  // resposta com ele (0053). Trocar o nome de alguém muda o que o CLIENTE
  // lê no WhatsApp, então "quem mudou isso?" precisa ter resposta.
  if (temNome && nome !== (antes.nome as string | null)) {
    await registrarAuditoria(admin, {
      ...base,
      acao: "atualizou",
      detalhes: { ...alvoDescrito, campo: "nome", de: antes.nome ?? null, para: nome },
    });
  }

  // E-MAIL: é a credencial de acesso. A linha mais importante deste log.
  if (temEmail && email !== (antes.email as string | null)?.toLowerCase()) {
    await registrarAuditoria(admin, {
      ...base,
      acao: "atualizou",
      detalhes: { ...alvoDescrito, campo: "email", de: antes.email ?? null, para: email },
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

  if (temAtivo && body.ativo !== (antes as { ativo?: boolean }).ativo) {
    await registrarAuditoria(admin, {
      ...base,
      acao: body.ativo ? "reativou" : "desativou",
      detalhes: { ...alvoDescrito, ativo: body.ativo },
    });
  }

  // O VALOR da senha nunca entra no log — só o fato de ter sido trocada,
  // e por quem. Guardar senha em texto num registro que ninguém apaga
  // seria criar o problema que a troca existe para resolver.
  if (temSenha) {
    await registrarAuditoria(admin, {
      ...base,
      acao: "atualizou",
      detalhes: { ...alvoDescrito, campo: "senha", definida_pela_diretoria: true },
    });
  }

  // ---- Link de acesso individual --------------------------------------
  // É o que o cliente pediu no fluxograma ("usuário/login OU link
  // individual") e o que dispensa ditar senha por telefone. Serve para o
  // primeiro acesso e para quem esqueceu — um mecanismo, não dois.
  let link: string | null = null;
  if (body.gerarLink) {
    const destino = new URL("/atendimento", req.url);
    destino.protocol = "https:";
    const { data: gerado, error: erroLink } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: (alvo.email as string),
      options: { redirectTo: destino.toString() },
    });
    if (erroLink || !gerado?.properties?.action_link) {
      return NextResponse.json(
        { error: `não foi possível gerar o link: ${erroLink?.message ?? "erro desconhecido"}` },
        { status: 400 },
      );
    }

    // O SUPABASE SUBSTITUI o destino quando ele não está na lista de URLs
    // permitidas — e devolve o PADRÃO da lista, que não é um endereço
    // válido. O link sairia "funcionando" e jogaria a pessoa no nada.
    // Melhor recusar com instrução do que entregar link quebrado.
    const voltou = new URL(gerado.properties.action_link).searchParams.get("redirect_to") ?? "";
    if (!voltou.startsWith(destino.origin)) {
      return NextResponse.json(
        {
          error:
            `o Supabase recusou o destino do link (devolveu "${voltou}"). ` +
            `Adicione ${destino.origin}/** em Authentication › URL Configuration › Redirect URLs e tente de novo.`,
        },
        { status: 400 },
      );
    }

    link = gerado.properties.action_link;
    await registrarAuditoria(admin, {
      ...base,
      acao: "atualizou",
      detalhes: { ...alvoDescrito, campo: "link_de_acesso", gerado: true },
    });
  }

  return NextResponse.json({ ok: true, agente: alvo, link });
}

// =====================================================================
// DELETE /api/atendimento/agentes?profileId=…  — apaga de verdade.
//
// QUANDO ISTO FUNCIONA, E QUANDO NÃO DEVE FUNCIONAR
// --------------------------------------------------
// Há 53 chaves estrangeiras apontando para `profiles` com `NO ACTION`:
// leads, aprovações, eventos de agenda, mensagens, transferências. Quem
// já trabalhou no sistema NÃO pode ser apagado — o banco recusa, e está
// certo: sumir com a linha destruiria o registro de quem fez o quê, que é
// justamente o que a auditoria existe para preservar.
//
// Então exclusão aqui serve para um caso só: a conta criada por engano,
// que nunca foi usada. Para quem trabalhou, o certo é DESATIVAR — perde o
// acesso na hora (0054) e o histórico continua legível.
//
// Em vez de enumerar as 53 tabelas para "verificar antes", a rota tenta e
// traduz a recusa do banco. Assim nenhuma tabela nova criada depois
// escapa da regra por esquecimento.
// =====================================================================
export async function DELETE(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!sessao.profile?.is_admin_central) {
    return NextResponse.json({ error: "apenas a diretoria pode excluir agentes" }, { status: 403 });
  }

  const profileId = new URL(req.url).searchParams.get("profileId");
  if (!profileId) return NextResponse.json({ error: "profileId é obrigatório" }, { status: 400 });
  if (profileId === sessao.user.id) {
    return NextResponse.json({ error: "você não pode excluir a própria conta" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: alvo } = await admin
    .from("profiles")
    .select("id, nome, email, sector, is_admin_central")
    .eq("id", profileId)
    .maybeSingle();
  if (!alvo) return NextResponse.json({ error: "agente não encontrado" }, { status: 404 });
  if (alvo.is_admin_central) {
    return NextResponse.json({ error: "uma conta da diretoria não pode ser excluída por aqui" }, { status: 400 });
  }

  // O PERFIL VAI PRIMEIRO, de propósito: é ele que o banco protege. Se
  // apagássemos o usuário de auth antes e o perfil fosse recusado,
  // sobraria um perfil sem credencial — visível nas telas, impossível de
  // usar e impossível de apagar pelo mesmo motivo.
  const { error: erroPerfil } = await admin.from("profiles").delete().eq("id", profileId);
  if (erroPerfil) {
    const temHistorico = /violates foreign key|still referenced/i.test(erroPerfil.message);
    return NextResponse.json(
      {
        error: temHistorico
          ? `${alvo.nome} já tem histórico no sistema (conversas, leads ou aprovações) e por isso não pode ser apagada — apagar destruiria o registro de quem fez o quê. Use "Desativar": ela perde o acesso na hora e o histórico continua legível.`
          : erroPerfil.message,
      },
      { status: 400 },
    );
  }

  const { error: erroAuth } = await admin.auth.admin.deleteUser(profileId);
  if (erroAuth) {
    // O perfil já foi embora; avisar é melhor do que fingir sucesso, mas
    // não é caso de erro: a conta não entra mais em lugar nenhum sem
    // perfil (`fn_has_atendimento` devolve false sem linha).
    console.error("agente excluído, mas o usuário de auth resistiu:", erroAuth.message);
  }

  await registrarAuditoria(admin, {
    atorId: sessao.user.id,
    atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
    acao: "excluiu",
    entidade: "profiles",
    entidadeId: profileId,
    detalhes: {
      alvo_nome: alvo.nome ?? null,
      alvo_email: alvo.email ?? null,
      alvo_setor: alvo.sector ?? null,
      auth_removido: !erroAuth,
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true, excluido: profileId });
}
