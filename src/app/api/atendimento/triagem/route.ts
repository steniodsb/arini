import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import { papelDoPerfil } from "@/lib/atendimento/papel";
import type { AcaoTransferencia, AtendimentoPapel } from "@/lib/types";

// =====================================================================
// POST /api/atendimento/triagem
//
// A única porta de escrita do fluxo CAIXA CENTRAL → TRIAGEM → FILA.
//
// POR QUE ISSO NÃO PODE NASCER NO CLIENTE
// ---------------------------------------
// 1. LOG. Toda mudança de dono precisa responder "quem tirou esse cliente
//    de mim?". Do navegador o insert em `atendimento_transferencias` sai
//    com os campos que o JS resolver mandar — inclusive `feito_por`
//    forjado. Aqui o ator vem da sessão e o "de_equipe/de_agente" vem da
//    linha ANTES da alteração, lida no servidor. Log consistente por
//    construção, não por boa vontade do cliente.
// 2. AUDITORIA. `atendimento_audit_log` não tem policy de escrita — só a
//    service role grava, e a service role não pode ir para o browser.
// 3. ATOMICIDADE PRÁTICA. Triagem é uma ação só para o usuário (fila +
//    responsável + carimbo + nota interna). Espalhada em 4 chamadas do
//    cliente, qualquer falha no meio deixa a conversa num estado torto.
//
// POR QUE A ESCRITA USA A SERVICE ROLE (e não o client de sessão)
// ---------------------------------------------------------------
// A policy `conv_write` da 0040 tem `with check` sobre a linha NOVA. Com
// `recepcao_ve_atribuidas = false`, a recepção que tria deixa de enxergar
// a conversa no instante em que grava `triada_em` — e o próprio UPDATE é
// recusado. Ou seja: a RLS impediria a recepção de fazer exatamente a
// função dela. Por isso:
//   · a LEITURA prévia usa o client de SESSÃO — é a RLS que decide se
//     aquele usuário sequer enxerga a conversa (sem linha = 404);
//   · a ESCRITA usa a service role, depois da checagem de papel abaixo.
// A autoridade continua sendo a RLS para "posso ver?", e o papel decide
// "posso fazer?".
// =====================================================================

/** O que a tela pede. Mapeado abaixo para o vocabulário do log. */
type AcaoPedido =
  | "triagem"           // caixa central → fila (recepção/administrador)
  | "transferencia"     // troca de fila e/ou de atendente (administrador)
  | "assumir"           // atendente pega para si uma conversa da fila dele
  | "retirar"           // tira o responsável, mantém a fila (administrador)
  | "devolver_central"; // volta para o começo do fluxo (administrador)

/**
 * `atendimento_transferencias.acao` só aceita 4 valores (check da 0040).
 * "retirar" e "devolver_central" são as duas caras de `devolver`: em
 * ambas a conversa volta para trás no fluxo. O que distingue as duas no
 * histórico é o `para_equipe` (nulo só na devolução à caixa central).
 */
const ACAO_LOG: Record<AcaoPedido, AcaoTransferencia> = {
  triagem: "triagem",
  transferencia: "transferencia",
  assumir: "assumir",
  retirar: "devolver",
  devolver_central: "devolver",
};

/** Quem pode cada ação. `assumir` fica de fora: ver comentário no uso. */
const PAPEIS_PERMITIDOS: Record<AcaoPedido, AtendimentoPapel[]> = {
  triagem: ["recepcao", "administrador"],
  transferencia: ["administrador"],
  assumir: ["atendente", "recepcao", "administrador"],
  retirar: ["administrador"],
  devolver_central: ["administrador"],
};

type Body = {
  conversationId?: string;
  acao?: AcaoPedido;
  teamId?: string | null;
  responsavelId?: string | null;
  /** Vira nota interna na conversa E `motivo` no log de transferência. */
  observacao?: string | null;
};

export async function POST(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao Atendimento" }, { status: 403 });
  }

  let body: Body;
  try {
    body = (await req.json()) as Body;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const conversationId = body.conversationId?.trim();
  const acao = body.acao;
  if (!conversationId) {
    return NextResponse.json({ error: "conversationId é obrigatório" }, { status: 400 });
  }
  if (!acao || !(acao in ACAO_LOG)) {
    return NextResponse.json(
      { error: `ação inválida — use uma de: ${Object.keys(ACAO_LOG).join(", ")}` },
      { status: 400 },
    );
  }

  const papel = papelDoPerfil(sessao.profile);
  if (!PAPEIS_PERMITIDOS[acao].includes(papel)) {
    return NextResponse.json(
      { error: `seu papel (${papel}) não pode executar esta ação` },
      { status: 403 },
    );
  }

  // --- Estado ANTES, pelo client de sessão -----------------------------
  // Duas funções de uma vez: alimenta o "de → para" do log e serve de
  // porteiro (se a RLS esconde a conversa, não volta linha nenhuma).
  const supabase = createSupabaseServer();
  const { data: antes, error: erroLeitura } = await supabase
    .from("conversations")
    .select("id, team_id, responsavel_id, triada_em, contato_nome, contato_telefone, canal")
    .eq("id", conversationId)
    .maybeSingle();
  if (erroLeitura) return NextResponse.json({ error: erroLeitura.message }, { status: 400 });
  if (!antes) {
    return NextResponse.json(
      { error: "conversa não encontrada ou fora do seu alcance" },
      { status: 404 },
    );
  }

  const deEquipe = (antes.team_id as string | null) ?? null;
  const deAgente = (antes.responsavel_id as string | null) ?? null;
  const jaTriada = Boolean(antes.triada_em);

  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = {};
  let paraEquipe: string | null = deEquipe;
  let paraAgente: string | null = deAgente;

  switch (acao) {
    case "triagem": {
      // Triar sem fila não faz sentido: a fila É o destino da triagem.
      const teamId = body.teamId?.trim();
      if (!teamId) {
        return NextResponse.json({ error: "escolha uma fila para atribuir" }, { status: 400 });
      }
      if (jaTriada) {
        // Não é erro de dado, é corrida: duas recepcionistas na mesma
        // conversa. Avisa em vez de sobrescrever silenciosamente.
        return NextResponse.json(
          { error: "esta conversa já saiu da caixa central (alguém triou antes)" },
          { status: 409 },
        );
      }
      paraEquipe = teamId;
      paraAgente = body.responsavelId?.trim() || null;
      patch.team_id = paraEquipe;
      patch.responsavel_id = paraAgente;
      patch.triada_em = agora;
      patch.triada_por = sessao.user.id;
      break;
    }

    case "transferencia": {
      // Aceita trocar só a fila, só o atendente, ou os dois. `undefined`
      // significa "não mexe"; `null` significa "limpa".
      if (body.teamId !== undefined) {
        paraEquipe = body.teamId?.trim() || null;
        patch.team_id = paraEquipe;
      }
      if (body.responsavelId !== undefined) {
        paraAgente = body.responsavelId?.trim() || null;
        patch.responsavel_id = paraAgente;
      }
      if (Object.keys(patch).length === 0) {
        return NextResponse.json({ error: "nada para transferir" }, { status: 400 });
      }
      // Transferir uma conversa que nunca foi triada carimba a triagem: o
      // destino já está definido, então ela não pertence mais à caixa.
      if (!jaTriada) {
        patch.triada_em = agora;
        patch.triada_por = sessao.user.id;
      }
      break;
    }

    case "assumir": {
      // Não checamos "a fila é dele?" aqui: a RLS já respondeu isso na
      // leitura acima — quem não participa da fila não enxerga a linha.
      // Duplicar a regra em TS só criaria uma segunda versão dela.
      if (deAgente && deAgente !== sessao.user.id) {
        return NextResponse.json(
          { error: "esta conversa já tem responsável — peça a transferência ao administrador" },
          { status: 409 },
        );
      }
      paraAgente = sessao.user.id;
      patch.responsavel_id = paraAgente;
      break;
    }

    case "retirar": {
      if (!deAgente) {
        return NextResponse.json({ error: "esta conversa não tem responsável" }, { status: 400 });
      }
      paraAgente = null;
      patch.responsavel_id = null;
      break;
    }

    case "devolver_central": {
      // Volta ao começo: sem fila, sem responsável, sem carimbo. É o único
      // caminho de volta para a caixa central.
      paraEquipe = null;
      paraAgente = null;
      patch.team_id = null;
      patch.responsavel_id = null;
      patch.triada_em = null;
      patch.triada_por = null;
      break;
    }
  }

  // --- Escrita (service role — ver cabeçalho) ---------------------------
  const admin = createSupabaseAdmin();
  const { data: depois, error: erroUpdate } = await admin
    .from("conversations")
    .update(patch)
    .eq("id", conversationId)
    .select("*")
    .maybeSingle();
  if (erroUpdate) return NextResponse.json({ error: erroUpdate.message }, { status: 400 });
  if (!depois) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });

  const observacao = body.observacao?.trim() || null;

  // --- Log de transferência ---------------------------------------------
  // Best-effort igual à auditoria: perder o registro é ruim, desfazer a
  // operação que o usuário pediu é pior.
  const { data: transferencia } = await admin
    .from("atendimento_transferencias")
    .insert({
      conversation_id: conversationId,
      acao: ACAO_LOG[acao],
      de_equipe: deEquipe,
      para_equipe: paraEquipe,
      de_agente: deAgente,
      para_agente: paraAgente,
      motivo: observacao,
      feito_por: sessao.user.id,
    })
    .select("*")
    .maybeSingle();

  // --- Observação vira nota interna --------------------------------------
  // O log serve à auditoria; a nota serve a quem vai atender e abre a
  // conversa. São públicos diferentes, por isso a observação vai nos dois.
  // Também pela service role: depois de triar, a recepção pode já não
  // enxergar a conversa (recepcao_ve_atribuidas = false) e o insert em
  // `messages` seria recusado pela policy que segue a conversa-mãe.
  if (observacao) {
    await admin.from("messages").insert({
      conversation_id: conversationId,
      direcao: "out",
      remetente: "atendente",
      autor_id: sessao.user.id,
      tipo: "texto",
      conteudo: observacao,
      interna: true,
      status: "enviada",
      mentions: [],
    });
  }

  await registrarAuditoria(admin, {
    atorId: sessao.user.id,
    atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
    acao: "atualizou",
    entidade: "conversations",
    entidadeId: conversationId,
    detalhes: {
      campo: "triagem",
      acao_triagem: acao,
      de_equipe: deEquipe,
      para_equipe: paraEquipe,
      de_agente: deAgente,
      para_agente: paraAgente,
      contato: (antes.contato_nome as string | null) ?? (antes.contato_telefone as string | null),
      // O texto da observação NÃO vai para a auditoria: ele já está na
      // conversa como nota interna e no log de transferência. Duplicar
      // conteúdo livre num log que ninguém consegue apagar é passivo.
      tem_observacao: Boolean(observacao),
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true, conversa: depois, transferencia: transferencia ?? null });
}
