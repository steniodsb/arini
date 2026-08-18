import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { ipDaRequisicao, registrarAuditoria } from "@/lib/atendimento/audit";
import { linhaSocialDaPlataforma } from "@/lib/meta-plataformas";

// =====================================================================
// Credenciais das redes da Meta (Instagram, Facebook/Messenger) para o
// Atendimento.
//
// POR QUE ESTA ROTA EXISTE — e não um insert direto do navegador:
//
// 1. As credenciais moram em `social_integrations`, cuja RLS é do CRM:
//    leitura para marketing/administrativo/recepção/diretoria, escrita
//    para diretoria/marketing. Um administrador DO ATENDIMENTO cujo setor
//    do CRM seja outro simplesmente não enxerga a linha — a tela abriria
//    vazia e salvar não faria nada, sem erro visível. Aqui a permissão é
//    verificada explicitamente e a escrita vai pelo service role.
//
// 2. Token nunca volta para o navegador. O GET devolve só o ESTADO
//    (tem token? tem app secret? está ativo?) — o suficiente para a tela
//    dizer o que falta sem repetir o segredo na resposta.
//
// 3. Testar a credencial exige chamar a Graph API com o token, o que só
//    pode acontecer no servidor.
// =====================================================================

const PLATAFORMAS = ["instagram", "facebook", "messenger", "tiktok"] as const;
type Plataforma = (typeof PLATAFORMAS)[number];

const GRAPH_VERSION = "v21.0";

/** Instagram e Messenger falam pela MESMA Página; a linha é por plataforma. */
function plataformaValida(v: unknown): v is Plataforma {
  return typeof v === "string" && (PLATAFORMAS as readonly string[]).includes(v);
}

type Config = {
  page_id?: string | null;
  access_token?: string | null;
  verify_token?: string | null;
  app_secret?: string | null;
};

async function exigirDiretoria() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { erro: NextResponse.json({ error: "não autenticado" }, { status: 401 }) };

  const { data: profile } = await supabase
    .from("profiles")
    .select("nome, is_admin_central, sector, ativo")
    .eq("id", user.id)
    .maybeSingle();

  const isDiretoria =
    !!profile?.ativo && (profile.is_admin_central || profile.sector === "admin_central");
  if (!isDiretoria) {
    return {
      erro: NextResponse.json(
        { error: "somente a diretoria cadastra credenciais de canal" },
        { status: 403 },
      ),
    };
  }
  return { user, nome: (profile?.nome as string | null) ?? null };
}

/**
 * Um token de acesso não se parece com URL nem com "cole aqui".
 *
 * Esta checagem existe por um motivo concreto: em produção o campo
 * `access_token` do Facebook estava preenchido com a URL do webhook —
 * alguém colou no campo errado e nada avisou. O canal ficava "ativo",
 * incapaz de responder, e a única pista aparecia como erro da Graph API
 * na hora de enviar.
 */
function tokenSuspeito(token: string): string | null {
  const t = token.trim();
  if (t.length < 20) return "o token parece curto demais para ser um token de página";
  if (/^https?:\/\//i.test(t)) return "isso é uma URL, não um token de acesso";
  if (/\s/.test(t)) return "o token não pode conter espaços";
  return null;
}

/** GET: estado das quatro plataformas, sem devolver segredo nenhum. */
export async function GET() {
  const auth = await exigirDiretoria();
  if ("erro" in auth) return auth.erro;

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("social_integrations")
    .select("plataforma, ativo, config, updated_at");

  const estado = PLATAFORMAS.map((p) => {
    const linha = (data ?? []).find((d) => d.plataforma === linhaSocialDaPlataforma(p));
    const cfg = (linha?.config ?? {}) as Config;
    const token = (cfg.access_token ?? "").trim();
    return {
      plataforma: p,
      ativo: Boolean(linha?.ativo),
      page_id: cfg.page_id ?? null,
      verify_token: cfg.verify_token ?? null,
      tem_token: token.length > 0,
      // O problema real precisa aparecer na tela, não só no envio.
      token_invalido: token.length > 0 ? tokenSuspeito(token) : null,
      tem_app_secret: Boolean((cfg.app_secret ?? "").trim()),
      atualizado_em: linha?.updated_at ?? null,
    };
  });

  return NextResponse.json({ plataformas: estado });
}

/** PUT: grava credenciais de uma plataforma. Campo vazio não apaga o que já existe. */
export async function PUT(req: Request) {
  const auth = await exigirDiretoria();
  if ("erro" in auth) return auth.erro;

  let body: {
    plataforma?: string;
    page_id?: string;
    access_token?: string;
    verify_token?: string;
    app_secret?: string;
    ativo?: boolean;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  if (!plataformaValida(body.plataforma)) {
    return NextResponse.json({ error: "plataforma inválida" }, { status: 400 });
  }

  // Messenger não tem linha própria — ver `lib/meta-plataformas.ts`.
  const linha = linhaSocialDaPlataforma(body.plataforma);

  const admin = createSupabaseAdmin();
  const { data: atual } = await admin
    .from("social_integrations")
    .select("config")
    .eq("plataforma", linha)
    .maybeSingle();

  const config: Config = { ...((atual?.config ?? {}) as Config) };

  // Campo em branco = "não mexi nele". É o que permite reeditar o page_id
  // sem precisar colar o token de novo (que a tela nem conhece).
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  if (texto(body.page_id)) config.page_id = texto(body.page_id);
  if (texto(body.verify_token)) config.verify_token = texto(body.verify_token);
  if (texto(body.app_secret)) config.app_secret = texto(body.app_secret);
  if (texto(body.access_token)) {
    const problema = tokenSuspeito(texto(body.access_token));
    if (problema) return NextResponse.json({ error: problema }, { status: 400 });
    config.access_token = texto(body.access_token);
  }

  const ativo = Boolean(body.ativo);

  // Ligar sem app_secret deixaria o webhook aceitando qualquer POST — a
  // URL é pública, então isso é porta aberta, não conveniência.
  if (ativo && !config.app_secret) {
    return NextResponse.json(
      {
        error:
          "informe o App Secret antes de ativar: sem ele o webhook aceita qualquer POST que chegue na URL",
      },
      { status: 400 },
    );
  }
  if (ativo && !config.verify_token) {
    return NextResponse.json(
      { error: "informe o Verify Token — é o que a Meta usa para validar a URL do webhook" },
      { status: 400 },
    );
  }

  const { data: gravado, error } = await admin
    .from("social_integrations")
    .update({ ativo, config, updated_by: auth.user.id, updated_at: new Date().toISOString() })
    .eq("plataforma", linha)
    .select("plataforma");

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Um update que não acha linha nenhuma é sucesso para o Postgres e
  // mentira para quem clicou em Salvar — foi exatamente o que acontecia
  // com o Messenger. Nunca mais em silêncio.
  if (!gravado || gravado.length === 0) {
    return NextResponse.json(
      { error: `não existe integração cadastrada para "${linha}" no banco` },
      { status: 500 },
    );
  }

  // Nunca `config` nos detalhes: ali moram access_token e app_secret.
  await registrarAuditoria(admin, {
    atorId: auth.user.id,
    atorNome: auth.nome,
    acao: ativo ? "conectou" : "atualizou",
    entidade: "social_integrations",
    entidadeId: body.plataforma,
    detalhes: {
      plataforma: body.plataforma,
      ativo,
      campos: Object.keys(config).filter((k) => (config as Record<string, unknown>)[k]),
    },
    ip: ipDaRequisicao(req),
  });

  return NextResponse.json({ ok: true });
}

/**
 * POST: testa a credencial contra a Graph API de verdade.
 *
 * Sem isto, o primeiro sinal de token errado seria o cliente escrevendo e
 * ninguém conseguindo responder. O teste é de leitura (`GET /<page_id>`),
 * então não manda mensagem para ninguém.
 */
export async function POST(req: Request) {
  const auth = await exigirDiretoria();
  if ("erro" in auth) return auth.erro;

  let body: { plataforma?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  if (!plataformaValida(body.plataforma)) {
    return NextResponse.json({ error: "plataforma inválida" }, { status: 400 });
  }
  if (body.plataforma === "tiktok") {
    return NextResponse.json(
      { ok: false, motivo: "o TikTok não tem conversa de duas vias — ele só gera lead" },
      { status: 400 },
    );
  }

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("social_integrations")
    .select("config")
    .eq("plataforma", linhaSocialDaPlataforma(body.plataforma))
    .maybeSingle();

  const cfg = (data?.config ?? {}) as Config;
  const token = (cfg.access_token ?? "").trim();
  const pageId = (cfg.page_id ?? "").trim();

  if (!token) return NextResponse.json({ ok: false, motivo: "sem token cadastrado" }, { status: 400 });
  const problema = tokenSuspeito(token);
  if (problema) return NextResponse.json({ ok: false, motivo: problema }, { status: 400 });
  if (!pageId) {
    return NextResponse.json({ ok: false, motivo: "sem Page ID cadastrado" }, { status: 400 });
  }

  // `instagram_business_account` só volta quando a conta do Instagram está
  // de fato vinculada à Página — que é o erro mais comum e o mais difícil
  // de diagnosticar pela mensagem crua da Meta.
  const campos =
    body.plataforma === "instagram"
      ? "id,name,instagram_business_account{id,username}"
      : "id,name";

  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(pageId)}?fields=${encodeURIComponent(campos)}&access_token=${encodeURIComponent(token)}`,
      { signal: AbortSignal.timeout(10_000) },
    );
    const json = (await res.json().catch(() => ({}))) as {
      id?: string;
      name?: string;
      instagram_business_account?: { id: string; username?: string };
      error?: { message?: string; code?: number; type?: string };
    };

    if (!res.ok || json.error) {
      return NextResponse.json({
        ok: false,
        motivo: json.error?.message ?? `a Meta respondeu HTTP ${res.status}`,
        codigo: json.error?.code ?? null,
      });
    }

    if (body.plataforma === "instagram" && !json.instagram_business_account) {
      return NextResponse.json({
        ok: false,
        motivo:
          "o token é válido, mas esta Página não tem conta do Instagram vinculada — " +
          "vincule em Configurações da Página › Contas vinculadas e confirme que o " +
          "Instagram está como conta Profissional",
      });
    }

    return NextResponse.json({
      ok: true,
      pagina: json.name ?? pageId,
      instagram: json.instagram_business_account?.username ?? null,
    });
  } catch (e) {
    const msg =
      e instanceof Error && e.name === "TimeoutError"
        ? "a Meta não respondeu a tempo"
        : e instanceof Error
          ? e.message
          : "falha de rede";
    return NextResponse.json({ ok: false, motivo: msg });
  }
}
