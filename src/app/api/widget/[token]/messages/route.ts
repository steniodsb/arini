import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { dispararAutomacoes } from "@/lib/atendimento/triggers";
import {
  carregarCaixaPorToken,
  corsAberto,
  excedeuLimite,
  jsonCors,
  naoEncontrado,
  resolverCors,
  respostaPreflight,
  type CaixaWidget,
} from "@/lib/atendimento/widget";

// Rota PÚBLICA: leitura e envio de mensagens do visitante anônimo.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Teto de caracteres por mensagem do visitante. */
const MAX_TEXTO = 2000;
/** Quantas mensagens o widget carrega de uma vez (histórico da visita). */
const LIMITE_HISTORICO = 100;

/** Mensagem como o VISITANTE pode vê-la — subconjunto proposital de `Message`. */
interface MensagemPublica {
  id: string;
  direcao: "in" | "out";
  remetente: string;
  tipo: string;
  conteudo: string | null;
  mediaUrl: string | null;
  criadaEm: string;
}

interface LinhaMensagem {
  id: string;
  direcao: "in" | "out";
  remetente: string;
  tipo: string;
  conteudo: string | null;
  media_url: string | null;
  created_at: string;
}

export async function OPTIONS(req: Request, { params }: { params: { token: string } }) {
  const caixa = await carregarCaixaPorToken(createSupabaseAdmin(), params.token);
  const { headers } = resolverCors(req, caixa?.widget_dominios);
  return respostaPreflight(caixa ? headers : corsAberto());
}

// =====================================================================
// GET — histórico da conversa daquela sessão
// =====================================================================

export async function GET(req: Request, { params }: { params: { token: string } }) {
  const admin = createSupabaseAdmin();
  const caixa = await carregarCaixaPorToken(admin, params.token);
  if (!caixa) return naoEncontrado();

  const { headers, permitido } = resolverCors(req, caixa.widget_dominios);
  if (!permitido) return jsonCors({ erro: "origem não autorizada" }, 403, headers);

  const url = new URL(req.url);
  const contactToken = sanitizarContactToken(url.searchParams.get("contactToken"));
  if (!contactToken) return jsonCors({ mensagens: [] }, 200, headers);

  // Polling a cada 5s: limitar aqui evita que uma aba esquecida aberta
  // martele o banco (ou que alguém use o endpoint como oráculo).
  if (excedeuLimite("hist:" + contactToken, 60)) {
    return jsonCors({ erro: "muitas requisições" }, 429, headers);
  }

  const conversationId = await conversaDaSessao(admin, caixa, contactToken);
  if (!conversationId) return jsonCors({ mensagens: [] }, 200, headers);

  let consulta = admin
    .from("messages")
    .select("id, direcao, remetente, tipo, conteudo, media_url, created_at")
    .eq("conversation_id", conversationId)
    // REGRA DE OURO: nota interna é conversa da equipe. Nunca sai daqui.
    .eq("interna", false)
    .order("created_at", { ascending: true })
    .limit(LIMITE_HISTORICO);

  const depois = url.searchParams.get("depois");
  if (depois && !Number.isNaN(Date.parse(depois))) {
    consulta = consulta.gt("created_at", new Date(depois).toISOString());
  }

  const { data } = await consulta;
  const mensagens: MensagemPublica[] = ((data ?? []) as LinhaMensagem[]).map(paraPublica);

  return jsonCors({ mensagens }, 200, headers);
}

// =====================================================================
// POST — o visitante manda uma mensagem
// =====================================================================

interface CorpoEnvio {
  contactToken?: unknown;
  texto?: unknown;
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const admin = createSupabaseAdmin();
  const caixa = await carregarCaixaPorToken(admin, params.token);
  if (!caixa) return naoEncontrado();

  const { headers, permitido } = resolverCors(req, caixa.widget_dominios);
  if (!permitido) return jsonCors({ erro: "origem não autorizada" }, 403, headers);

  let corpo: CorpoEnvio = {};
  try {
    corpo = (await req.json()) as CorpoEnvio;
  } catch {
    return jsonCors({ erro: "corpo inválido" }, 400, headers);
  }

  const contactToken = sanitizarContactToken(corpo.contactToken);
  if (!contactToken) return jsonCors({ erro: "sessão inválida" }, 400, headers);

  const texto = typeof corpo.texto === "string" ? corpo.texto.trim() : "";
  if (!texto) return jsonCors({ erro: "mensagem vazia" }, 400, headers);
  if (texto.length > MAX_TEXTO) {
    return jsonCors({ erro: `mensagem muito longa (máximo ${MAX_TEXTO} caracteres)` }, 413, headers);
  }

  // 20 mensagens por minuto por visitante: gente digitando nunca chega
  // perto disso; script de spam chega na primeira dezena de segundos.
  if (excedeuLimite("msg:" + contactToken, 20)) {
    return jsonCors({ erro: "muitas mensagens em pouco tempo" }, 429, headers);
  }

  const conversationId = await conversaDaSessao(admin, caixa, contactToken);
  // Sem conversa não há onde gravar — o widget precisa chamar /session antes.
  if (!conversationId) return jsonCors({ erro: "sessão inválida" }, 404, headers);

  // Primeira mensagem do cliente nesta conversa? Serve para as automações
  // de "conversa_criada" (boas-vindas, roteamento) rodarem uma vez só.
  const { count } = await admin
    .from("messages")
    .select("id", { count: "exact", head: true })
    .eq("conversation_id", conversationId)
    .eq("direcao", "in");
  const primeiraDoCliente = (count ?? 0) === 0;

  const { data: criada, error } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "in",
      remetente: "cliente",
      tipo: "texto",
      conteudo: texto,
      status: "recebida",
    })
    .select("id, direcao, remetente, tipo, conteudo, media_url, created_at")
    .single();

  if (error || !criada) return jsonCors({ erro: "falha ao enviar" }, 500, headers);
  const mensagem = paraPublica(criada as LinhaMensagem);

  // O trigger `trg_message_touch` (0025) já cuida de last_message_at,
  // last_message_preview e unread_count. Aqui reforçamos os dois primeiros
  // (idempotente) e tratamos o que ele NÃO faz: reabrir a conversa quando o
  // cliente volta a escrever depois de resolvida/adiada. `unread_count` fica
  // de fora de propósito — somar aqui contaria a mesma mensagem duas vezes.
  await admin
    .from("conversations")
    .update({
      last_message_at: mensagem.criadaEm,
      last_message_preview: texto.slice(0, 140),
      status: "aberta",
      snoozed_until: null,
    })
    .eq("id", conversationId)
    .in("status", ["resolvida", "adiada"]);

  await admin
    .from("atendimento_widget_sessions")
    .update({ ultima_atividade: new Date().toISOString() })
    .eq("contact_token", contactToken);

  // Mesmas regras de automação dos outros canais — o chat do site não é
  // cidadão de segunda classe. `dispararAutomacoes` nunca lança.
  await dispararAutomacoes(admin, conversationId, {
    conversaNova: primeiraDoCliente,
    conteudo: texto,
    direcao: "in",
    interna: false,
  });

  return jsonCors({ ok: true, mensagem }, 201, headers);
}

// =====================================================================
// Auxiliares
// =====================================================================

function sanitizarContactToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^[a-f0-9]{16,96}$/i.test(t) ? t : null;
}

function paraPublica(m: LinhaMensagem): MensagemPublica {
  return {
    id: m.id,
    direcao: m.direcao,
    remetente: m.remetente,
    tipo: m.tipo,
    conteudo: m.conteudo,
    mediaUrl: m.media_url,
    criadaEm: m.created_at,
  };
}

/**
 * Resolve a conversa a partir do contact_token, SEMPRE amarrado ao
 * `inbox_id` da caixa do token público. É esta dupla que garante que um
 * visitante não leia a conversa de outro (nem de outra caixa).
 */
async function conversaDaSessao(
  admin: SupabaseClient,
  caixa: CaixaWidget,
  contactToken: string,
): Promise<string | null> {
  const { data } = await admin
    .from("atendimento_widget_sessions")
    .select("conversation_id")
    .eq("contact_token", contactToken)
    .eq("inbox_id", caixa.id)
    .maybeSingle();

  return (data as { conversation_id: string | null } | null)?.conversation_id ?? null;
}
