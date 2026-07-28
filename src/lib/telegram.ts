// =====================================================================
// Cliente da Bot API do Telegram.
//
// Segue o mesmo desenho de src/lib/evolution.ts (um `call` central, erro
// tipado e timeout com AbortSignal) porque as rotas do Next tratam os
// dois provedores do mesmo jeito: se o provedor demorar, a rota precisa
// falhar rápido em vez de pendurar a requisição do atendente.
//
// Particularidades do Telegram que o código precisa respeitar:
//   · TODO endpoint mora em https://api.telegram.org/bot<token>/<metodo>,
//     ou seja, o token vai na URL — nunca logue a URL crua.
//   · A resposta é sempre { ok, result } ou { ok:false, description }.
//     HTTP 200 com ok:false acontece (ex.: chat bloqueado), então checar
//     só o res.ok não basta.
//   · O webhook é validado por `secret_token`, devolvido pelo Telegram no
//     header X-Telegram-Bot-Api-Secret-Token a cada update.
//   · Mídia recebida vem como `file_id`; a URL de download só existe
//     depois de um getFile e vale ~1h (por isso resolvemos na hora).
// =====================================================================

const API_BASE = "https://api.telegram.org";

/** Tipos de mídia que o atendimento sabe enviar. */
export type TelegramMediaTipo = "imagem" | "audio" | "video" | "documento";

export class TelegramError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "TelegramError";
  }
}

type TelegramResposta<T> = {
  ok?: boolean;
  result?: T;
  description?: string;
  error_code?: number;
};

/**
 * Chama um método da Bot API. Sempre POST com JSON: o Telegram aceita
 * GET, mas POST evita que parâmetros (inclusive texto do cliente) fiquem
 * na querystring e apareçam em log de proxy.
 */
async function call<T>(
  token: string,
  metodo: string,
  body?: Record<string, unknown>,
): Promise<T> {
  if (!token) throw new TelegramError("canal do Telegram sem bot_token");

  let res: Response;
  try {
    res = await fetch(`${API_BASE}/bot${token}/${metodo}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body ?? {}),
      // Mesmo motivo da Evolution: sem timeout a rota do Next trava.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const motivo =
      e instanceof Error && e.name === "TimeoutError"
        ? "o Telegram não respondeu a tempo"
        : "não foi possível alcançar a API do Telegram";
    throw new TelegramError(motivo);
  }

  const json = (await res.json().catch(() => null)) as TelegramResposta<T> | null;

  // O Telegram devolve 401 para token inválido e 404 quando o método (ou o
  // token) não existe — nos dois casos a mensagem crua confunde o usuário.
  if (!res.ok || json?.ok !== true) {
    if (res.status === 401 || res.status === 404) {
      throw new TelegramError("token do bot recusado pelo Telegram", res.status);
    }
    const msg = json?.description || `Telegram respondeu HTTP ${res.status}`;
    throw new TelegramError(msg, res.status);
  }

  return json.result as T;
}

export interface TelegramBot {
  id: number;
  username: string;
  first_name: string;
}

/** Valida o token e devolve a identidade do bot (é o nosso "ping"). */
export async function getMe(token: string): Promise<TelegramBot> {
  const r = await call<{ id: number; username?: string; first_name?: string }>(token, "getMe");
  return {
    id: r.id,
    username: r.username ?? "",
    first_name: r.first_name ?? "",
  };
}

/**
 * Aponta o webhook do bot para a nossa URL.
 *
 * `secret_token` é o que torna a rota pública segura: o Telegram devolve
 * esse valor no header X-Telegram-Bot-Api-Secret-Token em todo update, e
 * a rota rejeita qualquer coisa que não bata com ele.
 *
 * `allowed_updates` fica restrito a mensagens: assinar tudo (reações,
 * membros do chat, enquetes) só geraria tráfego que o inbox descarta.
 */
export async function setWebhook(
  token: string,
  url: string,
  secret: string,
): Promise<void> {
  await call(token, "setWebhook", {
    url,
    secret_token: secret,
    allowed_updates: ["message", "edited_message"],
    // Não descartamos a fila: mensagens que chegaram enquanto o canal
    // estava fora do ar ainda são atendimento pendente.
    drop_pending_updates: false,
    max_connections: 40,
  });
}

/** Remove o webhook — o bot continua existindo, só para de nos entregar. */
export async function deleteWebhook(token: string): Promise<void> {
  await call(token, "deleteWebhook", { drop_pending_updates: false });
}

/** Envia texto simples. Devolve o message_id como string (padrão do inbox). */
export async function sendMessage(
  token: string,
  chatId: string | number,
  texto: string,
): Promise<{ id: string | null }> {
  const r = await call<{ message_id?: number }>(token, "sendMessage", {
    chat_id: chatId,
    text: texto,
    // O Telegram não tem "preview_url"; desligar só faria links ficarem secos.
    disable_web_page_preview: false,
  });
  return { id: r.message_id != null ? String(r.message_id) : null };
}

/**
 * Envia mídia por URL pública. Cada tipo tem seu método na Bot API — não
 * existe um "sendMedia" genérico —, e o nome do campo do arquivo muda
 * junto com o método (photo / video / audio / document).
 */
export async function sendMedia(
  token: string,
  chatId: string | number,
  media: { url: string; tipo: TelegramMediaTipo; nome?: string; legenda?: string },
): Promise<{ id: string | null }> {
  const mapa: Record<TelegramMediaTipo, { metodo: string; campo: string }> = {
    imagem: { metodo: "sendPhoto", campo: "photo" },
    video: { metodo: "sendVideo", campo: "video" },
    audio: { metodo: "sendAudio", campo: "audio" },
    documento: { metodo: "sendDocument", campo: "document" },
  };
  const { metodo, campo } = mapa[media.tipo];

  const body: Record<string, unknown> = {
    chat_id: chatId,
    [campo]: media.url,
  };
  // Legenda existe nos quatro métodos; nome do arquivo, só no documento.
  if (media.legenda) body.caption = media.legenda;
  if (media.tipo === "documento" && media.nome) body.filename = media.nome;

  const r = await call<{ message_id?: number }>(token, metodo, body);
  return { id: r.message_id != null ? String(r.message_id) : null };
}

/**
 * Resolve o `file_id` de uma mídia recebida numa URL baixável.
 * É o único jeito de exibir no inbox o que o cliente mandou: o update só
 * traz o id. O link vive cerca de 1 hora, então quem chama deve usar (ou
 * copiar para o nosso storage) imediatamente.
 *
 * ATENÇÃO: a URL contém o token do bot. Não exponha para o navegador sem
 * intermediar — quem tem o link tem o bot.
 */
export async function getFileUrl(token: string, fileId: string): Promise<string | null> {
  const r = await call<{ file_path?: string }>(token, "getFile", { file_id: fileId });
  if (!r.file_path) return null;
  return `${API_BASE}/file/bot${token}/${r.file_path}`;
}
