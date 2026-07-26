import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// Registro de auditoria do Atendimento.
//
// Grava "quem fez o quê" em `atendimento_audit_log`.
//
// ⚠️ ESTADO ATUAL: a tela de leitura (/atendimento/configuracoes/auditoria)
//   já existe e funciona, mas esta função AINDA NÃO está sendo chamada nos
//   pontos de escrita do sistema (criar/editar canal, caixa, macro, agente,
//   token, webhook, resolver conversa, login...). Enquanto ninguém chamar,
//   a tela fica legitimamente vazia. Plugar nos pontos de escrita é da
//   próxima onda.
//
// ⚠️ PERMISSÃO: a tabela tem policy de SELECT para quem tem atendimento e
//   NENHUMA policy de escrita — de propósito. Log que o usuário consegue
//   editar não é log. Portanto o `admin` aqui TEM que ser um cliente de
//   service role (createSupabaseAdmin()); com o cliente do navegador o
//   insert é silenciosamente barrado pelo RLS.
//
// Nunca lança: falhar em auditar não pode derrubar a ação auditada. É pior
// perder o registro do que perder a operação que o usuário pediu.
// =====================================================================

export type EntradaAuditoria = {
  /** profiles.id de quem agiu (null quando foi o sistema/uma automação). */
  atorId?: string | null;
  /** Nome desnormalizado — o log precisa sobreviver ao perfil ser apagado. */
  atorNome?: string | null;
  /** Verbo no passado: "criou", "atualizou", "excluiu", "entrou", "revogou". */
  acao: string;
  /** Tipo do registro afetado: "webhook", "token", "canal", "conversa"... */
  entidade: string;
  entidadeId?: string | null;
  /** Contexto livre: campos alterados, antes/depois, motivo. */
  detalhes?: Record<string, unknown> | null;
  ip?: string | null;
};

export async function registrarAuditoria(
  admin: SupabaseClient,
  entrada: EntradaAuditoria,
): Promise<void> {
  try {
    await admin.from("atendimento_audit_log").insert({
      ator_id: entrada.atorId ?? null,
      ator_nome: entrada.atorNome ?? null,
      acao: entrada.acao,
      entidade: entrada.entidade,
      entidade_id: entrada.entidadeId ?? null,
      detalhes: entrada.detalhes ?? null,
      ip: entrada.ip ?? null,
    });
  } catch {
    /* ver cabeçalho: auditoria é best-effort */
  }
}

/**
 * Extrai o IP do cliente dos headers da requisição.
 * Atrás de proxy/CDN o `x-forwarded-for` vem como "cliente, proxy1, proxy2" —
 * o primeiro da lista é o IP real de quem chamou.
 */
export function ipDaRequisicao(req: Request): string | null {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0]!.trim();
  return req.headers.get("x-real-ip");
}
