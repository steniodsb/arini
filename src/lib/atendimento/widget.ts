import type { SupabaseClient } from "@supabase/supabase-js";
import type { PreChatField } from "@/lib/types";

// =====================================================================
// Suporte às rotas PÚBLICAS do widget de site (/api/widget/[token]/*).
//
// Este é o ponto mais exposto do sistema: qualquer pessoa na internet
// alcança estas rotas, sem sessão do Supabase. Por isso tudo aqui é
// defensivo:
//   · o token da caixa é o ÚNICO segredo em jogo e ele é público — nada
//     que dependa dele pode devolver dado de outra conversa;
//   · o `widget_secret` NUNCA sai daqui (nem é selecionado do banco);
//   · token inválido responde 404 genérico, sem dizer se a caixa existe
//     (evita varredura de tokens por diferença de resposta);
//   · CORS é restrito aos domínios cadastrados na caixa.
// =====================================================================

/** Fuso da operação. Fixo em UTC-3 para não depender do TZ do container. */
const TZ_OFFSET_MIN = -180;

/**
 * Colunas da caixa que as rotas públicas podem ler. É uma lista explícita
 * de propósito: um `select("*")` aqui vazaria `widget_secret`.
 */
export const COLUNAS_CAIXA_WIDGET =
  "id, nome, canal, channel_id, ativo, widget_token, widget_titulo, widget_saudacao, " +
  "widget_cor, widget_posicao, widget_dominios, pre_chat_ativo, pre_chat_campos, " +
  "saudacao_ativa, saudacao_texto, mensagem_ausencia, horario_comercial_ativo";

/** Caixa de entrada como as rotas públicas a enxergam (sem o segredo). */
export interface CaixaWidget {
  id: string;
  nome: string;
  canal: string;
  channel_id: string | null;
  ativo: boolean;
  widget_token: string | null;
  widget_titulo: string | null;
  widget_saudacao: string | null;
  widget_cor: string | null;
  widget_posicao: "direita" | "esquerda";
  widget_dominios: string[];
  pre_chat_ativo: boolean;
  pre_chat_campos: PreChatField[];
  saudacao_ativa: boolean;
  saudacao_texto: string | null;
  mensagem_ausencia: string | null;
  horario_comercial_ativo: boolean;
}

/**
 * Busca a caixa pelo token público. Devolve `null` quando o token não
 * existe, está vazio, não é de uma caixa de site ou a caixa está inativa —
 * o chamador transforma qualquer um desses casos no MESMO 404.
 */
export async function carregarCaixaPorToken(
  admin: SupabaseClient,
  token: string | undefined,
): Promise<CaixaWidget | null> {
  // Formato do token é conhecido (hex de 32 chars). Filtrar antes evita
  // bater no banco com lixo e limita o custo de um ataque de força bruta.
  if (!token || !/^[a-f0-9]{16,64}$/i.test(token)) return null;

  const { data } = await admin
    .from("atendimento_inboxes")
    .select(COLUNAS_CAIXA_WIDGET)
    .eq("widget_token", token)
    .maybeSingle();

  if (!data) return null;
  const caixa = data as unknown as CaixaWidget;
  if (caixa.canal !== "site" || !caixa.ativo) return null;
  return caixa;
}

// =====================================================================
// CORS
// =====================================================================

export interface ResultadoCors {
  /** Cabeçalhos a devolver em TODA resposta (inclusive erro e preflight). */
  headers: Record<string, string>;
  /** A origem que chamou está liberada? `false` → responder 403. */
  permitido: boolean;
}

/**
 * Normaliza "https://Loja.com.br/contato" → "loja.com.br".
 * Aceita o domínio escrito com ou sem protocolo, com ou sem caminho.
 */
function normalizarDominio(entrada: string): string {
  const limpo = entrada.trim().toLowerCase();
  if (!limpo) return "";
  const semProtocolo = limpo.replace(/^[a-z]+:\/\//, "");
  return semProtocolo.split("/")[0].replace(/\/+$/, "");
}

/** O host da origem casa com o domínio cadastrado (com suporte a `*.dominio`)? */
function casaDominio(host: string, padrao: string): boolean {
  if (!padrao) return false;
  if (padrao.startsWith("*.")) {
    const raiz = padrao.slice(2);
    return host === raiz || host.endsWith("." + raiz);
  }
  // Comparação com e sem porta: localhost:3000 casa com "localhost".
  return host === padrao || host.split(":")[0] === padrao.split(":")[0];
}

/**
 * Monta os cabeçalhos de CORS a partir dos domínios liberados da caixa.
 *
 * · lista vazia   → `*` (o cliente ainda não restringiu; libera geral);
 * · lista cheia   → só ecoa a origem quando ela está na lista;
 * · sem `Origin`  → não é requisição de navegador cross-site (curl, mesma
 *   origem); libera sem cabeçalho, porque não há nada a autorizar.
 */
export function resolverCors(req: Request, dominios: string[] | null | undefined): ResultadoCors {
  const base: Record<string, string> = {
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    // Sem isto, um proxy poderia servir a mesma resposta (com o
    // Allow-Origin de outro site) para todo mundo.
    Vary: "Origin",
  };

  const origem = req.headers.get("origin");
  const lista = (dominios ?? []).map(normalizarDominio).filter(Boolean);

  if (lista.length === 0) {
    return { headers: { ...base, "Access-Control-Allow-Origin": "*" }, permitido: true };
  }
  if (!origem) {
    return { headers: base, permitido: true };
  }

  let host = "";
  try {
    host = new URL(origem).host.toLowerCase();
  } catch {
    return { headers: base, permitido: false };
  }

  const liberado = lista.some((d) => casaDominio(host, d));
  return {
    headers: liberado ? { ...base, "Access-Control-Allow-Origin": origem } : base,
    permitido: liberado,
  };
}

/** CORS aberto — usado nas respostas de erro, onde não há caixa conhecida. */
export function corsAberto(): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** Resposta JSON com os cabeçalhos de CORS e sem cache. */
export function jsonCors(
  corpo: unknown,
  status: number,
  headers: Record<string, string>,
): Response {
  return new Response(JSON.stringify(corpo), {
    status,
    headers: {
      ...headers,
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

/**
 * 404 genérico. Mesma mensagem para "token não existe", "caixa desativada"
 * e "não é caixa de site" — quem sonda não descobre nada pela resposta.
 */
export function naoEncontrado(headers: Record<string, string> = corsAberto()): Response {
  return jsonCors({ erro: "não encontrado" }, 404, headers);
}

/** Resposta padrão do preflight (OPTIONS). */
export function respostaPreflight(headers: Record<string, string>): Response {
  return new Response(null, { status: 204, headers });
}

// =====================================================================
// Horário comercial
// =====================================================================

interface LinhaHorario {
  dia_semana: number;
  aberto: boolean;
  abre: string | null;
  fecha: string | null;
}

function minutos(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m ?? 0);
}

/**
 * A caixa está dentro do expediente AGORA?
 * Quando a caixa não respeita horário comercial (ou não tem expediente
 * cadastrado) o widget se comporta como sempre aberto — é melhor deixar o
 * visitante escrever do que barrar por configuração faltando.
 */
export async function dentroDoHorarioDaCaixa(
  admin: SupabaseClient,
  caixa: Pick<CaixaWidget, "id" | "horario_comercial_ativo">,
): Promise<boolean> {
  if (!caixa.horario_comercial_ativo) return true;

  const { data } = await admin
    .from("atendimento_business_hours")
    .select("dia_semana, aberto, abre, fecha")
    .eq("inbox_id", caixa.id);

  const linhas = (data ?? []) as LinhaHorario[];
  if (linhas.length === 0) return true;

  // "Agora" no fuso da operação (America/Sao_Paulo = UTC-3), sem depender
  // do TZ do servidor: desloca o instante e lê os campos em UTC.
  const agora = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
  const hoje = linhas.find((l) => l.dia_semana === agora.getUTCDay());
  if (!hoje || !hoje.aberto || !hoje.abre || !hoje.fecha) return false;

  const agoraMin = agora.getUTCHours() * 60 + agora.getUTCMinutes();
  return agoraMin >= minutos(hoje.abre) && agoraMin < minutos(hoje.fecha);
}

// =====================================================================
// Rate limit em memória
// =====================================================================

/**
 * Contador por chave em memória do processo. Não é distribuído (num deploy
 * com várias instâncias cada uma tem o seu balde), mas resolve o caso real:
 * impedir que um único visitante despeje centenas de mensagens no inbox.
 */
const baldes = new Map<string, number[]>();

export function excedeuLimite(chave: string, maximo = 20, janelaMs = 60_000): boolean {
  const agora = Date.now();
  const marcas = (baldes.get(chave) ?? []).filter((t) => agora - t < janelaMs);

  if (marcas.length >= maximo) {
    baldes.set(chave, marcas);
    return true;
  }

  marcas.push(agora);
  baldes.set(chave, marcas);

  // Faxina preguiçosa: sem isso o Map cresce para sempre com visitantes que
  // passaram uma vez e nunca mais voltaram.
  if (baldes.size > 5_000) {
    const expirados: string[] = [];
    // forEach (e não for..of) porque o alvo do tsconfig não liga
    // downlevelIteration para iterar Map diretamente.
    baldes.forEach((marcasDaChave, chave) => {
      if (marcasDaChave.every((t: number) => agora - t >= janelaMs)) expirados.push(chave);
    });
    expirados.forEach((k) => baldes.delete(k));
  }
  return false;
}

// =====================================================================
// Diversos
// =====================================================================

/** Título/saudação efetivos: o campo do widget manda; a caixa é o fallback. */
export function tituloEfetivo(caixa: CaixaWidget): string {
  return caixa.widget_titulo?.trim() || caixa.nome || "Fale com a gente";
}

export function saudacaoEfetiva(caixa: CaixaWidget): string {
  return (caixa.widget_saudacao?.trim() || caixa.saudacao_texto?.trim() || "");
}

/**
 * Extrai nome/e-mail/telefone das respostas do pré-chat.
 * Usa a `chave` do campo quando ela é uma das conhecidas e, como plano B,
 * o `tipo` do campo — o cliente pode ter nomeado a chave de outro jeito.
 */
export function extrairContatoDoPreChat(
  campos: PreChatField[],
  respostas: Record<string, string>,
): { nome: string | null; email: string | null; telefone: string | null } {
  const out = { nome: null as string | null, email: null as string | null, telefone: null as string | null };

  for (const campo of campos ?? []) {
    const valor = (respostas?.[campo.chave] ?? "").trim();
    if (!valor) continue;
    const chave = campo.chave.toLowerCase();

    if (!out.nome && (chave === "nome" || chave === "name")) out.nome = valor;
    else if (!out.email && (chave === "email" || chave === "e-mail" || campo.tipo === "email")) out.email = valor;
    else if (!out.telefone && (chave === "telefone" || chave === "whatsapp" || chave === "celular" || campo.tipo === "telefone")) out.telefone = valor;
  }
  return out;
}

/** Só dígitos — é assim que o telefone é comparado no dedupe de leads. */
export function apenasDigitos(v: string | null): string | null {
  if (!v) return null;
  const d = v.replace(/\D+/g, "");
  return d.length >= 8 ? d : null;
}
