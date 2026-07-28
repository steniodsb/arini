import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import { dispararResolucao } from "@/lib/atendimento/triggers";
import {
  emitirConversaAtualizada,
  emitirConversaResolvida,
} from "@/lib/atendimento/webhook-eventos";
import { CONVERSATION_STATUS_LABELS, type ConversationStatus } from "@/lib/types";

// =====================================================================
// POST /api/atendimento/conversas/<id>/status   { status, snoozedUntil? }
//
// Muda o status de UMA conversa pelo servidor.
//
// POR QUE ESTA ROTA EXISTE
// ------------------------
// Hoje o inbox (src/app/atendimento/AtendimentoInbox.tsx) faz o update
// direto no Supabase pelo navegador. Funciona — a RLS permite —, mas três
// coisas simplesmente não acontecem quando a escrita nasce no cliente:
//
//   1. AUDITORIA. `atendimento_audit_log` não tem policy de escrita (de
//      propósito: log editável pelo próprio usuário não é log). Só a
//      service role grava, e a service role não pode ir para o navegador.
//   2. WEBHOOK DE SAÍDA. `atendimento_webhooks` guarda o `secret` de cada
//      endpoint; assinar o corpo no cliente exigiria expor esse segredo.
//   3. AUTOMAÇÕES de "conversa_resolvida". Ninguém as dispara hoje.
//
// Esta rota resolve os três de uma vez.
//
// COMO LIGAR O INBOX NELA (é o passo que falta)
// ---------------------------------------------
// Em `mudarStatus` / na ação em massa, troque o
//   `supa().from("conversations").update(patch).eq("id", id)`
// por:
//   await fetch(`/api/atendimento/conversas/${id}/status`, {
//     method: "POST",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ status: "resolvida" }),
//   });
// A resposta traz `{ ok, conversa }` com a linha já atualizada, então o
// estado otimista da tela pode ser reconciliado com `conversa` em vez de
// ser remontado à mão. Enquanto isso não acontece, o inbox continua
// funcionando pelo caminho antigo — só sem rastro nem webhook.
//
// PERMISSÃO
// ---------
// A escrita usa o client de SESSÃO, não a service role: a RLS continua
// sendo a autoridade sobre quais conversas aquele agente pode alterar.
// A service role entra apenas para gravar o log de auditoria e disparar
// os webhooks — duas coisas que a RLS bloqueia por desenho.
// =====================================================================

const STATUS_VALIDOS: ConversationStatus[] = ["aberta", "pendente", "resolvida", "adiada"];

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao Atendimento" }, { status: 403 });
  }

  let body: { status?: string; snoozedUntil?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const status = body.status as ConversationStatus | undefined;
  if (!status || !STATUS_VALIDOS.includes(status)) {
    return NextResponse.json(
      { error: `status inválido — use um de: ${STATUS_VALIDOS.join(", ")}` },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServer();

  // Lê o estado ANTES para o log dizer "de X para Y". Sem isso a auditoria
  // vira "fulano atualizou" — verdadeiro e inútil.
  const { data: antes } = await supabase
    .from("conversations")
    .select("id, canal, status, contato_nome, contato_telefone, lead_id")
    .eq("id", params.id)
    .maybeSingle();
  if (!antes) return NextResponse.json({ error: "conversa não encontrada" }, { status: 404 });

  const agora = new Date().toISOString();
  const patch: Record<string, unknown> = { status };

  if (status === "resolvida") {
    patch.resolvida_em = agora;
    patch.resolvida_por = sessao.user.id;
    patch.snoozed_until = null;
  } else {
    // Sair de "resolvida" tem que limpar o carimbo, senão os relatórios
    // contam como resolvida uma conversa que voltou a estar aberta.
    patch.resolvida_em = null;
    patch.resolvida_por = null;
    patch.snoozed_until = status === "adiada" ? (body.snoozedUntil ?? null) : null;
  }

  const { data: depois, error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", params.id)
    .select("id, canal, status, contato_nome, contato_telefone, lead_id, resolvida_em, resolvida_por")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  // Sem linha de volta com update sem erro = a RLS barrou a escrita.
  if (!depois) {
    return NextResponse.json({ error: "sem permissão para alterar esta conversa" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();
  const statusAnterior = antes.status as ConversationStatus;

  // --- Auditoria -------------------------------------------------------
  // Mesmo verbo para qualquer transição: o "o quê" mora em `detalhes`,
  // não no nome da ação. Assim a tela de auditoria consegue filtrar por
  // "atualizou" sem ter que conhecer uma lista de verbos por status.
  await registrarAuditoria(admin, {
    atorId: sessao.user.id,
    atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
    acao: "atualizou",
    entidade: "conversations",
    entidadeId: params.id,
    detalhes: {
      campo: "status",
      de: statusAnterior,
      para: status,
      de_rotulo: CONVERSATION_STATUS_LABELS[statusAnterior] ?? statusAnterior,
      para_rotulo: CONVERSATION_STATUS_LABELS[status] ?? status,
      contato: antes.contato_nome ?? antes.contato_telefone ?? null,
    },
    ip: ipDaRequisicao(req),
  });

  // --- Webhooks de saída ------------------------------------------------
  // Resolver tem evento próprio porque é o gancho que as integrações
  // realmente querem (fechar ticket, disparar CSAT). Nada disso bloqueia
  // a resposta — ver src/lib/atendimento/webhook-eventos.ts.
  const conversaEvento = {
    id: params.id,
    canal: depois.canal as string | null,
    status: depois.status as string | null,
    contato_nome: depois.contato_nome as string | null,
    contato_telefone: depois.contato_telefone as string | null,
    lead_id: depois.lead_id as string | null,
  };

  if (status === "resolvida" && statusAnterior !== "resolvida") {
    emitirConversaResolvida(admin, conversaEvento, {
      resolvida_em: (depois.resolvida_em as string | null) ?? agora,
      resolvida_por: (depois.resolvida_por as string | null) ?? sessao.user.id,
    });
    // Automações de "conversa_resolvida" — este é o único lugar do sistema
    // que as dispara. `dispararResolucao` nunca lança.
    await dispararResolucao(admin, params.id);
  } else if (statusAnterior !== status) {
    emitirConversaAtualizada(admin, conversaEvento, {
      campo: "status",
      de: statusAnterior,
      para: status,
    });
  }
  // Repetir o mesmo status não emite nada: um clique duplo no botão não
  // deve virar dois eventos idênticos no endpoint do cliente.

  return NextResponse.json({ ok: true, conversa: depois });
}
