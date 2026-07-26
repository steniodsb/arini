import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { TemplateStatus } from "@/lib/types";

/**
 * Sincroniza os templates de mensagem com a Meta.
 *
 * A Meta é a dona da verdade sobre o status: um template aprovado hoje
 * pode ser PAUSED amanhã por qualidade baixa, e a rejeição chega SEM
 * aviso — só aparece se alguém perguntar. É isso que esta rota faz:
 * GET em /<waba_id>/message_templates e atualiza as linhas locais.
 *
 * Também IMPORTA o que existe lá e não existe aqui. É o caso comum de
 * quem já usava o WhatsApp Business antes deste sistema — sem isso a
 * pessoa recadastraria tudo à mão e criaria duplicata na Meta.
 *
 * Nunca quebra a tela: erro da Meta volta como `{ error }` em português.
 */

const GRAPH_VERSION = "v21.0";

type TemplateMeta = {
  id?: string;
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  rejected_reason?: string;
  components?: Record<string, unknown>[];
};

type RespostaMeta = {
  data?: TemplateMeta[];
  error?: { message?: string; code?: number };
};

/** Status que a tabela aceita (0035). Qualquer outro vira PENDING. */
const STATUS_VALIDOS: TemplateStatus[] = [
  "local", "PENDING", "APPROVED", "REJECTED", "PAUSED", "DISABLED",
];

function normalizarStatus(bruto: string | undefined): TemplateStatus {
  const s = (bruto ?? "").toUpperCase() as TemplateStatus;
  return STATUS_VALIDOS.includes(s) ? s : "PENDING";
}

/** Conta os {{n}} do corpo — a UI usa para montar o preview. */
function contarVariaveis(corpo: string): number {
  const marcas = corpo.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  const numeros = marcas.map((m) => Number(m.replace(/\D/g, "")));
  return numeros.length === 0 ? 0 : Math.max(...numeros);
}

/** Texto do componente BODY, que é o que a tela mostra. */
function corpoDosComponentes(componentes: Record<string, unknown>[] | undefined): string {
  if (!Array.isArray(componentes)) return "";
  const body = componentes.find((c) => String(c.type ?? "").toUpperCase() === "BODY");
  return typeof body?.text === "string" ? body.text : "";
}

export async function POST(req: Request) {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });

  const { data: profile } = await supabase
    .from("profiles")
    .select("atendimento_access, is_admin_central, ativo")
    .eq("id", user.id)
    .maybeSingle();
  if (!profile?.ativo || !(profile.atendimento_access || profile.is_admin_central)) {
    return NextResponse.json({ error: "sem acesso ao atendimento" }, { status: 403 });
  }

  let body: { channelId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const channelId = body.channelId?.trim();
  if (!channelId) return NextResponse.json({ error: "escolha um canal" }, { status: 400 });

  // Admin: as credenciais da Meta ficam escondidas do usuário pela RLS.
  const admin = createSupabaseAdmin();
  const { data: canal } = await admin
    .from("atendimento_channels")
    .select("id, provedor, config")
    .eq("id", channelId)
    .maybeSingle();
  if (!canal) return NextResponse.json({ error: "canal não encontrado" }, { status: 404 });

  const config = (canal.config ?? {}) as Record<string, string | undefined>;
  const { waba_id, access_token } = config;

  // Erro claro em vez de falha silenciosa: sem WABA não há o que consultar.
  if (!waba_id || !access_token) {
    return NextResponse.json(
      {
        error:
          "este canal não tem waba_id/access_token — templates da Meta só existem em canal " +
          "conectado pela API Oficial (Cloud API)",
      },
      { status: 400 },
    );
  }

  let json: RespostaMeta;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${waba_id}/message_templates` +
        `?limit=200&fields=id,name,language,status,category,components,rejected_reason`,
      {
        headers: { Authorization: `Bearer ${access_token}` },
        signal: AbortSignal.timeout(20_000),
      },
    );
    json = (await res.json().catch(() => ({}))) as RespostaMeta;
    if (!res.ok) {
      return NextResponse.json(
        { error: json.error?.message ?? `a Meta respondeu HTTP ${res.status}` },
        { status: 400 },
      );
    }
  } catch (e) {
    const motivo =
      e instanceof Error && e.name === "TimeoutError"
        ? "a Meta não respondeu a tempo"
        : "não foi possível alcançar a Meta";
    return NextResponse.json({ error: motivo }, { status: 502 });
  }

  const remotos = Array.isArray(json.data) ? json.data : [];
  const agora = new Date().toISOString();

  // Índice do que já existe localmente, por nome+idioma (a chave única).
  const { data: locais } = await admin
    .from("atendimento_templates")
    .select("id, nome, idioma")
    .eq("channel_id", channelId);
  const indice = new Map(
    (locais ?? []).map((t) => [`${t.nome}|${t.idioma}`, t.id as string]),
  );

  let atualizados = 0;
  let importados = 0;

  for (const t of remotos) {
    if (!t.name) continue;
    const idioma = t.language ?? "pt_BR";
    const chave = `${t.name}|${idioma}`;
    const corpo = corpoDosComponentes(t.components);

    const patch = {
      status: normalizarStatus(t.status),
      meta_id: t.id ?? null,
      // A Meta só manda rejected_reason quando rejeita; limpamos no resto
      // para o motivo antigo não ficar assombrando um template aprovado.
      motivo_rejeicao:
        normalizarStatus(t.status) === "REJECTED" ? (t.rejected_reason ?? "sem motivo informado") : null,
      componentes: t.components ?? [],
      corpo,
      variaveis: contarVariaveis(corpo),
      sincronizado_em: agora,
    };

    const idLocal = indice.get(chave);
    if (idLocal) {
      const { error } = await admin.from("atendimento_templates").update(patch).eq("id", idLocal);
      if (!error) atualizados++;
    } else {
      const { error } = await admin.from("atendimento_templates").insert({
        channel_id: channelId,
        nome: t.name,
        idioma,
        categoria: ["MARKETING", "UTILITY", "AUTHENTICATION"].includes((t.category ?? "").toUpperCase())
          ? (t.category ?? "").toUpperCase()
          : "MARKETING",
        ...patch,
      });
      if (!error) importados++;
    }
  }

  return NextResponse.json({
    ok: true,
    encontrados: remotos.length,
    atualizados,
    importados,
    sincronizado_em: agora,
  });
}
