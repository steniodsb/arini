import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";

// Plataformas suportadas e a origem de lead correspondente.
const PLATFORM_ORIGIN: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  messenger: "messenger",
  whatsapp: "whatsapp",
  tiktok: "tiktok",
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
 * Recebe mensagens das plataformas e cria um lead no CRM.
 * O parsing é tolerante: extrai nome/telefone/mensagem de formatos comuns
 * (Meta Graph webhooks, WhatsApp Cloud API) e guarda o payload bruto.
 */
export async function POST(req: Request, { params }: { params: { platform: string } }) {
  const origem = PLATFORM_ORIGIN[params.platform];
  if (!origem) return NextResponse.json({ error: "plataforma não suportada" }, { status: 404 });

  let payload: Record<string, unknown> = {};
  try {
    payload = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();
  const { data: integ } = await admin
    .from("social_integrations")
    .select("ativo")
    .eq("plataforma", params.platform)
    .maybeSingle();

  // Se a integração não estiver ativa, apenas confirma o recebimento (sem criar lead).
  if (!integ?.ativo) return NextResponse.json({ ok: true, ignored: true });

  const extracted = extractContact(payload, params.platform);

  await admin.from("leads").insert({
    nome: extracted.nome || `Lead ${origem}`,
    telefone: extracted.telefone,
    whatsapp: params.platform === "whatsapp" ? extracted.telefone : null,
    origem,
    mensagem: extracted.mensagem,
    external_id: extracted.externalId,
    raw_payload: payload,
    stage: "novo",
  });

  await admin.from("notifications").insert({
    sector: "recepcao",
    tipo: "lead",
    titulo: `Novo lead via ${origem}`,
    mensagem: extracted.mensagem?.slice(0, 140) ?? "Nova mensagem recebida.",
    link: "/admin/leads",
  });

  return NextResponse.json({ ok: true });
}

function extractContact(payload: Record<string, unknown>, platform: string): {
  nome: string | null; telefone: string | null; mensagem: string | null; externalId: string | null;
} {
  const result = { nome: null as string | null, telefone: null as string | null, mensagem: null as string | null, externalId: null as string | null };
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
      result.mensagem = ((message?.text as Record<string, unknown>)?.body as string) ?? null;
      result.externalId = (message?.id as string) ?? null;
    } else {
      // Meta (Instagram/Facebook/Messenger): entry[].messaging[].{sender,message}
      const entry = (payload.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
      const messaging = (entry?.messaging as unknown[])?.[0] as Record<string, unknown> | undefined;
      const sender = messaging?.sender as Record<string, unknown> | undefined;
      const message = messaging?.message as Record<string, unknown> | undefined;
      result.externalId = (sender?.id as string) ?? null;
      result.mensagem = (message?.text as string) ?? null;
    }
  } catch {
    // mantém os campos nulos; o payload bruto fica salvo
  }
  return result;
}
