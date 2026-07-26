import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Segredo de webhook dos canais HTTP (e-mail, SMS e API genérica).
 *
 * POR QUE UMA ROTA SÓ PARA ISSO: Evolution e Telegram ganham o segredo no
 * passo "conectar" — eles têm handshake. E-mail, SMS e API não têm nada
 * para conectar, mas os webhooks de entrada deles PRECISAM de um segredo
 * (a URL é pública; sem prova, qualquer um injeta mensagem no inbox).
 * Então o segredo nasce aqui, no momento em que a diretoria abre a tela
 * de integração.
 *
 * Também é aqui que se grava a `callback_url` do canal por API — o
 * endereço para onde devolvemos as mensagens de SAÍDA.
 *
 * Body: { channelId, callbackUrl?, regenerar? }
 * Resposta: { secret, callback_url }
 *
 * ATENÇÃO ao `regenerar`: trocar o segredo derruba na hora a integração
 * que estiver usando o antigo. É por isso que ele é explícito e não o
 * comportamento padrão.
 */

/** Provedores atendidos por esta rota. Os outros têm handshake próprio. */
const PROVEDORES_HTTP = ["email_smtp", "sms_generico", "api_generica"];

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  // Mesma regra das outras rotas de canal: o segredo é credencial.
  const { data: profile } = await supabase
    .from("profiles")
    .select("is_admin_central, sector, ativo")
    .eq("id", user.id)
    .maybeSingle();
  const isDiretoria =
    !!profile?.ativo && (profile.is_admin_central || profile.sector === "admin_central");
  if (!isDiretoria) {
    return NextResponse.json({ error: "somente a diretoria gerencia canais" }, { status: 403 });
  }

  let body: { channelId?: string; callbackUrl?: string | null; regenerar?: boolean };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const channelId = body.channelId?.trim();
  if (!channelId) return NextResponse.json({ error: "channelId é obrigatório" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: canal } = await admin
    .from("atendimento_channels")
    .select("id, provedor, status, config, conectado_em")
    .eq("id", channelId)
    .maybeSingle();
  if (!canal) return NextResponse.json({ error: "canal não encontrado" }, { status: 404 });

  if (!PROVEDORES_HTTP.includes(canal.provedor as string)) {
    return NextResponse.json(
      { error: "este canal usa o fluxo de conexão próprio, não um segredo de webhook" },
      { status: 400 },
    );
  }

  const config = { ...((canal.config ?? {}) as Record<string, string>) };

  // 24 bytes em hex = 48 caracteres. Mesmo tamanho usado na Evolution e no
  // Telegram — não há motivo para dois padrões de segredo no sistema.
  if (!config.webhook_secret || body.regenerar === true) {
    config.webhook_secret = crypto.randomBytes(24).toString("hex");
  }

  // callback_url só faz sentido no canal por API (é para onde a saída vai).
  if (typeof body.callbackUrl === "string") {
    const url = body.callbackUrl.trim();
    if (url) {
      if (!/^https:\/\/.+\..+/i.test(url)) {
        return NextResponse.json(
          { error: "a callback_url precisa ser https — a mensagem vai assinada, mas o conteúdo é do cliente" },
          { status: 400 },
        );
      }
      config.callback_url = url;
    } else {
      delete config.callback_url;
    }
  }

  const { error } = await admin
    .from("atendimento_channels")
    .update({
      config,
      // Canal HTTP não tem handshake: com credencial e segredo, está pronto.
      status: "conectado",
      ultimo_erro: null,
      conectado_em: canal.conectado_em ?? new Date().toISOString(),
    })
    .eq("id", channelId);
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  return NextResponse.json({
    ok: true,
    secret: config.webhook_secret,
    callback_url: config.callback_url ?? null,
  });
}
