import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// Registro de auditoria do Atendimento.
//
// Grava "quem fez o quê" em `atendimento_audit_log`.
//
// ESTADO ATUAL: a função ESTÁ instrumentada. O inventário do que é
//   registrado hoje — e do que continua sem rastro, com o motivo — está no
//   bloco de comentário no FIM deste arquivo. Consulte-o antes de sair
//   procurando chamadas por grep.
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

/* =====================================================================
 * INVENTÁRIO DA INSTRUMENTAÇÃO — atualizado nesta onda.
 *
 * Se você adicionar ou remover um `registrarAuditoria`, ATUALIZE AQUI.
 * A tela /atendimento/configuracoes/auditoria só mostra o que estiver
 * nesta lista; qualquer "buraco" percebido pelo usuário deve ser
 * conferido contra ela antes de virar bug.
 *
 * VOCABULÁRIO DE `acao` (verbos curtos, snake_case, sempre no passado):
 *   criou · atualizou · excluiu · importou · mesclou · conectou ·
 *   desconectou · regenerou_segredo · revogou · entrou ·
 *   liberou_acesso · revogou_acesso · testou
 * `entidade` é o NOME DA TABELA afetada. Duas exceções antigas ficaram
 * como estavam para não invalidar as linhas já gravadas: "token_api"
 * (tabela `atendimento_api_tokens`) e "webhook" (`atendimento_webhooks`).
 * Em código NOVO, use o nome da tabela.
 *
 * ---------------------------------------------------------------------
 * INSTRUMENTADO
 * ---------------------------------------------------------------------
 * atendimento_channels
 *   · criou              — api/atendimento/canais/route.ts (POST)
 *   · conectou           — api/atendimento/canais/[id]/[acao] (Evolution,
 *                          Telegram, Cloud API)
 *   · desconectou        — idem
 *   · regenerou_segredo  — api/atendimento/canais/segredo (troca de
 *                          `webhook_secret`; derruba a integração antiga)
 *   · atualizou          — api/atendimento/canais/segredo (1ª geração do
 *                          segredo ou só mudança de callback_url)
 *   Em NENHUM caso `detalhes` carrega `config`: ali moram api_key,
 *   access_token, bot_token e app_secret. Só nomes de campo.
 *
 * profiles
 *   · liberou_acesso / revogou_acesso — api/atendimento/agentes (mudança
 *     de `atendimento_access`; é mudança de PERMISSÃO, o caso que mais
 *     precisa de rastro)
 *   · entrou — api/atendimento/login, chamado pelo LoginForm logo após o
 *     signInWithPassword dar certo. NÃO fica no `getAtendimentoUser`: ele
 *     roda em toda página e geraria uma linha por navegação. Por cima
 *     disso a rota deduplica numa janela de 30 min, para um script em laço
 *     não inundar o log.
 *
 * conversations
 *   · atualizou — api/atendimento/conversas/[id]/status (troca de status,
 *     com "de → para" em `detalhes`)
 *   · excluiu   — api/atendimento/conversas (DELETE em lote; lê os alvos
 *     ANTES de apagar para o log guardar canal e contato)
 *
 * leads (contatos)
 *   · criou / atualizou / excluiu / importou / mesclou —
 *     api/atendimento/contatos. Os valores dos campos NÃO vão para o log
 *     (dado pessoal duplicado sem ganho de rastro); vão os nomes dos
 *     campos e o nome do contato.
 *
 * atendimento_api_tokens
 *   · criou / revogou — api/atendimento/tokens  (já existia)
 *
 * atendimento_webhooks
 *   · testou — api/atendimento/webhooks/testar  (já existia)
 *
 * ---------------------------------------------------------------------
 * SEM RASTRO — e por quê
 * ---------------------------------------------------------------------
 * · EXCLUSÃO DE CANAL: não existe caminho de exclusão no sistema (nem
 *   rota, nem botão). Não há o que instrumentar; quando alguém criar a
 *   exclusão, o log tem que nascer junto.
 * · INBOX (AtendimentoInbox.tsx): resolver, reabrir, adiar, atribuir e
 *   excluir conversa ainda escrevem direto do navegador. Do cliente é
 *   IMPOSSÍVEL auditar — esta tabela não tem policy de escrita e a
 *   service role não pode ir para o browser. As rotas
 *   /api/atendimento/conversas/[id]/status e /api/atendimento/conversas
 *   já existem prontas; falta o inbox chamá-las.
 * · CONFIGURAÇÕES (caixas, macros, automações, SLA, etiquetas, equipes,
 *   papéis, atributos, segmentos, templates, webhooks, integrações):
 *   todas essas telas gravam direto pelo cliente com RLS. Instrumentar
 *   cada uma exige criar uma rota de API por tela — trabalho real, não
 *   uma linha. Ficou de fora desta onda de propósito; é o próximo passo
 *   natural e o padrão a seguir é o de agentes/route.ts.
 * · LEITURA: nada de consulta é registrado (só escrita). Log de leitura
 *   cresce ordens de grandeza mais rápido e não foi pedido.
 * ===================================================================== */
