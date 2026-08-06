import type { SupabaseClient } from "@supabase/supabase-js";
import { sendText as evoSendText, sendMedia as evoSendMedia, type EvolutionConfig } from "@/lib/evolution";
import {
  sendMessage as tgSendMessage,
  sendMedia as tgSendMedia,
  type TelegramMediaTipo,
} from "@/lib/telegram";
import { sendOutboundText } from "@/lib/whatsapp";
import { ehCanalMeta, enviarPorMeta } from "@/lib/meta-messaging";
import {
  enviarEmail,
  gerarMessageId,
  assuntoDeResposta,
  textoParaHtml,
  HEADER_CONVERSA,
} from "@/lib/email";
import { enviarSms } from "@/lib/sms";
import { assinarCorpo, montarPayload } from "@/lib/atendimento/webhooks-out";
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
//   3. Instagram / Messenger / Facebook → Messenger Platform, com a
//      credencial de `social_integrations` (ver lib/meta-messaging.ts).
//      Esses canais nunca têm linha em `atendimento_channels`: eles são
//      cadastrados no CRM, não aqui.
//   4. social_integrations (configuração antiga do CRM, só Cloud API)
// =====================================================================

const GRAPH_VERSION = "v21.0";

export type EnvioResultado =
  | { ok: true; externalId: string | null; via: string }
  | { ok: false; reason: string };

type CanalRow = {
  id: string;
  provedor:
    | "evolution" | "cloud_api" | "cloud_api_coexistence" | "telegram_bot"
    // Canais HTTP (onda de e-mail / SMS / API genérica).
    | "email_smtp" | "sms_generico" | "api_generica";
  status: string;
  config: Record<string, string | undefined>;
};

/** O inbox usa "documento" como cesta de tudo que não é foto/áudio/vídeo. */
function tipoTelegram(tipo: MessageTipo): TelegramMediaTipo {
  if (tipo === "imagem" || tipo === "audio" || tipo === "video") return tipo;
  return "documento";
}

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
    /**
     * Id da conversa. Opcional para não quebrar quem já chama esta função,
     * mas o canal de E-MAIL depende dele: é de onde saem o assunto da
     * thread ("Re: ...") e o Message-ID que faz a resposta do cliente cair
     * na mesma conversa. Sem ele, o e-mail sai como thread nova.
     */
    conversationId?: string | null;
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
    if (row.provedor === "telegram_bot") {
      const token = row.config.bot_token;
      if (!token) return { ok: false, reason: "canal do Telegram sem bot_token" };
      try {
        if (media) {
          // No Telegram a legenda viaja junto da mídia — não há mensagem
          // separada de texto, então `texto` vira caption.
          const r = await tgSendMedia(token, destino, {
            url: media.url,
            tipo: tipoTelegram(media.tipo),
            nome: media.nome ?? undefined,
            legenda: texto ?? undefined,
          });
          return { ok: true, externalId: r.id, via: "telegram_bot" };
        }
        const r = await tgSendMessage(token, destino, texto ?? "");
        return { ok: true, externalId: r.id, via: "telegram_bot" };
      } catch (e) {
        return { ok: false, reason: e instanceof Error ? e.message : "falha no Telegram" };
      }
    }

    // ----- Canais HTTP: e-mail, SMS e API genérica -----
    if (row.provedor === "email_smtp") {
      return enviarPorEmail(admin, row, destino, texto ?? null, media ?? null, args.conversationId ?? null);
    }
    if (row.provedor === "sms_generico") {
      // SMS é texto e ponto. Devolver erro claro é melhor do que mandar a
      // legenda e o anexo simplesmente sumir sem ninguém perceber.
      if (media) return { ok: false, reason: "SMS não envia mídia — mande o link no texto" };
      const r = await enviarSms({
        apiUrl: row.config.api_url ?? "",
        apiKey: row.config.api_key ?? "",
        para: destino,
        mensagem: texto ?? "",
        remetente: row.config.remetente ?? null,
      });
      return r.ok
        ? { ok: true, externalId: r.id, via: "sms_generico" }
        : { ok: false, reason: r.erro };
    }
    if (row.provedor === "api_generica") {
      return enviarPorApiGenerica(row, destino, texto ?? null, media ?? null, args.conversationId ?? null);
    }

    // cloud_api e cloud_api_coexistence usam a mesma Graph API.
    return media
      ? cloudSendMedia(row.config, destino, { url: media.url, tipo: media.tipo, nome: media.nome, legenda: texto })
      : cloudSendText(row.config, destino, texto ?? "");
  }

  // 2) Instagram, Messenger e Facebook: Messenger Platform.
  //
  // Vem ANTES do ramo legado porque estes canais não têm — e não devem ter
  // — linha em `atendimento_channels`: a página da Meta é cadastrada uma
  // vez em CRM › Integrações e serve aos dois sistemas. Aceita mídia, ao
  // contrário do legado logo abaixo.
  if (ehCanalMeta(canal)) {
    const r = await enviarPorMeta(admin, {
      canal,
      destino,
      texto: texto ?? null,
      media: media ? { url: media.url, tipo: media.tipo, nome: media.nome ?? null } : null,
    });
    return r.ok
      ? { ok: true, externalId: r.externalId, via: `meta_${canal}` }
      : { ok: false, reason: r.reason };
  }

  // 3) Sem canal no Atendimento: cai na integração antiga do CRM (só texto).
  if (media) {
    return { ok: false, reason: "nenhum canal conectado para enviar mídia — configure em Canais" };
  }
  const legado = await sendOutboundText(admin, canal, destino, texto ?? "");
  return legado.ok
    ? { ok: true, externalId: legado.externalId, via: "social_integrations" }
    : { ok: false, reason: legado.reason };
}

// =====================================================================
// Canais HTTP — funções auxiliares (mantidas no fim do arquivo para o
// miolo do despacho continuar legível).
// =====================================================================

/** Nome da empresa (assunto de e-mail quando não há thread anterior). */
async function nomeDaConta(admin: SupabaseClient): Promise<string> {
  const { data } = await admin
    .from("atendimento_settings")
    .select("nome_conta")
    .maybeSingle();
  return (data?.nome_conta as string | undefined)?.trim() || "Atendimento";
}

/**
 * Envia a resposta do agente por e-mail (Resend).
 *
 * Dois cuidados que fazem a diferença entre "chega" e "chega na thread":
 *
 *  1) ASSUNTO — se a conversa já tem um assunto (guardado pelo webhook em
 *     custom_attributes.email_assunto), respondemos com "Re: <assunto>".
 *     Sem assunto anterior, usamos o nome da empresa: o cliente precisa
 *     reconhecer o remetente antes de abrir.
 *
 *  2) CABEÇALHOS — Message-ID nosso (com o id da conversa embutido, ver
 *     src/lib/email.ts) mais In-Reply-To/References apontando para o
 *     último e-mail DELE. É isso que faz o Gmail empilhar as mensagens
 *     numa conversa só, dos dois lados.
 */
async function enviarPorEmail(
  admin: SupabaseClient,
  row: CanalRow,
  destino: string,
  texto: string | null,
  media: { url: string; tipo: MessageTipo; nome?: string | null; mime?: string | null } | null,
  conversationId: string | null,
): Promise<EnvioResultado> {
  const { api_key, remetente, nome_remetente } = row.config;
  if (!api_key || !remetente) {
    return { ok: false, reason: "canal de e-mail sem api_key/remetente — revise em Canais" };
  }

  let assuntoAnterior: string | null = null;
  let messageIdAnterior: string | null = null;
  if (conversationId) {
    const { data } = await admin
      .from("conversations")
      .select("custom_attributes")
      .eq("id", conversationId)
      .maybeSingle();
    const attrs = (data?.custom_attributes ?? {}) as Record<string, unknown>;
    assuntoAnterior = typeof attrs.email_assunto === "string" ? attrs.email_assunto : null;
    messageIdAnterior = typeof attrs.email_message_id === "string" ? attrs.email_message_id : null;
  }

  const assunto = assuntoDeResposta(assuntoAnterior, await nomeDaConta(admin));

  const headers: Record<string, string> = {};
  if (conversationId) {
    headers["Message-ID"] = gerarMessageId(conversationId, remetente);
    // Cabeçalho próprio: plano B quando o provedor sobrescreve o Message-ID.
    headers[HEADER_CONVERSA] = conversationId;
  }
  if (messageIdAnterior) {
    headers["In-Reply-To"] = messageIdAnterior;
    headers["References"] = messageIdAnterior;
  }

  // Anexo vira link no corpo: a API da Resend aceita anexos, mas exigiria
  // baixar e re-enviar o arquivo em base64 dentro da rota — caro e frágil.
  // O arquivo já está hospedado no nosso storage, com URL pública.
  const corpoTexto = [texto ?? "", media ? `\nAnexo: ${media.url}` : ""].join("").trim();
  const corpoHtml =
    textoParaHtml(texto ?? "") +
    (media
      ? `<p style="margin:0 0 12px"><a href="${media.url}">${media.nome ?? "Ver anexo"}</a></p>`
      : "");

  const r = await enviarEmail({
    apiKey: api_key,
    de: nome_remetente ? `${nome_remetente} <${remetente}>` : remetente,
    para: destino,
    assunto,
    texto: corpoTexto || null,
    html: corpoHtml || null,
    replyTo: remetente,
    headers,
  });

  return r.ok
    ? { ok: true, externalId: r.id, via: "email" }
    : { ok: false, reason: r.erro };
}

/**
 * Devolve a mensagem de saída ao sistema do cliente, via POST assinado na
 * `callback_url` do canal — o espelho do webhook de entrada.
 *
 * A assinatura usa o MESMO esquema dos webhooks de saída
 * (X-Arini-Signature: sha256=<hmac hex do corpo cru>), com o
 * `webhook_secret` do canal. Assim quem já valida um valida o outro.
 */
async function enviarPorApiGenerica(
  row: CanalRow,
  destino: string,
  texto: string | null,
  media: { url: string; tipo: MessageTipo; nome?: string | null; mime?: string | null } | null,
  conversationId: string | null,
): Promise<EnvioResultado> {
  const callbackUrl = row.config.callback_url;
  const secret = row.config.webhook_secret;
  if (!callbackUrl) {
    return {
      ok: false,
      reason:
        "canal por API sem callback_url — sem ela não há para onde entregar a resposta " +
        "(cadastre em Configurações › Canal por API)",
    };
  }
  if (!secret) {
    return { ok: false, reason: "canal por API sem segredo — gere um em Configurações › Canal por API" };
  }

  const payload = montarPayload("mensagem_enviada", {
    conversation_id: conversationId,
    contato_id: destino,
    texto,
    media: media
      ? { url: media.url, tipo: media.tipo, nome: media.nome ?? null, mime: media.mime ?? null }
      : null,
  });
  const corpo = JSON.stringify(payload);

  try {
    const res = await fetch(callbackUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Arini-Signature": assinarCorpo(secret, corpo),
        "X-Arini-Evento": "mensagem_enviada",
      },
      body: corpo,
      // Mesmo limite dos webhooks de saída: o atendente está esperando.
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      const detalhe = await res.text().catch(() => "");
      return {
        ok: false,
        reason: `seu endpoint respondeu HTTP ${res.status}${detalhe ? ` — ${detalhe.slice(0, 200)}` : ""}`,
      };
    }
    // O sistema do cliente pode devolver o id dele para casar a entrega.
    const json = (await res.json().catch(() => ({}))) as { id?: string; externalId?: string };
    return { ok: true, externalId: json.externalId ?? json.id ?? null, via: "api_generica" };
  } catch (e) {
    const motivo =
      e instanceof Error && e.name === "TimeoutError"
        ? "seu endpoint não respondeu a tempo"
        : e instanceof Error ? e.message : "falha de rede";
    return { ok: false, reason: motivo };
  }
}
