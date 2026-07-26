import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText as evoSendText, sendMedia as evoSendMedia, type EvolutionConfig } from "@/lib/evolution";
import { sendOutboundText } from "@/lib/whatsapp";
import type { ConversationChannel, MessageTipo } from "@/lib/types";

// =====================================================================
// Despacho de saída do Atendimento.
//
// Antes, a rota /api/atendimento/send só falava com a Cloud API da Meta —
// quem conectasse pela Evolution conseguia RECEBER mas não RESPONDER.
// Este módulo resolve qual canal usar para a conversa e envia por ele,
// suportando texto e mídia nos dois provedores.
//
// Ordem de resolução do canal:
//   1. conversations.channel_id (o canal por onde a conversa entrou)
//   2. qualquer canal CONECTADO do mesmo `canal` (WhatsApp, etc.)
//   3. social_integrations (configuração antiga do CRM, só Cloud API)
// =====================================================================

const GRAPH_VERSION = "v21.0";

export type EnvioResultado =
  | { ok: true; externalId: string | null; via: string }
  | { ok: false; reason: string };

type CanalRow = {
  id: string;
  provedor: "evolution" | "cloud_api" | "cloud_api_coexistence";
  status: string;
  config: Record<string, string | undefined>;
};

async function resolverCanal(
  admin: SupabaseClient,
  canal: ConversationChannel,
  channelId: string | null,
): Promise<CanalRow | null> {
  if (channelId) {
    const { data } = await admin
      .from("atendimento_channels")
      .select("id, provedor, status, config")
      .eq("id", channelId)
      .maybeSingle();
    if (data) return data as CanalRow;
  }
  const { data } = await admin
    .from("atendimento_channels")
    .select("id, provedor, status, config")
    .eq("canal", canal)
    .eq("status", "conectado")
    .order("conectado_em", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as CanalRow) ?? null;
}

function evolutionConfig(row: CanalRow): EvolutionConfig | null {
  const { base_url, api_key, instance_name } = row.config;
  if (!base_url || !api_key || !instance_name) return null;
  return { base_url, api_key, instance_name };
}

/** Envia mídia pela Cloud API da Meta (link público, sem upload prévio). */
async function cloudSendMedia(
  cfg: Record<string, string | undefined>,
  to: string,
  media: { url: string; tipo: MessageTipo; nome?: string | null; legenda?: string | null },
): Promise<EnvioResultado> {
  const { access_token, phone_number_id } = cfg;
  if (!access_token || !phone_number_id) {
    return { ok: false, reason: "credenciais da Cloud API ausentes" };
  }
  const tipoMeta =
    media.tipo === "imagem" ? "image"
      : media.tipo === "audio" ? "audio"
        : media.tipo === "video" ? "video"
          : "document";

  const corpoMidia: Record<string, unknown> = { link: media.url };
  // Áudio na Cloud API não aceita caption; documento aceita filename.
  if (media.legenda && tipoMeta !== "audio") corpoMidia.caption = media.legenda;
  if (tipoMeta === "document" && media.nome) corpoMidia.filename = media.nome;

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phone_number_id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: tipoMeta,
          [tipoMeta]: corpoMidia,
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, reason: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, externalId: json?.messages?.[0]?.id ?? null, via: "cloud_api" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "falha de rede" };
  }
}

async function cloudSendText(
  cfg: Record<string, string | undefined>,
  to: string,
  texto: string,
): Promise<EnvioResultado> {
  const { access_token, phone_number_id } = cfg;
  if (!access_token || !phone_number_id) {
    return { ok: false, reason: "credenciais da Cloud API ausentes" };
  }
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phone_number_id}/messages`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body: texto, preview_url: true },
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) return { ok: false, reason: json?.error?.message ?? `HTTP ${res.status}` };
    return { ok: true, externalId: json?.messages?.[0]?.id ?? null, via: "cloud_api" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "falha de rede" };
  }
}

/**
 * Envia uma mensagem (texto e/ou mídia) para o contato da conversa.
 * Nunca lança: devolve `{ ok:false, reason }` para a mensagem ficar
 * registrada no banco com status "falha" e o atendente ver o motivo.
 */
export async function enviarMensagem(
  admin: SupabaseClient,
  args: {
    canal: ConversationChannel;
    channelId: string | null;
    destino: string;
    texto?: string | null;
    media?: { url: string; tipo: MessageTipo; nome?: string | null; mime?: string | null } | null;
  },
): Promise<EnvioResultado> {
  const { canal, channelId, destino, texto, media } = args;
  if (!destino) return { ok: false, reason: "conversa sem número/identificador de destino" };

  const row = await resolverCanal(admin, canal, channelId);

  // 1) Canal do Atendimento configurado.
  if (row) {
    if (row.status !== "conectado") {
      return { ok: false, reason: `o canal está "${row.status}" — reconecte em Canais` };
    }
    if (row.provedor === "evolution") {
      const cfg = evolutionConfig(row);
      if (!cfg) return { ok: false, reason: "canal Evolution sem base_url/api_key/instance_name" };
      try {
        if (media) {
          const r = await evoSendMedia(cfg, destino, {
            url: media.url,
            tipo: media.tipo === "imagem" || media.tipo === "audio" || media.tipo === "video"
              ? media.tipo : "documento",
            nome: media.nome ?? undefined,
            mime: media.mime ?? undefined,
            legenda: texto ?? undefined,
          });
          return { ok: true, externalId: r.id, via: "evolution" };
        }
        const r = await evoSendText(cfg, destino, texto ?? "");
        return { ok: true, externalId: r.id, via: "evolution" };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "falha na Evolution" };
      }
    }
    // cloud_api e cloud_api_coexistence usam a mesma Graph API.
    return media
      ? cloudSendMedia(row.config, destino, { url: media.url, tipo: media.tipo, nome: media.nome, legenda: texto })
      : cloudSendText(row.config, destino, texto ?? "");
  }

  // 2) Sem canal no Atendimento: cai na integração antiga do CRM (só texto).
  if (media) {
    return { ok: false, reason: "nenhum canal conectado para enviar mídia — configure em Canais" };
  }
  const legado = await sendOutboundText(admin, canal, destino, texto ?? "");
  return legado.ok
    ? { ok: true, externalId: legado.externalId, via: "social_integrations" }
    : { ok: false, reason: legado.reason };
}
