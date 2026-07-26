import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { dispararAutomacoes } from "@/lib/atendimento/triggers";
import { autoResposta, triagemAutomatica } from "@/lib/atendimento/ia-triagem";
import { emitirMensagemCriada } from "@/lib/atendimento/webhook-eventos";
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

  // CONTATO BLOQUEADO — descarte silencioso, ANTES de gravar.
  // O visitante recebe 200 (nada de erro na tela: quem foi bloqueado não
  // precisa saber que foi), mas a mensagem não entra na caixa. Sem o
  // `mensagem` na resposta o widget simplesmente não ecoa o balão — o
  // script trata o campo como opcional.
  if (await contatoBloqueado(admin, conversationId)) {
    return jsonCors({ ok: true }, 200, headers);
  }

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

  // Webhook `mensagem_criada` do chat do site. Precisamos reler a conversa
  // porque aqui só temos o id — e o payload tem que trazer o contato para
  // ser útil de verdade a quem consome. É uma leitura barata e por índice.
  // Nunca sai daqui o `contact_token`: ele é a credencial da sessão do
  // visitante, quem o tiver lê a conversa inteira pelo endpoint público.
  const { data: convWebhook } = await admin
    .from("conversations")
    .select("id, canal, status, contato_nome, contato_telefone, lead_id")
    .eq("id", conversationId)
    .maybeSingle();

  emitirMensagemCriada(
    admin,
    {
      id: conversationId,
      canal: (convWebhook?.canal as string | null) ?? "site",
      status: (convWebhook?.status as string | null) ?? "aberta",
      contato_nome: (convWebhook?.contato_nome as string | null) ?? null,
      contato_telefone: (convWebhook?.contato_telefone as string | null) ?? null,
      lead_id: (convWebhook?.lead_id as string | null) ?? null,
    },
    {
      id: mensagem.id,
      direcao: "in",
      remetente: "cliente",
      tipo: "texto",
      texto,
      criada_em: mensagem.criadaEm,
    },
  );

  // Mesmas regras de automação dos outros canais — o chat do site não é
  // cidadão de segunda classe. `dispararAutomacoes` nunca lança.
  await dispararAutomacoes(admin, conversationId, {
    conversaNova: primeiraDoCliente,
    conteudo: texto,
    direcao: "in",
    interna: false,
  });

  // IA — mesma ordem do webhook do Telegram: triagem antes, auto-resposta
  // depois. A auto-resposta do chat do site chega ao visitante pelo próprio
  // polling do widget (a mensagem gravada JÁ é a entrega), então ela aparece
  // no painel alguns segundos depois — não vai no corpo desta resposta.
  await triagemAutomatica(admin, conversationId, { conversaNova: primeiraDoCliente });
  await autoResposta(admin, conversationId);

  return jsonCors({ ok: true, mensagem }, 201, headers);
}

/**
 * O contato dono desta conversa está bloqueado?
 * Conversa sem lead vinculado (visitante que nunca virou contato) nunca
 * está bloqueada — não há o que bloquear.
 */
async function contatoBloqueado(admin: SupabaseClient, conversationId: string): Promise<boolean> {
  const { data: conv } = await admin
    .from("conversations")
    .select("lead_id")
    .eq("id", conversationId)
    .maybeSingle();
  const leadId = (conv as { lead_id: string | null } | null)?.lead_id;
  if (!leadId) return false;

  const { data: lead } = await admin
    .from("leads")
    .select("bloqueado")
    .eq("id", leadId)
    .maybeSingle();
  return Boolean((lead as { bloqueado: boolean } | null)?.bloqueado);
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
