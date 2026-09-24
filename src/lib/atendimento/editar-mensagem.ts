// =====================================================================
// EDITAR MENSAGEM ENVIADA — as regras, sem banco nem rede.
//
// Pedido do Carlos em 24/09/2026. O WhatsApp deixa editar TEXTO até 15
// minutos depois do envio; passado isso, a edição é recusada lá, e o
// cliente continuaria lendo o texto antigo enquanto a nossa tela mostraria
// o novo. Por isso a regra do prazo mora aqui e vale para a tela (mostrar
// ou não o lápis) e para a rota (aceitar ou não), com a mesma conta.
//
// Nota interna não sai do sistema: o autor edita a qualquer momento.
//
// (`scripts/testes/editar-mensagem.mjs` importa este arquivo direto.)
// =====================================================================

import { marcaDoAgente } from "./assinatura";

/** O prazo do WhatsApp. Uma folga de 30 s para o relógio e a rede. */
export const PRAZO_EDICAO_MS = 15 * 60_000 - 30_000;

export interface MensagemEditavel {
  direcao: "in" | "out";
  remetente: string;
  autor_id: string | null;
  tipo: string;
  interna: boolean;
  created_at: string;
  apagada_em: string | null;
  external_id: string | null;
  conteudo: string | null;
}

export type ResultadoPermissao = { ok: true } | { ok: false; motivo: string };

/**
 * Pode editar esta mensagem agora?
 *
 * `ehAdmin` deixa o administrador corrigir a mensagem de outra pessoa —
 * é quem cobre férias e ausência.
 */
export function podeEditar(
  m: MensagemEditavel,
  usuarioId: string,
  ehAdmin: boolean,
  agora: number = Date.now(),
): ResultadoPermissao {
  if (m.apagada_em) return { ok: false, motivo: "mensagem apagada" };
  if (m.direcao !== "out") return { ok: false, motivo: "só dá para editar o que a equipe enviou" };
  if (m.remetente !== "atendente") return { ok: false, motivo: "mensagem automática não se edita" };
  if (m.tipo !== "texto" || !m.conteudo) {
    return { ok: false, motivo: "foto, áudio, vídeo e documento não se editam" };
  }
  if (m.autor_id !== usuarioId && !ehAdmin) {
    return { ok: false, motivo: "só quem enviou pode editar" };
  }
  if (m.interna) return { ok: true };
  if (!m.external_id) return { ok: false, motivo: "esta mensagem não chegou ao WhatsApp" };
  const idade = agora - new Date(m.created_at).getTime();
  if (idade > PRAZO_EDICAO_MS) {
    return { ok: false, motivo: "o WhatsApp só permite editar até 15 minutos depois do envio" };
  }
  return { ok: true };
}

/**
 * O texto que a pessoa edita, sem o "*Allan:* " da frente.
 *
 * A marca de quem responde é colocada pelo sistema (ver `assinatura.ts`).
 * Deixá-la no campo de edição convidaria a apagá-la sem querer — e a
 * mensagem editada chegaria ao cliente sem dizer quem fala.
 */
export function textoSemMarca(conteudo: string, nomeAutor: string | null | undefined): {
  texto: string;
  tinhaMarca: boolean;
} {
  const marca = marcaDoAgente(nomeAutor);
  const t = conteudo.trimStart();
  if (marca && t.startsWith(marca)) {
    return { texto: t.slice(marca.length).trimStart(), tinhaMarca: true };
  }
  return { texto: conteudo, tinhaMarca: false };
}

/** Recoloca a marca quando a mensagem original a tinha. */
export function textoComMarca(
  texto: string,
  nomeAutor: string | null | undefined,
  tinhaMarca: boolean,
): string {
  const marca = marcaDoAgente(nomeAutor);
  if (!tinhaMarca || !marca) return texto.trim();
  return `${marca} ${texto.trim()}`;
}

/**
 * Lê uma EDIÇÃO que chegou pelo webhook — o cliente (ou a equipe, pelo
 * celular) editou uma mensagem no WhatsApp. Devolve o id da mensagem
 * editada e o texto novo, ou null se o payload não é uma edição.
 *
 * O Baileys manda um `protocolMessage` com `key` (da mensagem original) e
 * `editedMessage` (o conteúdo novo). A Evolution às vezes embrulha isso em
 * `editedMessage.message`. Aceita os dois formatos.
 */
export function lerEdicao(
  message: Record<string, unknown> | undefined | null,
): { idOriginal: string; texto: string } | null {
  if (!message) return null;
  const obj = (o: unknown, k: string) =>
    o && typeof o === "object" ? ((o as Record<string, unknown>)[k] as Record<string, unknown> | undefined) : undefined;

  const protocolo =
    obj(message, "protocolMessage") ??
    obj(obj(obj(message, "editedMessage"), "message"), "protocolMessage");
  if (!protocolo) return null;

  const tipo = protocolo.type;
  const ehEdicao = tipo === 14 || tipo === "MESSAGE_EDIT" || Boolean(protocolo.editedMessage);
  if (!ehEdicao) return null;

  const idOriginal = (obj(protocolo, "key")?.id as string | undefined) ?? null;
  const editada = obj(protocolo, "editedMessage");
  const texto =
    (typeof editada?.conversation === "string" && editada.conversation) ||
    (obj(editada, "extendedTextMessage")?.text as string | undefined) ||
    (obj(editada, "imageMessage")?.caption as string | undefined) ||
    (obj(editada, "videoMessage")?.caption as string | undefined) ||
    null;

  if (!idOriginal || !texto) return null;
  return { idOriginal, texto };
}
