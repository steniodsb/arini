import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
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
  // Telegram: o token do BotFather basta — o resto vem do getMe.
  telegram_bot: ["bot_token"],
  // E-mail: o provedor é a RESEND (API HTTP), não SMTP puro.
  // Trocamos os campos smtp_host/port/user/pass porque SMTP exige
  // biblioteca com socket para enviar e IMAP para ler a caixa — nada
  // disso roda bem em serverless e nenhuma das duas está no projeto.
  // A Resend é REST: `fetch` para enviar, webhook para receber.
  // Ver src/lib/email.ts e src/app/api/webhooks/email/route.ts.
  email_smtp: ["api_key", "remetente", "nome_remetente"],
  sms_generico: ["api_url", "api_key", "remetente"],
  // Widget e API não têm credencial de terceiro: o token nasce no sistema.
  widget: [],
  api_generica: [],
};

const PROVIDERS = Object.keys(REQUIRED) as ChannelProvider[];

/**
 * Qual valor de `atendimento_channels.canal` cada provedor produz.
 *
 * A coluna tem default 'whatsapp' e antes todo canal era WhatsApp mesmo.
 * Com e-mail, SMS e API genérica isso deixou de valer: um canal de e-mail
 * gravado como 'whatsapp' faz a resolução de saída e os filtros de inbox
 * apontarem para o lugar errado.
 */
const CANAL_DO_PROVEDOR: Record<ChannelProvider, string> = {
  evolution: "whatsapp",
  cloud_api: "whatsapp",
  cloud_api_coexistence: "whatsapp",
  telegram_bot: "telegram",
  email_smtp: "email",
  sms_generico: "sms",
  widget: "site",
  api_generica: "api",
};

/**
 * Provedores SEM handshake: não há QR para ler nem token de terceiro para
 * validar — basta a credencial estar cadastrada. Se nascessem
 * "desconectado", o despacho de saída recusaria o envio para sempre,
 * porque nenhuma tela sabe "conectar" esses canais.
 */
const SEM_HANDSHAKE: ChannelProvider[] = ["email_smtp", "sms_generico", "api_generica", "widget"];

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  // Só a diretoria cadastra canal (a config carrega token de acesso).
  const { data: profile } = await supabase
    .from("profiles")
    // `nome` entra só para desnormalizar o autor no log de auditoria — o
    // log tem que continuar legível se o perfil for apagado depois.
    .select("nome, is_admin_central, sector, ativo")
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
      canal: CANAL_DO_PROVEDOR[provedor],
      provedor,
      // Canal sem handshake já nasce pronto para enviar (ver SEM_HANDSHAKE).
      status: SEM_HANDSHAKE.includes(provedor) ? "conectado" : "desconectado",
      ...(SEM_HANDSHAKE.includes(provedor) ? { conectado_em: new Date().toISOString() } : {}),
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

  // Auditoria: canal guarda credencial de terceiro, então "quem cadastrou
  // este canal" é pergunta de segurança, não de curiosidade.
  // `config` NUNCA entra em `detalhes` — ela carrega api_key, access_token
  // e app_secret, e a tela de auditoria é lida por todo o atendimento.
  await registrarAuditoria(admin, {
    atorId: user.id,
    atorNome: profile?.nome ?? user.email ?? null,
    acao: "criou",
    entidade: "atendimento_channels",
    entidadeId: data.id as string,
    detalhes: {
      nome,
      provedor,
      canal: CANAL_DO_PROVEDOR[provedor],
      // Só os NOMES das chaves preenchidas, jamais os valores.
      campos_config: Object.keys(config),
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true, id: data.id });
}
