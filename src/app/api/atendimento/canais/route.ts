import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { ChannelProvider } from "@/lib/types";

/**
 * Cria um canal de WhatsApp para o Atendimento.
 *
 * Guarda credenciais, então exige diretoria (mesma regra da RLS da tabela).
 * O canal nasce DESCONECTADO: a conexão de fato (ler o QR na Evolution ou
 * validar o token na Meta) acontece na tela do canal, num passo separado —
 * assim uma falha de rede no provedor não impede de salvar o cadastro.
 */

// Campos obrigatórios por provedor. Serve de validação e, principalmente,
// de allowlist: nada além disso é gravado em config.
const REQUIRED: Record<ChannelProvider, string[]> = {
  evolution: ["base_url", "api_key", "instance_name"],
  cloud_api: ["phone_number_id", "waba_id", "access_token", "verify_token", "app_secret"],
  cloud_api_coexistence: [
    "phone_number_id",
    "waba_id",
    "access_token",
    "verify_token",
    "app_secret",
  ],
};

const PROVIDERS = Object.keys(REQUIRED) as ChannelProvider[];

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  // Só a diretoria cadastra canal (a config carrega token de acesso).
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin_central, sector, ativo")
    .eq("id", user.id)
    .maybeSingle();
  const isDiretoria = !!profile?.ativo && (profile.is_admin_central || profile.sector === "admin_central");
  if (!isDiretoria) {
    return NextResponse.json(
      { error: "somente a diretoria pode conectar canais" },
      { status: 403 },
    );
  }

  let body: { provedor?: string; nome?: string; config?: Record<string, unknown> };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const provedor = body.provedor as ChannelProvider | undefined;
  const nome = typeof body.nome === "string" ? body.nome.trim() : "";
  if (!provedor || !PROVIDERS.includes(provedor)) {
    return NextResponse.json({ error: "provedor inválido" }, { status: 400 });
  }
  if (!nome) return NextResponse.json({ error: "informe o nome do canal" }, { status: 400 });

  // Só copia as chaves esperadas — evita gravar lixo vindo do formulário.
  const raw = body.config ?? {};
  const config: Record<string, string> = {};
  for (const key of REQUIRED[provedor]) {
    const value = raw[key];
    if (typeof value !== "string" || !value.trim()) {
      return NextResponse.json({ error: `campo obrigatório: ${key}` }, { status: 400 });
    }
    config[key] = value.trim();
  }

  if (provedor === "evolution") {
    // O nome da instância vira parte de URL na Evolution e chave do webhook.
    if (!/^[a-zA-Z0-9._-]+$/.test(config.instance_name)) {
      return NextResponse.json(
        { error: "nome da instância: use apenas letras, números, ponto, hífen ou underscore" },
        { status: 400 },
      );
    }
    try {
      const u = new URL(config.base_url);
      if (u.protocol !== "https:" && u.hostname !== "localhost") {
        return NextResponse.json(
          { error: "o endereço da Evolution precisa ser https" },
          { status: 400 },
        );
      }
      config.base_url = u.origin;
    } catch {
      return NextResponse.json({ error: "endereço da Evolution inválido" }, { status: 400 });
    }
  }

  // Admin client: a RLS já foi checada acima e a tabela é restrita.
  const admin = createSupabaseAdmin();
  const { data, error } = await admin
    .from("atendimento_channels")
    .insert({
      nome,
      canal: "whatsapp",
      provedor,
      status: "desconectado",
      config,
      criado_por: user.id,
    })
    .select("id")
    .single();

  if (error) {
    // Índices únicos de instance_name / phone_number_id caem aqui.
    const duplicado = error.code === "23505";
    return NextResponse.json(
      {
        error: duplicado
          ? "já existe um canal com essa instância ou esse número"
          : error.message,
      },
      { status: 400 },
    );
  }

  return NextResponse.json({ ok: true, id: data.id });
}
