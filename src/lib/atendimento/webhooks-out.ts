import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { WebhookEvent } from "@/lib/types";

// =====================================================================
// Webhooks de SAÍDA do Atendimento.
//
// Manda os eventos do sistema (conversa criada, mensagem criada, ...)
// para as URLs que a diretoria cadastrou em `atendimento_webhooks`.
//
// ESTADO ATUAL: os ganchos ESTÃO plugados. O inventário completo (o que
// dispara, de onde, e o que ficou de fora) está no bloco de comentário no
// FIM deste arquivo — leia-o antes de sair caçando chamada por grep.
//
// Não chame `dispararWebhooks` direto de uma rota: use os `emitir*` de
// src/lib/atendimento/webhook-eventos.ts. Eles padronizam o payload,
// filtram o que não pode sair (segredo, raw_payload) e não bloqueiam a
// resposta. A exceção é /api/atendimento/webhooks/testar, que usa
// `entregarWebhook` de propósito para devolver o resultado ao usuário.
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
 * NÃO chame esta função direto de uma rota — chame os `emitir*` de
 * webhook-eventos.ts, que montam o payload padrão e não bloqueiam.
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

/* =====================================================================
 * INVENTÁRIO DOS GANCHOS — atualizado nesta onda.
 *
 * Objetivo deste bloco: quem for mexer nos webhooks de saída não precisa
 * caçar `emitir*` por grep para saber o que está ligado. Se você
 * adicionar ou remover um gancho, ATUALIZE AQUI.
 *
 * Todos os disparos passam por src/lib/atendimento/webhook-eventos.ts
 * (`emitirConversaCriada`, `emitirMensagemCriada`, ...), que monta o
 * payload padrão e NÃO bloqueia a resposta.
 *
 * ---------------------------------------------------------------------
 * LIGADO
 * ---------------------------------------------------------------------
 * conversa_criada
 *   · src/lib/atendimento/inbound.ts        (e-mail, SMS e API genérica)
 *   · src/app/api/webhooks/evolution/route.ts        (WhatsApp via QR)
 *   · src/app/api/webhooks/telegram/route.ts
 *   · src/app/api/webhooks/[platform]/route.ts       (WhatsApp Cloud,
 *     Instagram, Facebook, Messenger)
 *   · src/app/api/widget/[token]/session/route.ts    (chat do site — a
 *     conversa do widget nasce na /session, não na /messages)
 *
 * mensagem_criada
 *   · src/lib/atendimento/inbound.ts                 (entrada)
 *   · src/app/api/webhooks/evolution/route.ts        (entrada E o eco de
 *     `fromMe`, que é resposta dada pelo celular)
 *   · src/app/api/webhooks/telegram/route.ts         (entrada)
 *   · src/app/api/webhooks/[platform]/route.ts       (entrada)
 *   · src/app/api/widget/[token]/messages/route.ts   (chat do site)
 *   · src/app/api/atendimento/send/route.ts          (resposta do agente;
 *     dispara mesmo com falha de envio ao provedor — a mensagem existe no
 *     histórico. NOTA INTERNA NÃO DISPARA: aquele ramo retorna antes.)
 *
 * conversa_resolvida
 *   · src/app/api/atendimento/conversas/[id]/status/route.ts
 *   · src/lib/atendimento/automations.ts  (ação `mudar_status` = resolvida)
 *
 * conversa_atualizada
 *   · src/app/api/atendimento/conversas/[id]/status/route.ts (troca de
 *     status que não é resolução)
 *   · src/lib/atendimento/automations.ts  (qualquer outro patch de regra:
 *     atribuir agente/equipe, prioridade, etiquetas)
 *
 * contato_criado
 *   · src/lib/atendimento/inbound.ts
 *   · src/app/api/webhooks/evolution/route.ts
 *   · src/app/api/webhooks/telegram/route.ts
 *   · src/app/api/webhooks/[platform]/route.ts
 *   · src/app/api/widget/[token]/session/route.ts
 *   · src/app/api/atendimento/contatos/route.ts      (ação "criar")
 *   Em TODOS os casos só quando o dedupe falhou, ou seja, quando a pessoa
 *   é mesmo nova no CRM. Contato reaproveitado não emite nada.
 *
 * ---------------------------------------------------------------------
 * NÃO LIGADO — e por quê
 * ---------------------------------------------------------------------
 * · AtendimentoInbox.tsx (resolver/reabrir/adiar pelo inbox, e a ação em
 *   massa) continua escrevendo direto no Supabase pelo navegador, então
 *   NÃO emite nada. Do cliente é impossível: assinar o corpo exigiria o
 *   `secret` de cada webhook no navegador. A rota
 *   /api/atendimento/conversas/[id]/status já existe pronta para receber
 *   essa chamada — ligar o inbox nela é o passo que falta.
 * · Exclusão de conversa e de contato não emite nada: `WebhookEvent` não
 *   tem evento de exclusão e inventar um fora do contrato quebraria os
 *   consumidores. Precisaria de tipo novo + migração.
 * · Importação de contatos em massa (contatos/route.ts, ação "importar")
 *   NÃO emite `contato_criado`: uma planilha de 2 mil linhas viraria 2
 *   mil POSTs e derrubaria o webhook pelo LIMITE_FALHAS.
 * · Notas internas nunca emitem — são conversa da equipe.
 * · Mudança de responsável/prioridade/etiqueta feita À MÃO no inbox não
 *   emite `conversa_atualizada` (mesmo motivo do primeiro item). Pela
 *   automação, emite.
 * · `atendimento_channels`, macros, caixas, SLA e etiquetas não têm
 *   evento no contrato — auditoria cobre esses casos, não webhook.
 * ===================================================================== */
