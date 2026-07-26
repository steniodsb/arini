import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import {
  ensureInstance,
  connectionState,
  logout,
  toChannelStatus,
  type EvolutionConfig,
} from "@/lib/evolution";
import {
  getMe as tgGetMe,
  setWebhook as tgSetWebhook,
  deleteWebhook as tgDeleteWebhook,
} from "@/lib/telegram";
import type { ChannelStatus } from "@/lib/types";

/**
 * Ações de conexão de um canal: conectar | status | desconectar.
 *
 * Evolution  → cria/parea a instância e devolve o QR Code.
 * Telegram   → valida o token no getMe e registra o webhook do bot.
 * Cloud API  → não há "conectar": validamos o token contra a Graph API e,
 *              se responder, o canal está pronto (o webhook é configurado
 *              no painel da Meta, não por aqui).
 */

const ACOES = ["conectar", "status", "desconectar"] as const;
type Acao = (typeof ACOES)[number];

const GRAPH_VERSION = "v21.0";

export async function POST(
  req: Request,
  { params }: { params: { id: string; acao: string } },
) {
  const acao = params.acao as Acao;
  if (!ACOES.includes(acao)) {
    return NextResponse.json({ error: "ação inválida" }, { status: 404 });
  }

  const supabase = createSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    // `nome` só para desnormalizar o autor no log de auditoria.
    .select("nome, is_admin_central, sector, ativo")
    .eq("id", user.id)
    .maybeSingle();
  const isDiretoria =
    !!profile?.ativo && (profile.is_admin_central || profile.sector === "admin_central");
  if (!isDiretoria) {
    return NextResponse.json({ error: "somente a diretoria gerencia canais" }, { status: 403 });
  }

  // Admin client: precisamos das credenciais, que a RLS esconde do resto.
  const admin = createSupabaseAdmin();
  const { data: canal } = await admin
    .from("atendimento_channels")
    .select("id, provedor, status, config")
    .eq("id", params.id)
    .maybeSingle();
  if (!canal) return NextResponse.json({ error: "canal não encontrado" }, { status: 404 });

  const config = (canal.config ?? {}) as Record<string, string>;

  async function salvar(patch: {
    status: ChannelStatus;
    ultimo_erro?: string | null;
    telefone?: string | null;
    conectado_em?: string | null;
    config?: Record<string, string>;
  }) {
    await admin.from("atendimento_channels").update(patch).eq("id", params.id);
  }

  /**
   * Auditoria de conexão/desconexão de canal.
   *
   * Só é chamada nos caminhos de SUCESSO de `conectar`/`desconectar`. A
   * ação `status` fica de fora de propósito: a tela do canal faz polling
   * nela e cada visita geraria dezenas de linhas — um log que inunda é um
   * log que ninguém lê. Tentativa que falhou também não entra aqui: o
   * motivo já fica em `atendimento_channels.ultimo_erro`.
   *
   * `detalhes` nunca carrega a config: ali moram api_key, access_token,
   * bot_token e app_secret.
   */
  async function auditar(verbo: "conectou" | "desconectou", detalhes?: Record<string, unknown>) {
    await registrarAuditoria(admin, {
      atorId: user!.id,
      atorNome: profile?.nome ?? user!.email ?? null,
      acao: verbo,
      entidade: "atendimento_channels",
      entidadeId: params.id,
      detalhes: { provedor: canal!.provedor, ...(detalhes ?? {}) },
      ip: ipDaRequisicao(req),
    });
  }

  try {
    if (canal.provedor === "evolution") {
      const cfg: EvolutionConfig = {
        base_url: config.base_url,
        api_key: config.api_key,
        instance_name: config.instance_name,
      };

      if (acao === "desconectar") {
        await logout(cfg);
        await salvar({ status: "desconectado", ultimo_erro: null, conectado_em: null });
        await auditar("desconectou", { instancia: cfg.instance_name });
        return NextResponse.json({ status: "desconectado" });
      }

      if (acao === "status") {
        const state = await connectionState(cfg);
        const status = toChannelStatus(state);
        await salvar({
          status,
          ultimo_erro: null,
          conectado_em: status === "conectado" ? new Date().toISOString() : null,
        });
        return NextResponse.json({ status });
      }

      // conectar: garante a instância e o webhook, devolve o QR.
      // O segredo do webhook nasce aqui e vale para sempre neste canal —
      // é o que separa um evento legítimo de um forjado.
      let secret = config.webhook_secret;
      let novaConfig: Record<string, string> | undefined;
      if (!secret) {
        secret = crypto.randomBytes(24).toString("hex");
        novaConfig = { ...config, webhook_secret: secret };
      }

      const base =
        process.env.NEXT_PUBLIC_SITE_URL ||
        "https://atendimento.arininegociosimobiliarios.com.br";
      const { qrcode, state } = await ensureInstance(
        cfg,
        `${base}/api/webhooks/evolution`,
        secret,
      );
      const status = qrcode ? "aguardando_qr" : toChannelStatus(state);
      await salvar({
        status,
        ultimo_erro: null,
        conectado_em: status === "conectado" ? new Date().toISOString() : null,
        ...(novaConfig ? { config: novaConfig } : {}),
      });
      // "conectou" mesmo quando volta QR: a ação de conectar foi executada
      // e a instância foi (re)criada na Evolution. O `status` no detalhe
      // diz se ficou pendente de leitura do QR.
      await auditar("conectou", { instancia: cfg.instance_name, status });
      return NextResponse.json({ status, qrcode });
    }

    // ===== Telegram (Bot API) =====
    if (canal.provedor === "telegram_bot") {
      const token = config.bot_token;

      if (acao === "desconectar") {
        // Só removemos o webhook: o bot continua existindo no BotFather e
        // pode ser reconectado depois sem recriar nada.
        await tgDeleteWebhook(token);
        await salvar({ status: "desconectado", ultimo_erro: null, conectado_em: null });
        await auditar("desconectou");
        return NextResponse.json({ status: "desconectado" });
      }

      if (acao === "status") {
        // Não há "estado de conexão" no Telegram: se o getMe responde, o
        // token é válido e o bot está de pé.
        const bot = await tgGetMe(token);
        await salvar({
          status: "conectado",
          ultimo_erro: null,
          telefone: bot.username ? `@${bot.username}` : null,
          conectado_em: new Date().toISOString(),
        });
        return NextResponse.json({ status: "conectado" });
      }

      // conectar: valida o token, garante o segredo e registra o webhook.
      const bot = await tgGetMe(token);

      // O segredo nasce aqui e vale para sempre neste canal — é o que o
      // webhook confere no header X-Telegram-Bot-Api-Secret-Token.
      let secret = config.webhook_secret;
      let novaConfig: Record<string, string> | undefined;
      if (!secret) {
        secret = crypto.randomBytes(24).toString("hex");
        novaConfig = { ...config, webhook_secret: secret };
      }

      const base =
        process.env.NEXT_PUBLIC_SITE_URL ||
        "https://atendimento.arininegociosimobiliarios.com.br";
      // O Telegram não diz qual bot enviou o update, então o id do canal
      // viaja na querystring (a autenticidade quem garante é o segredo).
      await tgSetWebhook(token, `${base}/api/webhooks/telegram?canal=${params.id}`, secret);

      await salvar({
        status: "conectado",
        ultimo_erro: null,
        telefone: bot.username ? `@${bot.username}` : null,
        conectado_em: new Date().toISOString(),
        ...(novaConfig ? { config: novaConfig } : {}),
      });
      // O @username identifica o bot no log sem expor o bot_token.
      await auditar("conectou", { bot: bot.username ? `@${bot.username}` : null });
      return NextResponse.json({ status: "conectado" });
    }

    // ===== Cloud API (oficial e coexistence) =====
    if (acao === "desconectar") {
      // Não desregistramos o número na Meta — isso é destrutivo e, em
      // coexistence, precisa ser feito pelo próprio cliente no aplicativo.
      await salvar({ status: "desconectado", ultimo_erro: null, conectado_em: null });
      await auditar("desconectou");
      return NextResponse.json({ status: "desconectado" });
    }

    // conectar/status: pergunta à Graph API se o número responde.
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${config.phone_number_id}` +
        `?fields=display_phone_number,verified_name,platform_type,is_on_biz_app`,
      {
        headers: { Authorization: `Bearer ${config.access_token}` },
        signal: AbortSignal.timeout(15_000),
      },
    );
    const json = (await res.json().catch(() => ({}))) as {
      display_phone_number?: string;
      platform_type?: string;
      is_on_biz_app?: boolean;
      error?: { message?: string };
    };

    if (!res.ok) {
      const motivo = json.error?.message ?? `Meta respondeu HTTP ${res.status}`;
      await salvar({ status: "erro", ultimo_erro: motivo });
      return NextResponse.json({ status: "erro", error: motivo }, { status: 400 });
    }

    // Em coexistence, is_on_biz_app === true confirma que o número segue
    // ativo no app do celular. Se vier false, o modo não foi concluído.
    if (canal.provedor === "cloud_api_coexistence" && json.is_on_biz_app === false) {
      const aviso =
        "A Meta confirma o número, mas ele não está em modo Coexistence — " +
        "conclua o onboarding do app WhatsApp Business para manter o número no celular.";
      await salvar({
        status: "erro",
        ultimo_erro: aviso,
        telefone: json.display_phone_number ?? null,
      });
      return NextResponse.json({ status: "erro", error: aviso }, { status: 400 });
    }

    await salvar({
      status: "conectado",
      ultimo_erro: null,
      telefone: json.display_phone_number ?? null,
      conectado_em: new Date().toISOString(),
    });
    // Este trecho é compartilhado por `conectar` e `status`; só a ação
    // deliberada do usuário vira log (ver comentário em `auditar`).
    if (acao === "conectar") {
      await auditar("conectou", { telefone: json.display_phone_number ?? null });
    }
    return NextResponse.json({ status: "conectado" });
  } catch (e) {
    const motivo = e instanceof Error ? e.message : "falha inesperada";
    await salvar({ status: "erro", ultimo_erro: motivo });
    return NextResponse.json({ status: "erro", error: motivo }, { status: 400 });
  }
}
