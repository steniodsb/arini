import { randomBytes } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  apenasDigitos,
  carregarCaixaPorToken,
  corsAberto,
  excedeuLimite,
  extrairContatoDoPreChat,
  jsonCors,
  naoEncontrado,
  resolverCors,
  respostaPreflight,
  saudacaoEfetiva,
} from "@/lib/atendimento/widget";

// Rota PÚBLICA. Cria/reconecta a sessão anônima do visitante do site.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Tamanho máximo aceito em qualquer campo do pré-chat (anti-lixo). */
const MAX_CAMPO = 300;

interface CorpoSessao {
  contactToken?: unknown;
  preChat?: unknown;
  referrer?: unknown;
}

interface LinhaSessao {
  id: string;
  contact_token: string;
  conversation_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
}

export async function OPTIONS(req: Request, { params }: { params: { token: string } }) {
  const caixa = await carregarCaixaPorToken(createSupabaseAdmin(), params.token);
  const { headers } = resolverCors(req, caixa?.widget_dominios);
  return respostaPreflight(caixa ? headers : corsAberto());
}

export async function POST(req: Request, { params }: { params: { token: string } }) {
  const admin = createSupabaseAdmin();
  const caixa = await carregarCaixaPorToken(admin, params.token);
  if (!caixa) return naoEncontrado();

  const { headers, permitido } = resolverCors(req, caixa.widget_dominios);
  if (!permitido) return jsonCors({ erro: "origem não autorizada" }, 403, headers);

  let corpo: CorpoSessao = {};
  try {
    corpo = (await req.json()) as CorpoSessao;
  } catch {
    corpo = {};
  }

  const tokenRecebido = sanitizarContactToken(corpo.contactToken);
  const preChat = sanitizarPreChat(corpo.preChat);

  // Rate limit também aqui: sem isso, um script poderia criar milhares de
  // sessões (e conversas) só chamando este endpoint em laço.
  const chaveLimite = "sessao:" + (tokenRecebido ?? caixa.id + ":novo");
  if (excedeuLimite(chaveLimite, 30)) {
    return jsonCors({ erro: "muitas requisições" }, 429, headers);
  }

  // 1) Acha a sessão existente. O `inbox_id` no filtro impede usar um
  //    contact_token de outra caixa para espiar a conversa de lá.
  let sessao: LinhaSessao | null = null;
  if (tokenRecebido) {
    const { data } = await admin
      .from("atendimento_widget_sessions")
      .select("id, contact_token, conversation_id, nome, email, telefone")
      .eq("contact_token", tokenRecebido)
      .eq("inbox_id", caixa.id)
      .maybeSingle();
    sessao = (data as LinhaSessao | null) ?? null;
  }

  const contactToken = sessao?.contact_token ?? randomBytes(24).toString("hex");
  const contato = extrairContatoDoPreChat(caixa.pre_chat_campos ?? [], preChat);

  // 2) Cria a sessão quando ainda não existe.
  if (!sessao) {
    const { data, error } = await admin
      .from("atendimento_widget_sessions")
      .insert({
        inbox_id: caixa.id,
        contact_token: contactToken,
        nome: contato.nome,
        email: contato.email,
        telefone: contato.telefone,
        pre_chat: preChat,
        user_agent: (req.headers.get("user-agent") ?? "").slice(0, 500),
        referrer: sanitizarTexto(corpo.referrer, 500) ?? req.headers.get("referer"),
      })
      .select("id, contact_token, conversation_id, nome, email, telefone")
      .single();

    if (error || !data) return jsonCors({ erro: "falha ao abrir sessão" }, 500, headers);
    sessao = data as LinhaSessao;
  }

  // 3) A conversa ainda vale? A sessão guarda o id, mas a conversa pode ter
  //    sido apagada (o FK é `on delete set null`, então relemos para ter
  //    certeza antes de reaproveitar).
  let conversationId = sessao.conversation_id;
  if (conversationId) {
    const { data: conv } = await admin
      .from("conversations")
      .select("id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) conversationId = null;
  }

  // Rede de segurança: existe índice único em (canal, external_id). Se a
  // sessão perdeu o vínculo mas a conversa continua lá, reaproveitamos em vez
  // de tomar erro de chave duplicada na inserção.
  if (!conversationId) {
    const { data: orfa } = await admin
      .from("conversations")
      .select("id")
      .eq("canal", "site")
      .eq("external_id", contactToken)
      .maybeSingle();
    conversationId = (orfa as { id: string } | null)?.id ?? null;
  }

  let conversaNova = false;
  if (!conversationId) {
    // Lead só é criado quando há algum dado de contato de verdade — caixa
    // sem pré-chat não deve encher o CRM de "Visitante do site" vazio.
    const leadId = await acharOuCriarLead(admin, contato);

    const { data: nova, error: erroConv } = await admin
      .from("conversations")
      .insert({
        canal: "site",
        inbox_id: caixa.id,
        channel_id: caixa.channel_id,
        // O contact_token é o identificador do "contato" neste canal, e é
        // único — casa com o índice único (canal, external_id).
        external_id: contactToken,
        lead_id: leadId,
        contato_nome: contato.nome ?? sessao.nome,
        contato_telefone: contato.telefone ?? sessao.telefone,
        status: "aberta",
      })
      .select("id")
      .single();

    if (erroConv || !nova) return jsonCors({ erro: "falha ao abrir conversa" }, 500, headers);
    conversationId = (nova as { id: string }).id;
    conversaNova = true;
  }

  // 4) Saudação automática: entra como mensagem do SISTEMA (não é o
  //    atendente falando) e só uma vez, na criação da conversa.
  if (conversaNova && caixa.saudacao_ativa) {
    const saudacao = saudacaoEfetiva(caixa);
    if (saudacao) {
      await admin.from("messages").insert({
        conversation_id: conversationId,
        direcao: "out",
        remetente: "sistema",
        tipo: "texto",
        conteudo: saudacao,
        status: "enviada",
      });
    }
  }

  // 5) Atualiza a sessão com o que aprendemos nesta chamada.
  await admin
    .from("atendimento_widget_sessions")
    .update({
      conversation_id: conversationId,
      nome: contato.nome ?? sessao.nome,
      email: contato.email ?? sessao.email,
      telefone: contato.telefone ?? sessao.telefone,
      ...(Object.keys(preChat).length > 0 ? { pre_chat: preChat } : {}),
      ultima_atividade: new Date().toISOString(),
    })
    .eq("id", sessao.id);

  return jsonCors({ contactToken, conversationId }, 200, headers);
}

// =====================================================================
// Auxiliares
// =====================================================================

/** Aceita só o formato que nós mesmos geramos (hex). Corta injeção no filtro. */
function sanitizarContactToken(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return /^[a-f0-9]{16,96}$/i.test(t) ? t : null;
}

function sanitizarTexto(v: unknown, max: number): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().slice(0, max);
  return t || null;
}

/** Só aceita objeto plano de string→string, com valores curtos. */
function sanitizarPreChat(v: unknown): Record<string, string> {
  if (!v || typeof v !== "object" || Array.isArray(v)) return {};
  const out: Record<string, string> = {};
  for (const [k, valor] of Object.entries(v as Record<string, unknown>)) {
    if (typeof valor !== "string") continue;
    const limpo = valor.trim().slice(0, MAX_CAMPO);
    if (limpo) out[k.slice(0, 60)] = limpo;
  }
  return out;
}

/**
 * Dedupe do lead por telefone (só dígitos) e depois por e-mail. Sem nenhum
 * dos dois, não cria lead — a conversa fica sem `lead_id` até o visitante
 * se identificar, e o atendente vincula na mão pelo painel de contato.
 */
async function acharOuCriarLead(
  admin: SupabaseClient,
  contato: { nome: string | null; email: string | null; telefone: string | null },
): Promise<string | null> {
  const telefone = apenasDigitos(contato.telefone);
  const email = contato.email?.toLowerCase() ?? null;
  if (!telefone && !email) return null;

  if (telefone) {
    const { data } = await admin
      .from("leads")
      .select("id, nome")
      .or(`whatsapp.eq.${telefone},telefone.eq.${telefone}`)
      .limit(1)
      .maybeSingle();
    if (data) return await tocarLead(admin, data as { id: string; nome: string | null }, contato);
  }

  if (email) {
    const { data } = await admin
      .from("leads")
      .select("id, nome")
      .eq("email", email)
      .limit(1)
      .maybeSingle();
    if (data) return await tocarLead(admin, data as { id: string; nome: string | null }, contato);
  }

  const { data: novo } = await admin
    .from("leads")
    .insert({
      nome: contato.nome || "Visitante do site",
      telefone,
      whatsapp: telefone,
      email,
      origem: "site",
      stage: "novo",
      mensagem: "Contato iniciado pelo chat do site.",
    })
    .select("id")
    .single();

  return (novo as { id: string } | null)?.id ?? null;
}

/** Marca o lead como vivo e completa o nome se ele estava genérico/vazio. */
async function tocarLead(
  admin: SupabaseClient,
  lead: { id: string; nome: string | null },
  contato: { nome: string | null },
): Promise<string> {
  const patch: Record<string, unknown> = { ultima_interacao_em: new Date().toISOString() };
  if (contato.nome && (!lead.nome || /^(lead|contato|visitante)/i.test(lead.nome))) {
    patch.nome = contato.nome;
  }
  await admin.from("leads").update(patch).eq("id", lead.id);
  return lead.id;
}
