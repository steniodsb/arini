// =====================================================================
// Cliente da Evolution API (v2) — WhatsApp não-oficial via Baileys.
//
// ATENÇÃO AOS PAYLOADS: a documentação publicada da Evolution ainda mostra
// o formato da v1 (aninhado, snake_case) em vários endpoints. O que vale é
// o código-fonte da 2.3.7:
//   - sendText usa { number, text }        (não { textMessage: { text } })
//   - /webhook/set usa { webhook: { ... } } em camelCase (byEvents, base64)
// Seguir a doc literalmente quebra a integração.
//
// A chave global (api_key) manda em tudo; o token por instância volta no
// campo `hash` da criação. Aqui usamos sempre a global, guardada em
// atendimento_channels.config e nunca exposta ao browser.
// =====================================================================

export type EvolutionConfig = {
  base_url: string;
  api_key: string;
  instance_name: string;
};

export type EvolutionState = "open" | "connecting" | "close" | "refused";

/** Eventos que realmente consumimos — assinar tudo só gera ruído. */
const WEBHOOK_EVENTS = [
  "QRCODE_UPDATED",
  "CONNECTION_UPDATE",
  "MESSAGES_UPSERT",
  "MESSAGES_UPDATE",
] as const;

class EvolutionError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = "EvolutionError";
  }
}

async function call<T>(
  cfg: EvolutionConfig,
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`${cfg.base_url}${path}`, {
      method: init?.method ?? "GET",
      headers: {
        apikey: cfg.api_key,
        "Content-Type": "application/json",
      },
      body: init?.body ? JSON.stringify(init.body) : undefined,
      // A Evolution pode demorar para responder quando está subindo a
      // instância; sem timeout a rota do Next fica pendurada.
      signal: AbortSignal.timeout(20_000),
    });
  } catch (e) {
    const motivo =
      e instanceof Error && e.name === "TimeoutError"
        ? "o servidor da Evolution não respondeu a tempo"
        : "não foi possível alcançar o servidor da Evolution";
    throw new EvolutionError(motivo);
  }

  const json = (await res.json().catch(() => null)) as
    | (T & { message?: unknown; error?: unknown })
    | null;

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new EvolutionError("API Key recusada pela Evolution", res.status);
    }
    const msg =
      (typeof json?.message === "string" && json.message) ||
      (Array.isArray(json?.message) && json.message.join(", ")) ||
      (typeof json?.error === "string" && json.error) ||
      `Evolution respondeu HTTP ${res.status}`;
    throw new EvolutionError(String(msg), res.status);
  }
  return json as T;
}

type QrPayload = { pairingCode: string | null; code?: string; base64?: string };

/**
 * Garante que a instância existe e devolve o QR Code para parear.
 * Criar uma instância que já existe devolve 403 — nesse caso caímos no
 * /instance/connect, que é justamente o fluxo de reconectar.
 */
export async function ensureInstance(
  cfg: EvolutionConfig,
  webhookUrl: string,
  webhookSecret: string,
): Promise<{ qrcode: string | null; state: EvolutionState }> {
  try {
    const created = await call<{
      instance?: { status?: string };
      qrcode?: QrPayload;
    }>(cfg, "/instance/create", {
      method: "POST",
      body: {
        instanceName: cfg.instance_name,
        qrcode: true,
        integration: "WHATSAPP-BAILEYS",
        // Padrões sãos para atendimento: não recebe grupo, rejeita ligação
        // e marca como lida quando respondemos.
        groupsIgnore: true,
        rejectCall: true,
        msgCall: "Não atendemos ligações por aqui. Pode escrever que respondemos.",
        alwaysOnline: false,
        readMessages: true,
        syncFullHistory: false,
        webhook: {
          enabled: true,
          url: webhookUrl,
          // Segredo compartilhado: o webhook é público, então validamos
          // este header antes de aceitar qualquer evento.
          headers: { Authorization: `Bearer ${webhookSecret}` },
          byEvents: false,
          base64: false,
          events: [...WEBHOOK_EVENTS],
        },
      },
    });
    return {
      qrcode: created.qrcode?.base64 ?? null,
      state: (created.instance?.status as EvolutionState) ?? "connecting",
    };
  } catch (e) {
    // 403/409 = instância já existe. Qualquer outro erro é real.
    const status = e instanceof EvolutionError ? e.status : undefined;
    if (status !== 403 && status !== 409) throw e;
  }

  // Já existia: garante o webhook apontando pra cá e pede um QR novo.
  await setWebhook(cfg, webhookUrl, webhookSecret).catch(() => {
    // Webhook é importante mas não deve impedir de mostrar o QR.
  });
  return connect(cfg);
}

export async function connect(
  cfg: EvolutionConfig,
): Promise<{ qrcode: string | null; state: EvolutionState }> {
  const qr = await call<QrPayload & { instance?: { state?: string } }>(
    cfg,
    `/instance/connect/${encodeURIComponent(cfg.instance_name)}`,
  );
  // Quando já está conectada, a Evolution devolve o estado em vez do QR.
  if (!qr.base64) {
    const state = await connectionState(cfg);
    return { qrcode: null, state };
  }
  return { qrcode: qr.base64, state: "connecting" };
}

export async function connectionState(cfg: EvolutionConfig): Promise<EvolutionState> {
  const res = await call<{ instance?: { state?: string } }>(
    cfg,
    `/instance/connectionState/${encodeURIComponent(cfg.instance_name)}`,
  );
  return (res.instance?.state as EvolutionState) ?? "close";
}

export async function setWebhook(
  cfg: EvolutionConfig,
  url: string,
  secret: string,
): Promise<void> {
  await call(cfg, `/webhook/set/${encodeURIComponent(cfg.instance_name)}`, {
    method: "POST",
    body: {
      webhook: {
        enabled: true,
        url,
        headers: { Authorization: `Bearer ${secret}` },
        byEvents: false,
        base64: false,
        events: [...WEBHOOK_EVENTS],
      },
    },
  });
}

/** Desvincula o aparelho no WhatsApp, mas mantém a instância no servidor. */
export async function logout(cfg: EvolutionConfig): Promise<void> {
  await call(cfg, `/instance/logout/${encodeURIComponent(cfg.instance_name)}`, {
    method: "DELETE",
  });
}

/**
 * Apaga a instância no servidor da Evolution — sessão, contatos e chats
 * que ela guardava. Irreversível: reconectar depois exige QR novo.
 *
 * O logout vem antes porque a Evolution recusa apagar instância conectada
 * (`instance/delete` responde 403 com "instance is connected"). A falha do
 * logout é engolida de propósito: se a sessão já estava caída, insistir
 * nele impediria a limpeza — que é justamente o que se está pedindo.
 */
export async function deleteInstance(cfg: EvolutionConfig): Promise<void> {
  try {
    await logout(cfg);
  } catch {
    /* já estava desconectada */
  }
  await call(cfg, `/instance/delete/${encodeURIComponent(cfg.instance_name)}`, {
    method: "DELETE",
  });
}

/** Envia texto. Na v2 o corpo é plano: { number, text }. */
export async function sendText(
  cfg: EvolutionConfig,
  to: string,
  text: string,
): Promise<{ id: string | null }> {
  const res = await call<{ key?: { id?: string } }>(
    cfg,
    `/message/sendText/${encodeURIComponent(cfg.instance_name)}`,
    {
      method: "POST",
      body: {
        number: onlyDigits(to),
        text,
        linkPreview: true,
      },
    },
  );
  return { id: res.key?.id ?? null };
}

/**
 * Envia mídia por URL. Na v2 o corpo também é plano e o `mediatype` aceita
 * image | video | document; áudio tem endpoint próprio (sendWhatsAppAudio),
 * porque a Evolution converte para o formato de nota de voz.
 */
export async function sendMedia(
  cfg: EvolutionConfig,
  to: string,
  media: { url: string; tipo: "imagem" | "audio" | "video" | "documento"; nome?: string; mime?: string; legenda?: string },
): Promise<{ id: string | null }> {
  const number = onlyDigits(to);

  if (media.tipo === "audio") {
    const res = await call<{ key?: { id?: string } }>(
      cfg,
      `/message/sendWhatsAppAudio/${encodeURIComponent(cfg.instance_name)}`,
      { method: "POST", body: { number, audio: media.url } },
    );
    return { id: res.key?.id ?? null };
  }

  const mediatype = media.tipo === "imagem" ? "image" : media.tipo === "video" ? "video" : "document";
  const res = await call<{ key?: { id?: string } }>(
    cfg,
    `/message/sendMedia/${encodeURIComponent(cfg.instance_name)}`,
    {
      method: "POST",
      body: {
        number,
        mediatype,
        mimetype: media.mime,
        media: media.url,
        fileName: media.nome,
        caption: media.legenda,
      },
    },
  );
  return { id: res.key?.id ?? null };
}

/** A Evolution espera só dígitos (DDI+DDD+número), sem +, espaço ou traço. */
export function onlyDigits(v: string): string {
  return v.replace(/\D/g, "");
}

/** Converte o estado da Evolution para o status que guardamos no banco. */
export function toChannelStatus(state: EvolutionState) {
  switch (state) {
    case "open":
      return "conectado" as const;
    case "connecting":
      return "aguardando_qr" as const;
    case "refused":
      return "erro" as const;
    default:
      return "desconectado" as const;
  }
}

export { EvolutionError };
