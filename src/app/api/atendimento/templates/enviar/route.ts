import { NextResponse } from "next/server";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";

/**
 * Envia um template local para APROVAÇÃO na Meta.
 *
 * POST /<waba_id>/message_templates com { name, language, category,
 * components }. A Meta responde com o id e o status inicial (quase sempre
 * PENDING; templates simples às vezes já voltam APPROVED).
 *
 * Regras da Meta que o código precisa respeitar, senão a submissão volta
 * com erro genérico e ninguém entende:
 *   · o nome só aceita minúsculas, números e underscore;
 *   · variáveis {{1}}, {{2}}… precisam ser SEQUENCIAIS a partir de 1;
 *   · corpo com variável exige `example.body_text` — a Meta rejeita sem
 *     exemplo porque o revisor humano precisa ver a mensagem preenchida;
 *   · a variável não pode abrir nem fechar o corpo.
 *
 * Sem waba_id/access_token no canal, devolvemos erro explícito em vez de
 * fingir que enviou.
 */

const GRAPH_VERSION = "v21.0";

type ComponenteMeta = {
  type: string;
  format?: string;
  text?: string;
  example?: Record<string, unknown>;
};

type RespostaMeta = {
  id?: string;
  status?: string;
  category?: string;
  error?: { message?: string; error_user_msg?: string };
};

/** Maior índice de variável usado no corpo — {{1}}, {{2}}… */
function indicesDeVariaveis(corpo: string): number[] {
  const marcas = corpo.match(/\{\{\s*(\d+)\s*\}\}/g) ?? [];
  return [...new Set(marcas.map((m) => Number(m.replace(/\D/g, ""))))].sort((a, b) => a - b);
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

  let body: { templateId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }
  const templateId = body.templateId?.trim();
  if (!templateId) return NextResponse.json({ error: "templateId é obrigatório" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: template } = await admin
    .from("atendimento_templates")
    .select("id, channel_id, nome, idioma, categoria, corpo, componentes, status, meta_id")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return NextResponse.json({ error: "template não encontrado" }, { status: 404 });

  if (template.status !== "local" && template.status !== "REJECTED") {
    return NextResponse.json(
      {
        error:
          `este template já está na Meta (status ${template.status}). ` +
          "Para mudar o texto, crie um template novo — a Meta não deixa editar o que já foi submetido.",
      },
      { status: 400 },
    );
  }

  if (!template.channel_id) {
    return NextResponse.json(
      { error: "template sem canal — escolha o canal Cloud API ao qual ele pertence" },
      { status: 400 },
    );
  }

  const { data: canal } = await admin
    .from("atendimento_channels")
    .select("id, provedor, config")
    .eq("id", template.channel_id)
    .maybeSingle();
  if (!canal) return NextResponse.json({ error: "canal do template não encontrado" }, { status: 404 });

  const config = (canal.config ?? {}) as Record<string, string | undefined>;
  const { waba_id, access_token } = config;
  if (!waba_id || !access_token) {
    return NextResponse.json(
      {
        error:
          "este canal não tem waba_id/access_token — só dá para submeter template em canal " +
          "conectado pela API Oficial (Cloud API) da Meta",
      },
      { status: 400 },
    );
  }

  // ---- Monta os componentes -------------------------------------------
  // Preferimos o que já está salvo em `componentes` (header/footer vêm de
  // lá); o BODY é sempre reconstruído a partir de `corpo`, que é o campo
  // que a tela edita.
  const salvos = Array.isArray(template.componentes)
    ? (template.componentes as ComponenteMeta[])
    : [];
  const corpo = (template.corpo ?? "").trim();
  if (!corpo) return NextResponse.json({ error: "o template precisa de um corpo" }, { status: 400 });

  const indices = indicesDeVariaveis(corpo);
  const sequencial = indices.every((n, i) => n === i + 1);
  if (!sequencial) {
    return NextResponse.json(
      {
        error:
          "as variáveis precisam ser sequenciais começando em {{1}} — " +
          `este corpo usa ${indices.map((n) => `{{${n}}}`).join(", ")}`,
      },
      { status: 400 },
    );
  }
  if (/^\s*\{\{\d+\}\}/.test(corpo) || /\{\{\d+\}\}\s*$/.test(corpo)) {
    return NextResponse.json(
      { error: "a Meta recusa corpo que começa ou termina com variável — escreva algo em volta" },
      { status: 400 },
    );
  }

  const componentes: ComponenteMeta[] = [];

  const header = salvos.find((c) => String(c.type ?? "").toUpperCase() === "HEADER");
  if (header?.text) componentes.push({ type: "HEADER", format: "TEXT", text: header.text });

  const bodyComponent: ComponenteMeta = { type: "BODY", text: corpo };
  if (indices.length > 0) {
    // Exemplo obrigatório. Valores genéricos: o revisor da Meta só precisa
    // ver a mensagem preenchida para julgar o conteúdo.
    bodyComponent.example = {
      body_text: [indices.map((n) => `exemplo ${n}`)],
    };
  }
  componentes.push(bodyComponent);

  const footer = salvos.find((c) => String(c.type ?? "").toUpperCase() === "FOOTER");
  if (footer?.text) componentes.push({ type: "FOOTER", text: footer.text });

  // ---- Submete ---------------------------------------------------------
  let json: RespostaMeta;
  try {
    const res = await fetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${waba_id}/message_templates`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${access_token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: template.nome,
          language: template.idioma,
          category: template.categoria,
          components: componentes,
        }),
        signal: AbortSignal.timeout(20_000),
      },
    );
    json = (await res.json().catch(() => ({}))) as RespostaMeta;
    if (!res.ok) {
      const motivo =
        json.error?.error_user_msg || json.error?.message || `a Meta respondeu HTTP ${res.status}`;
      // Guarda o motivo na linha: o usuário fecha a tela e volta depois
      // querendo saber por que não foi.
      await admin
        .from("atendimento_templates")
        .update({ motivo_rejeicao: motivo, sincronizado_em: new Date().toISOString() })
        .eq("id", templateId);
      return NextResponse.json({ error: motivo }, { status: 400 });
    }
  } catch (e) {
    const motivo =
      e instanceof Error && e.name === "TimeoutError"
        ? "a Meta não respondeu a tempo"
        : "não foi possível alcançar a Meta";
    return NextResponse.json({ error: motivo }, { status: 502 });
  }

  const status =
    (json.status ?? "PENDING").toUpperCase() === "APPROVED" ? "APPROVED" : "PENDING";

  const { data: atualizado } = await admin
    .from("atendimento_templates")
    .update({
      status,
      meta_id: json.id ?? null,
      motivo_rejeicao: null,
      componentes,
      sincronizado_em: new Date().toISOString(),
    })
    .eq("id", templateId)
    .select("*")
    .single();

  return NextResponse.json({ ok: true, status, template: atualizado });
}
