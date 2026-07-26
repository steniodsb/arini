import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent } from "@/lib/types";

// =====================================================================
// Webhooks de SAÍDA do Atendimento.
//
// Manda os eventos do sistema (conversa criada, mensagem criada, ...)
// para as URLs que a diretoria cadastrou em `atendimento_webhooks`.
//
// ⚠️ ESTADO ATUAL — seja honesto com quem lê:
//   Este módulo está PRONTO e é seguro de chamar, mas o gancho ainda NÃO
//   está plugado nos pontos onde os eventos acontecem (criação de
//   conversa, chegada de mensagem, resolução...). Isso é da próxima onda.
//   Hoje só a rota /api/atendimento/webhooks/testar usa o disparo, para o
//   usuário conferir se o endpoint dele responde.
//
// Regras de projeto:
//   · NUNCA lança. Quem vai chamar isso é o handler de webhook de ENTRADA,
//     que precisa devolver 200 para o provedor (senão o WhatsApp/Meta fica
//     reenviando a mesma mensagem). Um endpoint do cliente fora do ar não
//     pode derrubar o recebimento.
//   · Cada tentativa vira uma linha em `atendimento_webhook_deliveries`,
//     para dar para depurar do lado de cá.
//   · Depois de LIMITE_FALHAS erros seguidos o webhook é desativado
//     sozinho — senão um endpoint morto fica sendo chamado para sempre,
//     gastando tempo de execução em toda mensagem que entra.
//
// Como o outro lado confere a assinatura (Node):
//   const esperado = "sha256=" + crypto
//     .createHmac("sha256", SEU_SECRET)
//     .update(corpoBrutoDaRequisicao)   // o texto CRU, não o JSON.parse
//     .digest("hex");
//   crypto.timingSafeEqual(Buffer.from(esperado), Buffer.from(header));
// =====================================================================

/** Erros seguidos até o webhook ser desligado automaticamente. */
export const LIMITE_FALHAS = 10;

/** Tempo máximo esperando o endpoint do cliente responder. */
const TIMEOUT_MS = 10_000;

/** Linha mínima de `atendimento_webhooks` necessária para entregar. */
export type WebhookAlvo = {
  id: string;
  url: string;
  secret: string;
  falhas_seguidas: number;
};

export type ResultadoEntrega = {
  ok: boolean;
  /** Status HTTP devolvido pelo endpoint, ou null se nem chegou a responder. */
  status: number | null;
  duracao_ms: number;
  erro: string | null;
};

/**
 * HMAC-SHA256 do corpo exatamente como ele vai no fio, em hexadecimal.
 * O header sai no formato `sha256=<hex>` (mesma convenção do GitHub) —
 * o prefixo deixa espaço para trocar de algoritmo um dia sem quebrar
 * quem já valida.
 */
export function assinarCorpo(secret: string, corpo: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(corpo).digest("hex");
}

/** Monta o corpo padrão de um evento. Mesmo formato para teste e produção. */
export function montarPayload(evento: string, dados: Record<string, unknown>) {
  return {
    evento,
    enviado_em: new Date().toISOString(),
    dados,
  };
}

/**
 * Faz UMA entrega: POST assinado, grava a tentativa e atualiza o estado do
 * webhook. Nunca lança — devolve o resultado.
 *
 * `desativarAposFalhas` fica false no teste manual: se o dev está testando
 * é porque está mexendo na integração; seria hostil desligar o webhook por
 * causa de tentativas que ele próprio disparou para depurar.
 */
export async function entregarWebhook(
  admin: SupabaseClient,
  alvo: WebhookAlvo,
  evento: string,
  dados: Record<string, unknown>,
  opcoes: { desativarAposFalhas?: boolean } = {},
): Promise<ResultadoEntrega> {
  const { desativarAposFalhas = true } = opcoes;
  const payload = montarPayload(evento, dados);
  const corpo = JSON.stringify(payload);
  const inicio = Date.now();

  let status: number | null = null;
  let erro: string | null = null;

  try {
    const resposta = await fetch(alvo.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arini-Signature": assinarCorpo(alvo.secret, corpo),
        "X-Arini-Evento": evento,
      },
      body: corpo,
      // AbortSignal.timeout evita ficar pendurado num endpoint que aceita a
      // conexão e nunca responde.
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    status = resposta.status;
    if (!resposta.ok) {
      // Só o começo do corpo: a resposta de erro pode ser um HTML gigante.
      const texto = await resposta.text().catch(() => "");
      erro = `HTTP ${resposta.status}${texto ? ` — ${texto.slice(0, 300)}` : ""}`;
    }
  } catch (e) {
    // TimeoutError, DNS, TLS, connection refused... tudo cai aqui.
    erro = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
  }

  const duracao_ms = Date.now() - inicio;
  const ok = erro == null;

  // A partir daqui é só bookkeeping: se o banco falhar, engolimos, porque
  // a entrega em si já aconteceu e não pode virar exceção para quem chamou.
  try {
    await admin.from("atendimento_webhook_deliveries").insert({
      webhook_id: alvo.id,
      evento,
      payload,
      status,
      erro,
      duracao_ms,
    });

    const falhas = ok ? 0 : (alvo.falhas_seguidas ?? 0) + 1;
    const estourou = desativarAposFalhas && falhas >= LIMITE_FALHAS;
    await admin
      .from("atendimento_webhooks")
      .update({
        ultimo_status: status,
        ultimo_erro: estourou
          ? `Desativado automaticamente após ${falhas} falhas seguidas. Último erro: ${erro ?? "desconhecido"}`
          : erro,
        ultimo_envio_em: new Date().toISOString(),
        falhas_seguidas: falhas,
        ...(estourou ? { ativo: false } : {}),
      })
      .eq("id", alvo.id);
  } catch {
    /* auditoria da entrega é best-effort */
  }

  return { ok, status, duracao_ms, erro };
}

/**
 * Dispara um evento para TODOS os webhooks ativos que assinaram ele.
 *
 * Em paralelo (Promise.allSettled) para que um endpoint lento não segure os
 * outros, e sem `throw` em nenhuma hipótese.
 *
 * Uso pretendido (próxima onda), dentro do handler de entrada:
 *   await dispararWebhooks(admin, "mensagem_criada", { conversa_id, mensagem });
 */
export async function dispararWebhooks(
  admin: SupabaseClient,
  evento: WebhookEvent,
  dados: Record<string, unknown>,
): Promise<void> {
  try {
    const { data, error } = await admin
      .from("atendimento_webhooks")
      .select("id, url, secret, falhas_seguidas")
      .eq("ativo", true)
      // `contains` vira o operador @> do Postgres em text[]: pega as linhas
      // cujo array `eventos` inclui este evento.
      .contains("eventos", [evento]);

    if (error || !data || data.length === 0) return;

    await Promise.allSettled(
      (data as WebhookAlvo[]).map((alvo) => entregarWebhook(admin, alvo, evento, dados)),
    );
  } catch {
    /* silencioso de propósito — ver cabeçalho do arquivo */
  }
}
