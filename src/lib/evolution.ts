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

import { MSG_LIGACAO_PADRAO } from "@/lib/evolution-padroes";
export { MSG_LIGACAO_PADRAO };

export type EvolutionConfig = {
  base_url: string;
  api_key: string;
  instance_name: string;
};

export type EvolutionState = "open" | "connecting" | "close" | "refused";

/**
 * As opções de comportamento da instância. Antes viviam como literais
 * dentro de `ensureInstance` e por isso eram imutáveis na prática: o corpo
 * do `/instance/create` só roda uma vez na vida da instância, e a recepção
 * ficou meses recusando ligação com um texto que ninguém conseguia editar.
 */
export type EvolutionSettings = {
  /** Recusa a chamada na hora e responde `msgCall`. */
  rejectCall: boolean;
  /** O texto que o cliente recebe quando a ligação é recusada. */
  msgCall: string;
  /** Ignora mensagem de grupo — atendimento aqui é 1-a-1. */
  groupsIgnore: boolean;
  /** Mantém o WhatsApp como "online" o tempo todo. */
  alwaysOnline: boolean;
  /** Marca como lida a conversa que respondemos. */
  readMessages: boolean;
  /** Importa o histórico do aparelho ao parear. Só vale no PRÓXIMO QR. */
  syncFullHistory: boolean;
};

export const EVOLUTION_SETTINGS_PADRAO: EvolutionSettings = {
  rejectCall: true,
  msgCall: MSG_LIGACAO_PADRAO,
  groupsIgnore: true,
  alwaysOnline: false,
  readMessages: true,
  syncFullHistory: false,
};

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
  init?: { method?: string; body?: unknown; timeoutMs?: number },
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
      // Mídia grande (vídeo de 40 MB vira ~54 MB em base64) precisa de
      // mais que isso — quem baixa mídia passa o próprio prazo.
      signal: AbortSignal.timeout(init?.timeoutMs ?? 20_000),
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
  settings: EvolutionSettings = EVOLUTION_SETTINGS_PADRAO,
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
        // Comportamento da instância — vem do canal, não mais fixo aqui.
        ...settings,
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
  // E reaplica as configurações. Sem esta linha o corpo do `/instance/create`
  // acima é letra morta para toda instância que já nasceu: era por isso que
  // a mensagem de ligação recusada não mudava por mais que se editasse o
  // código — o caminho que a define nunca mais rodava.
  await setSettings(cfg, settings).catch(() => {
    // Mesma regra do webhook: não impede de mostrar o QR.
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

/**
 * Grava as opções de comportamento numa instância que JÁ existe.
 * É o endpoint que faltava: `/instance/create` só aceita essas opções na
 * criação, então sem isto nada aqui era editável depois do primeiro QR.
 */
export async function setSettings(
  cfg: EvolutionConfig,
  settings: EvolutionSettings,
): Promise<void> {
  await call(cfg, `/settings/set/${encodeURIComponent(cfg.instance_name)}`, {
    method: "POST",
    // `readStatus` é OBRIGATÓRIO na 2.3.7 — sem ele o endpoint responde
    // 400 ("instance requires property readStatus"). Descoberto em 23/09
    // ao sincronizar a mensagem de ligação: o botão Salvar da tela
    // falhava do mesmo jeito, e era por isso que o texto nunca mudava.
    // `false` = não marcar os status (stories) dos contatos como vistos.
    body: { readStatus: false, ...settings },
  });
}

/** Lê as opções atuais da instância — para a tela mostrar o que vale hoje. */
export async function getSettings(cfg: EvolutionConfig): Promise<EvolutionSettings | null> {
  try {
    const res = await call<Record<string, unknown>>(
      cfg,
      `/settings/find/${encodeURIComponent(cfg.instance_name)}`,
    );
    if (!res) return null;
    const bool = (k: keyof EvolutionSettings) =>
      typeof res[k] === "boolean" ? (res[k] as boolean) : EVOLUTION_SETTINGS_PADRAO[k] as boolean;
    return {
      rejectCall: bool("rejectCall"),
      msgCall: typeof res.msgCall === "string" ? res.msgCall : EVOLUTION_SETTINGS_PADRAO.msgCall,
      groupsIgnore: bool("groupsIgnore"),
      alwaysOnline: bool("alwaysOnline"),
      readMessages: bool("readMessages"),
      syncFullHistory: bool("syncFullHistory"),
    };
  } catch {
    // Instância fora do ar não deve derrubar a tela de configuração.
    return null;
  }
}

/**
 * Baixa a mídia de uma mensagem recebida, em base64.
 *
 * Por que existe: o webhook entrega a mídia do WhatsApp CRIPTOGRAFADA — a
 * `url` que vem no payload não abre no navegador nem em lugar nenhum. A
 * Evolution só devolve uma URL utilizável (`mediaUrl`) quando o servidor
 * dela está com S3/Minio ligado. Sem S3, este endpoint é o ÚNICO jeito de
 * alcançar o arquivo, e é por não chamá-lo que toda foto e todo áudio
 * recebidos eram descartados pelo webhook.
 */
/**
 * URL da foto de perfil de um número. Devolve null quando o contato não
 * tem foto ou a esconde (privacidade) — os dois casos voltam como erro
 * ou campo vazio, e para nós dá no mesmo.
 *
 * A URL é da CDN do WhatsApp e EXPIRA (~10 dias): quem chama precisa
 * baixar e guardar, não linkar. Ver `atendimento/avatar-contato.ts`.
 */
export async function getProfilePictureUrl(
  cfg: EvolutionConfig,
  numero: string,
): Promise<string | null> {
  try {
    const res = await call<{ profilePictureUrl?: string | null }>(
      cfg,
      `/chat/fetchProfilePictureUrl/${encodeURIComponent(cfg.instance_name)}`,
      { method: "POST", body: { number: numero } },
    );
    const url = res?.profilePictureUrl;
    return typeof url === "string" && url.startsWith("http") ? url : null;
  } catch {
    return null;
  }
}

export async function getMediaBase64(
  cfg: EvolutionConfig,
  messageKey: Record<string, unknown>,
): Promise<{ buffer: Buffer; mime: string } | null> {
  try {
    const res = await call<{ base64?: string; mimetype?: string }>(
      cfg,
      `/chat/getBase64FromMediaMessage/${encodeURIComponent(cfg.instance_name)}`,
      {
        method: "POST",
        // `convertToMp4: false` — o áudio do WhatsApp é OGG/opus e o
        // navegador toca. Converter só adiciona latência e um ponto de
        // falha no meio de um webhook que precisa responder rápido.
        body: { message: { key: messageKey }, convertToMp4: false },
        // 20 s bastava para foto e áudio; o vídeo de 40 MB de 24/09 não
        // cabia e virava "[video]" sem arquivo.
        timeoutMs: 180_000,
      },
    );
    if (!res?.base64) return null;
    return {
      buffer: Buffer.from(res.base64, "base64"),
      mime: res.mimetype || "application/octet-stream",
    };
  } catch {
    // Perder o anexo é ruim; derrubar o webhook e perder a mensagem
    // inteira (e o retry da Evolution em cima) é pior.
    return null;
  }
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

/** Uma mensagem recebida, identificada como o WhatsApp a identifica. */
export type ChaveMensagem = { remoteJid: string; fromMe: boolean; id: string };

/**
 * Marca mensagens RECEBIDAS como lidas no WhatsApp — o "visto azul".
 *
 * Por que existe: a opção `readMessages` da instância só marca como lida
 * quando alguém RESPONDE. Quem lia a conversa na plataforma e ainda ia
 * responder deixava o cliente vendo dois tiques cinza — e o celular da
 * imobiliária acumulando "não lidas" de coisa que já tinha sido lida.
 * Aqui é o mesmo gesto do WhatsApp Web: abriu, leu.
 */
export async function markMessagesAsRead(
  cfg: EvolutionConfig,
  chaves: ChaveMensagem[],
): Promise<boolean> {
  if (chaves.length === 0) return true;
  try {
    await call(cfg, `/chat/markMessageAsRead/${encodeURIComponent(cfg.instance_name)}`, {
      method: "POST",
      body: { readMessages: chaves },
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Edita uma mensagem de TEXTO já enviada (o WhatsApp permite até 15 min).
 *
 * Formato conferido na Evolution 2.3.7: `{ number, text, key: { id,
 * fromMe, remoteJid } }` — sem `key` ela responde "Message not
 * compatible". Nunca lança: devolve o motivo para a tela explicar.
 */
export async function editarTexto(
  cfg: EvolutionConfig,
  numero: string,
  externalId: string,
  texto: string,
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const digitos = onlyDigits(numero);
  try {
    await call(cfg, `/chat/updateMessage/${encodeURIComponent(cfg.instance_name)}`, {
      method: "POST",
      body: {
        number: digitos,
        text: texto,
        key: { id: externalId, fromMe: true, remoteJid: `${digitos}@s.whatsapp.net` },
      },
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : "falha na Evolution" };
  }
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
