import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { verifyMetaSignature } from "@/lib/whatsapp";
import type { ConversationChannel, MessageTipo } from "@/lib/types";

// Plataformas suportadas e a origem de lead correspondente.
const PLATFORM_ORIGIN: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  messenger: "messenger",
  whatsapp: "whatsapp",
  tiktok: "tiktok",
};

// Canais que viram CONVERSA (inbox de atendimento). tiktok não tem inbox 2-vias.
const CONVERSATION_CHANNELS: Record<string, ConversationChannel> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  facebook: "facebook",
  messenger: "messenger",
};

/**
 * Verificação do webhook (Meta/Instagram/Facebook/WhatsApp usam este handshake).
 * GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * O verify_token é comparado com o configurado em social_integrations.config.verify_token.
 */
export async function GET(req: Request, { params }: { params: { platform: string } }) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe") return NextResponse.json({ error: "modo inválido" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: integ } = await admin
    .from("social_integrations")
    .select("config")
    .eq("plataforma", params.platform)
    .maybeSingle();

  const expected = (integ?.config as { verify_token?: string } | null)?.verify_token;
  if (expected && token === expected) {
    return new Response(challenge ?? "", { status: 200 });
  }
  return NextResponse.json({ error: "verify_token inválido" }, { status: 403 });
}

/**
 * Recebe mensagens das plataformas e as anexa a uma CONVERSA no CRM.
 * Fluxo (dedupe): identifica o contato → acha-ou-cria a conversa (canal+external_id)
 * → acha-ou-cria o lead ligado → grava a mensagem (dedupe por external_id).
 * Não cria mais um lead por mensagem. Webhooks de status (entregue/lida) e
 * eventos sem mensagem são ignorados sem criar nada.
 */
export async function POST(req: Request, { params }: { params: { platform: string } }) {
  const origem = PLATFORM_ORIGIN[params.platform];
  if (!origem) return NextResponse.json({ error: "plataforma não suportada" }, { status: 404 });

  // Corpo cru é necessário para validar a assinatura HMAC da Meta.
  const rawBody = await req.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Assinatura: rejeita só quando há app_secret configurado e não confere.
  const sig = req.headers.get("x-hub-signature-256");
  const verdict = await verifyMetaSignature(admin, params.platform, rawBody, sig);
  if (verdict === "invalid") {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 403 });
  }

  const { data: integ } = await admin
    .from("social_integrations")
    .select("ativo")
    .eq("plataforma", params.platform)
    .maybeSingle();

  // Se a integração não estiver ativa, apenas confirma o recebimento.
  if (!integ?.ativo) return NextResponse.json({ ok: true, ignored: true });

  const extracted = extractContact(payload, params.platform);

  // Sem identificador de contato nem conteúdo → evento sem mensagem (ex.: status
  // de entrega/leitura do WhatsApp). Confirma e sai, sem criar nada.
  if (!extracted.contactId && !extracted.mensagem) {
    return NextResponse.json({ ok: true, ignored: true, reason: "sem mensagem" });
  }

  const canal = CONVERSATION_CHANNELS[params.platform];

  // Canais sem inbox (tiktok): mantém o comportamento antigo (cria lead simples).
  if (!canal) {
    await admin.from("leads").insert({
      nome: extracted.nome || `Lead ${origem}`,
      telefone: extracted.telefone,
      origem,
      mensagem: extracted.mensagem,
      external_id: extracted.contactId,
      raw_payload: payload,
      stage: "novo",
    });
    await notifyRecepcao(admin, origem, extracted.mensagem);
    return NextResponse.json({ ok: true, lead_only: true });
  }

  const contactId = extracted.contactId ?? extracted.telefone ?? "desconhecido";

  // 1) Acha-ou-cria a CONVERSA por (canal, external_id do contato).
  const { data: existingConv } = await admin
    .from("conversations")
    .select("id, lead_id")
    .eq("canal", canal)
    .eq("external_id", contactId)
    .maybeSingle();

  let conversationId = existingConv?.id ?? null;
  let leadId = existingConv?.lead_id ?? null;

  if (!conversationId) {
    // 2) Dedupe do LEAD: no WhatsApp casa pelo telefone; senão cria um novo.
    if (extracted.telefone) {
      const { data: lead } = await admin
        .from("leads")
        .select("id")
        .or(`whatsapp.eq.${extracted.telefone},telefone.eq.${extracted.telefone}`)
        .limit(1)
        .maybeSingle();
      leadId = lead?.id ?? null;
    }
    if (!leadId) {
      const { data: novoLead } = await admin
        .from("leads")
        .insert({
          nome: extracted.nome || `Contato ${origem}`,
          telefone: extracted.telefone,
          whatsapp: canal === "whatsapp" ? extracted.telefone : null,
          origem,
          mensagem: extracted.mensagem,
          external_id: contactId,
          raw_payload: payload,
          stage: "novo",
        })
        .select("id")
        .single();
      leadId = novoLead?.id ?? null;
    }

    const { data: novaConv } = await admin
      .from("conversations")
      .insert({
        canal,
        external_id: contactId,
        lead_id: leadId,
        contato_nome: extracted.nome,
        contato_telefone: extracted.telefone,
        setor_responsavel: "recepcao", // triagem inicial
        status: "aberta",
      })
      .select("id")
      .single();
    conversationId = novaConv?.id ?? null;
  }

  if (!conversationId) {
    return NextResponse.json({ error: "falha ao abrir conversa" }, { status: 500 });
  }

  // 3) Grava a MENSAGEM (dedupe por external_id — a Meta reentrega webhooks).
  if (extracted.messageId) {
    const { data: dup } = await admin
      .from("messages")
      .select("id")
      .eq("external_id", extracted.messageId)
      .maybeSingle();
    if (dup) return NextResponse.json({ ok: true, duplicate: true });
  }

  await admin.from("messages").insert({
    conversation_id: conversationId,
    direcao: "in",
    remetente: "cliente",
    tipo: extracted.tipo,
    conteudo: extracted.mensagem,
    media_url: extracted.mediaUrl,
    external_id: extracted.messageId,
    raw_payload: payload,
    status: "recebida",
  });

  // Mantém o lead "vivo" no funil.
  if (leadId) {
    await admin.from("leads").update({ ultima_interacao_em: new Date().toISOString() }).eq("id", leadId);
  }

  await notifyRecepcao(admin, origem, extracted.mensagem);

  return NextResponse.json({ ok: true, conversation_id: conversationId });
}

async function notifyRecepcao(
  admin: ReturnType<typeof createSupabaseAdmin>,
  origem: string,
  mensagem: string | null,
) {
  await admin.from("notifications").insert({
    sector: "recepcao",
    tipo: "atendimento",
    titulo: `Nova mensagem via ${origem}`,
    mensagem: mensagem?.slice(0, 140) ?? "Nova mensagem recebida.",
    link: "/admin/atendimento",
  });
}

function extractContact(payload: Record<string, unknown>, platform: string): {
  nome: string | null;
  telefone: string | null;
  mensagem: string | null;
  contactId: string | null; // identificador do contato (chaveia a conversa)
  messageId: string | null; // id da mensagem (dedupe)
  tipo: MessageTipo;
  mediaUrl: string | null;
} {
  const result = {
    nome: null as string | null,
    telefone: null as string | null,
    mensagem: null as string | null,
    contactId: null as string | null,
    messageId: null as string | null,
    tipo: "texto" as MessageTipo,
    mediaUrl: null as string | null,
  };
  try {
    if (platform === "whatsapp") {
      // WhatsApp Cloud API: entry[].changes[].value.{contacts,messages}
      const entry = (payload.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
      const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown> | undefined;
      const value = change?.value as Record<string, unknown> | undefined;
      const contact = (value?.contacts as unknown[])?.[0] as Record<string, unknown> | undefined;
      const message = (value?.messages as unknown[])?.[0] as Record<string, unknown> | undefined;
      result.nome = ((contact?.profile as Record<string, unknown>)?.name as string) ?? null;
      result.telefone = (contact?.wa_id as string) ?? (message?.from as string) ?? null;
      result.contactId = (contact?.wa_id as string) ?? (message?.from as string) ?? null;
      result.messageId = (message?.id as string) ?? null;
      const mtype = (message?.type as string) ?? "text";
      if (mtype === "text") {
        result.mensagem = ((message?.text as Record<string, unknown>)?.body as string) ?? null;
      } else {
        result.tipo = mapWaType(mtype);
        const caption = (message?.[mtype] as Record<string, unknown>)?.caption as string | undefined;
        result.mensagem = caption ?? null;
      }
    } else {
      // Meta (Instagram/Facebook/Messenger): entry[].messaging[].{sender,message}
      const entry = (payload.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
      const messaging = (entry?.messaging as unknown[])?.[0] as Record<string, unknown> | undefined;
      const sender = messaging?.sender as Record<string, unknown> | undefined;
      const message = messaging?.message as Record<string, unknown> | undefined;
      result.contactId = (sender?.id as string) ?? null;
      result.messageId = (message?.mid as string) ?? null;
      result.mensagem = (message?.text as string) ?? null;
    }
  } catch {
    // mantém os campos nulos; o payload bruto fica salvo
  }
  return result;
}

function mapWaType(t: string): MessageTipo {
  switch (t) {
    case "image": return "imagem";
    case "audio":
    case "voice": return "audio";
    case "video": return "video";
    case "document": return "documento";
    default: return "texto";
  }
}
