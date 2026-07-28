import type { SupabaseClient } from "@supabase/supabase-js";
import { dispararWebhooks } from "./webhooks-out";
import type { WebhookEvent } from "@/lib/types";

// =====================================================================
// Ponte entre os EVENTOS reais do atendimento e os webhooks de saída.
//
// POR QUE ESTE ARQUIVO EXISTE (e não chamar `dispararWebhooks` direto):
//
//  1) FORMATO ÚNICO DO PAYLOAD. Quem consome o webhook precisa receber a
//     mesma forma venha a mensagem do WhatsApp, do Telegram, do chat do
//     site ou da API genérica. Se cada rota montasse o objeto à mão, o
//     integrador teria que escrever um parser por canal — e a primeira
//     divergência só apareceria em produção.
//
//  2) LISTA BRANCA DE CAMPOS. O payload é montado a partir de um recorte
//     explícito: id, canal, status, contato (nome/telefone) e, na
//     mensagem, texto/direção. NADA de `raw_payload`, token, segredo de
//     canal, `webhook_secret` ou credencial. Isso não é higiene opcional:
//     a URL de destino é cadastrada pelo cliente e o corpo vai por HTTP
//     para fora da nossa infraestrutura.
//
//  3) DISPARO QUE NÃO BLOQUEIA. Todas as funções daqui são `void`, não
//     `async`: elas soltam a promessa e voltam na hora. Um webhook de
//     ENTRADA (Evolution, Telegram, Meta) precisa devolver 200 rápido,
//     senão o provedor reenfileira a mesma mensagem — e o endpoint do
//     cliente pode levar até 10 s (TIMEOUT_MS de webhooks-out) para
//     responder. Esperar por ele seria trocar a confiabilidade do
//     recebimento pela entrega de uma notificação secundária.
//
//     PREÇO HONESTO DESSA ESCOLHA: em runtime serverless o processo pode
//     ser congelado assim que a resposta HTTP sai, e a entrega em voo
//     morre junto. Perde-se a notificação, nunca a mensagem. Quando o
//     projeto tiver `waitUntil` disponível, é aqui — num lugar só — que
//     ele deve ser plugado.
//
//     `dispararWebhooks` nunca lança e nunca rejeita (try/catch +
//     Promise.allSettled internos), então o `void` não gera
//     unhandledRejection.
// =====================================================================

/** Recorte da conversa que pode sair para fora. */
export type ConversaEvento = {
  id: string;
  canal?: string | null;
  status?: string | null;
  contato_nome?: string | null;
  contato_telefone?: string | null;
  lead_id?: string | null;
};

/** Recorte da mensagem que pode sair para fora. */
export type MensagemEvento = {
  id?: string | null;
  direcao: "in" | "out";
  remetente?: string | null;
  tipo?: string | null;
  texto?: string | null;
  criada_em?: string | null;
};

/** Recorte do contato (`leads`) que pode sair para fora. */
export type ContatoEvento = {
  id: string;
  nome?: string | null;
  telefone?: string | null;
  email?: string | null;
  origem?: string | null;
};

/** Bloco `conversa` — idêntico em todos os eventos que citam uma conversa. */
function blocoConversa(c: ConversaEvento) {
  return {
    id: c.id,
    canal: c.canal ?? null,
    status: c.status ?? null,
    contato: {
      // `lead_id` é a chave estável do contato no CRM; é o que o
      // integrador usa para casar a conversa com a ficha dele.
      id: c.lead_id ?? null,
      nome: c.contato_nome ?? null,
      telefone: c.contato_telefone ?? null,
    },
  };
}

/**
 * Solta o disparo sem esperar. Único ponto do sistema que faz isso —
 * ver item 3 do cabeçalho.
 */
function emitir(admin: SupabaseClient, evento: WebhookEvent, dados: Record<string, unknown>): void {
  void dispararWebhooks(admin, evento, dados);
}

/** A conversa acabou de nascer (qualquer canal). */
export function emitirConversaCriada(admin: SupabaseClient, conversa: ConversaEvento): void {
  emitir(admin, "conversa_criada", { conversa: blocoConversa(conversa) });
}

/**
 * A conversa mudou de estado por ação de gente (status, responsável...).
 * `mudanca` é livre e serve para o consumidor saber O QUE mudou sem ter
 * que comparar com o estado anterior dele.
 */
export function emitirConversaAtualizada(
  admin: SupabaseClient,
  conversa: ConversaEvento,
  mudanca?: Record<string, unknown>,
): void {
  emitir(admin, "conversa_atualizada", {
    conversa: blocoConversa(conversa),
    ...(mudanca ? { mudanca } : {}),
  });
}

/**
 * Caso especial de atualização com evento próprio: é o gancho que a
 * maioria das integrações quer (fechar ticket, disparar pesquisa, etc.).
 */
export function emitirConversaResolvida(
  admin: SupabaseClient,
  conversa: ConversaEvento,
  extra?: { resolvida_em?: string | null; resolvida_por?: string | null },
): void {
  emitir(admin, "conversa_resolvida", {
    conversa: blocoConversa({ ...conversa, status: "resolvida" }),
    resolvida_em: extra?.resolvida_em ?? new Date().toISOString(),
    resolvida_por: extra?.resolvida_por ?? null,
  });
}

/**
 * Mensagem gravada na conversa — de entrada (cliente) ou de saída
 * (atendente). NOTA INTERNA NÃO PASSA POR AQUI: é conversa da equipe e
 * não pode vazar para um endpoint externo. Quem chama filtra.
 */
export function emitirMensagemCriada(
  admin: SupabaseClient,
  conversa: ConversaEvento,
  mensagem: MensagemEvento,
): void {
  emitir(admin, "mensagem_criada", {
    conversa: blocoConversa(conversa),
    mensagem: {
      id: mensagem.id ?? null,
      direcao: mensagem.direcao,
      remetente: mensagem.remetente ?? null,
      tipo: mensagem.tipo ?? "texto",
      texto: mensagem.texto ?? null,
      criada_em: mensagem.criada_em ?? new Date().toISOString(),
    },
  });
}

/** Um contato novo (`leads`) nasceu pelo atendimento. */
export function emitirContatoCriado(admin: SupabaseClient, contato: ContatoEvento): void {
  emitir(admin, "contato_criado", {
    contato: {
      id: contato.id,
      nome: contato.nome ?? null,
      telefone: contato.telefone ?? null,
      email: contato.email ?? null,
      origem: contato.origem ?? null,
    },
  });
}
