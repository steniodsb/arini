import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";

// =====================================================================
// DELETE /api/atendimento/conversas   { ids: string[] }
//
// Exclusão de conversas COM rastro.
//
// POR QUE EXISTE: apagar conversa é a operação mais destrutiva do inbox —
// leva junto as mensagens (cascade) e não tem desfazer. É exatamente o
// tipo de coisa que precisa responder "quem apagou isso?". Hoje o inbox
// (AtendimentoInbox.tsx, ação em massa) apaga direto pelo navegador, e o
// log de auditoria não tem policy de escrita para o usuário — logo, do
// cliente é impossível registrar. Daí a rota.
//
// COMO LIGAR O INBOX NELA (passo que falta):
//   await fetch("/api/atendimento/conversas", {
//     method: "DELETE",
//     headers: { "Content-Type": "application/json" },
//     body: JSON.stringify({ ids: [...idsSelecionados] }),
//   });
//
// A exclusão em si usa o client de SESSÃO: a RLS continua decidindo quais
// conversas aquele agente pode apagar. A service role entra só para
// gravar o log.
//
// De propósito NÃO há webhook de saída aqui: `WebhookEvent` não tem
// "conversa_excluida" e inventar um evento fora do contrato quebraria os
// consumidores. Se um dia fizer falta, é migração + tipo novo.
// =====================================================================

/** Teto por chamada — evita um clique errado varrer a base inteira. */
const MAX_POR_CHAMADA = 200;

export async function DELETE(req: Request) {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao Atendimento" }, { status: 403 });
  }

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const ids = Array.isArray(body.ids)
    ? body.ids.filter((v): v is string => typeof v === "string" && v.trim() !== "")
    : [];
  if (ids.length === 0) {
    return NextResponse.json({ error: "informe ao menos um id" }, { status: 400 });
  }
  if (ids.length > MAX_POR_CHAMADA) {
    return NextResponse.json(
      { error: `no máximo ${MAX_POR_CHAMADA} conversas por vez` },
      { status: 400 },
    );
  }

  const supabase = createSupabaseServer();

  // Lê ANTES de apagar: depois do delete não há de onde tirar canal e
  // contato, e um log que só guarda uuid não conta a história para ninguém.
  const { data: alvos } = await supabase
    .from("conversations")
    .select("id, canal, status, contato_nome, contato_telefone")
    .in("id", ids);

  const { data: apagadas, error } = await supabase
    .from("conversations")
    .delete()
    .in("id", ids)
    .select("id");

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const idsApagados = ((apagadas ?? []) as { id: string }[]).map((r) => r.id);
  if (idsApagados.length === 0) {
    return NextResponse.json({ error: "sem permissão para excluir essas conversas" }, { status: 403 });
  }

  const detalhesAlvos = ((alvos ?? []) as Record<string, unknown>[])
    .filter((c) => idsApagados.includes(c.id as string))
    .map((c) => ({
      id: c.id,
      canal: c.canal,
      status: c.status,
      contato: (c.contato_nome as string | null) ?? (c.contato_telefone as string | null) ?? null,
    }));

  // Uma linha de log por chamada, com a lista dentro: a leitura "fulano
  // apagou 12 conversas às 14h" é mais útil do que 12 linhas soltas.
  await registrarAuditoria(createSupabaseAdmin(), {
    atorId: sessao.user.id,
    atorNome: sessao.profile?.nome ?? sessao.user.email ?? null,
    acao: "excluiu",
    entidade: "conversations",
    // Só faz sentido apontar uma entidade quando foi uma conversa só.
    entidadeId: idsApagados.length === 1 ? idsApagados[0] : null,
    detalhes: { quantidade: idsApagados.length, conversas: detalhesAlvos },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true, excluidas: idsApagados.length });
}
