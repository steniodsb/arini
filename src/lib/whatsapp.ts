import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationChannel } from "./types";

// =====================================================================
// Envio de mensagens (outbound) e validação de webhook da Meta.
// As credenciais vivem em public.social_integrations.config (jsonb):
//   whatsapp: { access_token, phone_number_id, verify_token, app_secret }
//   instagram/facebook: { access_token, page_id, verify_token, app_secret }
// Se a integração não estiver configurada, o envio NÃO quebra o fluxo:
// a mensagem é gravada no CRM e retorna { ok:false, reason:"..." } — o
// atendente vê o que seria enviado até a credencial ser conectada (WABA).
// =====================================================================

const GRAPH_VERSION = "v21.0";

type IntegrationConfig = {
  access_token?: string;
  phone_number_id?: string;
  page_id?: string;
  verify_token?: string;
  app_secret?: string;
};

export type SendResult =
  | { ok: true; externalId: string | null }
  | { ok: false; reason: string };

async function getConfig(
  admin: SupabaseClient,
  plataforma: string,
): Promise<{ ativo: boolean; config: IntegrationConfig } | null> {
  const { data } = await admin
    .from("social_integrations")
    .select("ativo, config")
    .eq("plataforma", plataforma)
    .maybeSingle();
  if (!data) return null;
  return { ativo: !!data.ativo, config: (data.config ?? {}) as IntegrationConfig };
}

/**
 * Envia texto pelo WhatsApp Cloud API usando a integração LEGADA do CRM
 * (`social_integrations.whatsapp`), para quem nunca cadastrou um canal em
 * Atendimento › Canais.
 *
 * Só WhatsApp: Instagram, Messenger e Facebook são outro contrato (o
 * destinatário é um PSID, não um telefone) e vivem em
 * `src/lib/meta-messaging.ts`. O despacho em `atendimento/outbound.ts`
 * roteia para lá antes de chegar aqui.
 */
export async function sendOutboundText(
  admin: SupabaseClient,
  canal: ConversationChannel,
  to: string,
  body: string,
): Promise<SendResult> {
  if (canal !== "whatsapp") {
    // Chegar aqui com outro canal é erro de roteamento, não falta de
    // recurso — daí a mensagem apontar o caminho certo.
    return {
      ok: false,
      reason: `envio por ${canal} não passa por esta função (ver lib/meta-messaging.ts)`,
    };
  }

  const integ = await getConfig(admin, "whatsapp");
  if (!integ || !integ.ativo) return { ok: false, reason: "integração do WhatsApp inativa" };

  const { access_token, phone_number_id } = integ.config;
  if (!access_token || !phone_number_id) {
    return { ok: false, reason: "credenciais do WhatsApp ausentes (access_token / phone_number_id)" };
  }

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phone_number_id}/messages`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          messaging_product: "whatsapp",
          to,
          type: "text",
          text: { body, preview_url: true },
        }),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      messages?: { id: string }[];
      error?: { message?: string };
    };
    if (!res.ok) {
      return { ok: false, reason: json?.error?.message ?? `HTTP ${res.status}` };
    }
    return { ok: true, externalId: json?.messages?.[0]?.id ?? null };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : "falha de rede" };
  }
}

/**
 * Valida a assinatura X-Hub-Signature-256 do webhook da Meta contra o
 * app_secret configurado. Retorna:
 *   - "ok"        assinatura confere
 *   - "invalid"   app_secret configurado mas assinatura não confere → rejeitar
 *   - "skip"      sem app_secret configurado (dev) → seguir sem validar
 */
export async function verifyMetaSignature(
  admin: SupabaseClient,
  plataforma: string,
  rawBody: string,
  signatureHeader: string | null,
): Promise<"ok" | "invalid" | "skip"> {
  const integ = await getConfig(admin, plataforma);
  return conferirAssinaturaMeta(integ?.config.app_secret ?? null, rawBody, signatureHeader);
}

/**
 * A conferência em si, sem ir ao banco.
 *
 * Existe separada porque o `app_secret` do WhatsApp passou a ter DUAS
 * origens possíveis: a integração legada do CRM (`social_integrations`) e
 * o canal cadastrado em Atendimento › Canais (`atendimento_channels`).
 * Quem sabe qual usar é o webhook, que já resolveu de qual número veio a
 * mensagem — então ele passa o segredo certo para cá.
 *
 * `skip` = não há segredo cadastrado, ninguém consegue validar nada. É
 * permissivo de propósito (senão ligar a integração exigiria preencher o
 * segredo antes de qualquer mensagem chegar), e é justamente por isso que
 * a tela de Integrações pede o App Secret com destaque.
 */
export function conferirAssinaturaMeta(
  appSecret: string | null | undefined,
  rawBody: string,
  signatureHeader: string | null,
): "ok" | "invalid" | "skip" {
  if (!appSecret) return "skip";
  if (!signatureHeader) return "invalid";

  const expected =
    "sha256=" + crypto.createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const a = Buffer.from(signatureHeader);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return "invalid";
  return crypto.timingSafeEqual(a, b) ? "ok" : "invalid";
}

/** Comparação de segredo em tempo constante (tokens de verificação). */
export function segredoConfere(recebido: string | null, esperado: string | null): boolean {
  if (!recebido || !esperado) return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}
