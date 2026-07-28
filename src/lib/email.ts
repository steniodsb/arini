import crypto from "crypto";

// =====================================================================
// Cliente de e-mail do Atendimento — via API HTTP da Resend.
//
// POR QUE NÃO SMTP: SMTP exige uma biblioteca com socket (nodemailer) e
// IMAP exige outra (imapflow) só para LER a caixa. Nada disso roda bem em
// runtime serverless, e o projeto não instala dependência nova. A Resend
// é REST puro: POST para enviar, webhook para receber. Um `fetch` resolve
// os dois lados, no mesmo desenho de src/lib/telegram.ts (call central,
// erro tratado, timeout com AbortSignal).
//
// ---------------------------------------------------------------------
// O DETALHE QUE FAZ O CANAL DE E-MAIL FUNCIONAR DE VERDADE: THREADING
// ---------------------------------------------------------------------
// WhatsApp e Telegram entregam um id de contato estável (o número, o
// chat_id). E-mail não: a mesma pessoa pode escrever de outro endereço, e
// o mesmo endereço pode abrir dez assuntos diferentes. Se casarmos a
// resposta só pelo remetente, dois atendimentos distintos viram uma
// conversa só.
//
// A solução é a que o próprio protocolo já oferece (RFC 5322): TODO
// e-mail tem um `Message-ID` único, e o cliente de e-mail do cliente
// devolve esse valor em `In-Reply-To` / `References` quando ele aperta
// "Responder". Então nós GERAMOS o Message-ID de saída embutindo o id da
// conversa:
//
//     <c.5f3a...-uuid.k7d92m@dominio-remetente>
//      ^^ ^^^^^^^^^^^^^^^^^^
//      |  id da conversa (uuid)
//      prefixo que marca "esta thread é do atendimento"
//
// Quando a resposta chega no webhook, extraímos o uuid de volta do
// In-Reply-To/References e caímos exatamente na conversa certa — mesmo
// que o cliente troque o assunto ou escreva de outro endereço.
//
// Ressalva honesta: nem todo provedor respeita um Message-ID escolhido
// pelo remetente (alguns sobrescrevem). Por isso também mandamos o
// cabeçalho próprio `X-Arini-Conversa` e, no webhook, existe o fallback
// de casar pelo endereço de e-mail. O threading por Message-ID é o
// caminho bom; o endereço é a rede de segurança.
// =====================================================================

const RESEND_ENDPOINT = "https://api.resend.com/emails";

/** Timeout: a rota do Next não pode ficar pendurada esperando o provedor. */
const TIMEOUT_MS = 15_000;

/** Prefixo do Message-ID que marca a thread como sendo do atendimento. */
const PREFIXO_THREAD = "c.";

/** Cabeçalho próprio com o id da conversa — plano B do threading. */
export const HEADER_CONVERSA = "X-Arini-Conversa";

export type EnviarEmailArgs = {
  /** Chave de API da Resend (fica em atendimento_channels.config.api_key). */
  apiKey: string;
  /** Remetente. Aceita "Nome <caixa@dominio>" ou só "caixa@dominio". */
  de: string;
  para: string | string[];
  assunto: string;
  html?: string | null;
  texto?: string | null;
  replyTo?: string | null;
  /** Cabeçalhos extras (Message-ID, In-Reply-To, References...). */
  headers?: Record<string, string>;
};

export type EnvioEmailResultado =
  | { ok: true; id: string | null; messageId: string | null }
  | { ok: false; erro: string };

/** Corpo aceito pela Resend. Explícito para não cair em `any`. */
type CorpoResend = {
  from: string;
  to: string[];
  subject: string;
  html?: string;
  text?: string;
  reply_to?: string;
  headers?: Record<string, string>;
};

type RespostaResend = {
  id?: string;
  message?: string;
  name?: string;
  error?: { message?: string };
};

/** "Arini <oi@arini.com.br>" → "oi@arini.com.br". Tolera espaços e <>. */
export function extrairEndereco(bruto: string | null | undefined): string {
  if (!bruto) return "";
  const comAngulo = bruto.match(/<([^>]+)>/);
  const cru = (comAngulo ? comAngulo[1] : bruto).trim();
  return cru.toLowerCase();
}

/** "Arini <oi@arini.com.br>" → "Arini". Sem nome, devolve null. */
export function extrairNome(bruto: string | null | undefined): string | null {
  if (!bruto) return null;
  const m = bruto.match(/^\s*"?([^"<]+?)"?\s*</);
  const nome = m?.[1]?.trim();
  return nome ? nome : null;
}

/** Domínio do remetente — o Message-ID precisa combinar com quem envia. */
function dominioDe(remetente: string): string {
  const endereco = extrairEndereco(remetente);
  const dominio = endereco.split("@")[1];
  return dominio || "atendimento.local";
}

/**
 * Monta o Message-ID de saída com o id da conversa embutido.
 * O sufixo aleatório é obrigatório: o Message-ID precisa ser único por
 * mensagem, senão o cliente de e-mail agrupa (ou descarta) como duplicata.
 */
export function gerarMessageId(conversationId: string, remetente: string): string {
  const unico = crypto.randomBytes(6).toString("hex");
  return `<${PREFIXO_THREAD}${conversationId}.${unico}@${dominioDe(remetente)}>`;
}

/**
 * Caminho inverso: procura o id da conversa dentro de In-Reply-To /
 * References / qualquer cabeçalho que tenhamos em mãos.
 *
 * `References` costuma trazer a thread inteira; pegamos a ÚLTIMA
 * ocorrência porque é a mensagem mais recente da cadeia (e, na prática,
 * todas apontam para a mesma conversa).
 */
export function extrairConversaDeReferencias(
  ...valores: (string | null | undefined)[]
): string | null {
  const padrao = new RegExp(
    `${PREFIXO_THREAD.replace(".", "\\.")}([0-9a-fA-F-]{36})\\.`,
    "g",
  );
  let achado: string | null = null;
  for (const valor of valores) {
    if (!valor) continue;
    for (const m of valor.matchAll(padrao)) achado = m[1].toLowerCase();
  }
  return achado;
}

/**
 * Converte HTML de e-mail em texto legível — de forma simples e sem
 * dependência. Não é um parser de HTML: é o suficiente para o inbox
 * mostrar o que a pessoa escreveu em vez de uma sopa de tags.
 */
export function htmlParaTexto(html: string): string {
  return html
    // Fora o que nunca é conteúdo visível.
    .replace(/<(script|style|head)[\s\S]*?<\/\1>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    // Quebras de linha estruturais viram \n antes de as tags sumirem.
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|tr|li|h[1-6]|blockquote)>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    // Entidades mais comuns em e-mail.
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, n: string) => String.fromCharCode(Number(n)))
    // Espaços e linhas em branco em excesso.
    .replace(/[ \t ]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .split("\n")
    .map((l) => l.trim())
    .join("\n")
    .trim();
}

/** Escapa e quebra linhas — o corpo digitado pelo agente é texto puro. */
export function textoParaHtml(texto: string): string {
  const escapado = texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
  return escapado
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 12px">${p.replace(/\n/g, "<br>")}</p>`)
    .join("");
}

/**
 * Remove a citação da mensagem anterior ("Em 12/03, Fulano escreveu:",
 * linhas com ">"). Sem isso, cada resposta do cliente chega no inbox com
 * todo o histórico repetido e o preview da conversa vira lixo.
 */
export function removerCitacao(texto: string): string {
  const linhas = texto.split("\n");
  const corte = linhas.findIndex((l) =>
    /^\s*>/.test(l) ||
    /^\s*-{2,}\s*(mensagem original|original message|forwarded message)/i.test(l) ||
    /^\s*(em|on)\s.+(escreveu|wrote)\s*:\s*$/i.test(l) ||
    /^\s*De:\s.+@/i.test(l),
  );
  const util = corte > 0 ? linhas.slice(0, corte) : linhas;
  return util.join("\n").trim() || texto.trim();
}

/** "Re: <assunto>" sem empilhar "Re: Re: Re:" a cada volta. */
export function assuntoDeResposta(original: string | null | undefined, padrao: string): string {
  const limpo = (original ?? "").trim();
  if (!limpo) return padrao;
  return /^re\s*:/i.test(limpo) ? limpo : `Re: ${limpo}`;
}

/**
 * Envia um e-mail pela API da Resend. NUNCA lança: devolve
 * `{ ok:false, erro }` para a mensagem ficar gravada com status "falha" e
 * o atendente ver o motivo, igual ao resto do despacho de saída.
 */
export async function enviarEmail(args: EnviarEmailArgs): Promise<EnvioEmailResultado> {
  const { apiKey, de, para, assunto, html, texto, replyTo, headers } = args;

  if (!apiKey) return { ok: false, erro: "canal de e-mail sem api_key da Resend" };
  if (!de) return { ok: false, erro: "canal de e-mail sem remetente configurado" };

  const destinatarios = (Array.isArray(para) ? para : [para])
    .map((p) => extrairEndereco(p))
    .filter(Boolean);
  if (destinatarios.length === 0) return { ok: false, erro: "destinatário de e-mail inválido" };

  // A Resend exige html OU text. Quando só temos texto, geramos o HTML —
  // e-mail só-texto cai em spam com muito mais facilidade.
  const corpoTexto = texto?.trim() || null;
  const corpoHtml = html?.trim() || (corpoTexto ? textoParaHtml(corpoTexto) : null);
  if (!corpoHtml && !corpoTexto) return { ok: false, erro: "e-mail sem corpo" };

  const corpo: CorpoResend = {
    from: de,
    to: destinatarios,
    subject: assunto || "(sem assunto)",
  };
  if (corpoHtml) corpo.html = corpoHtml;
  if (corpoTexto) corpo.text = corpoTexto;
  if (replyTo) corpo.reply_to = replyTo;
  if (headers && Object.keys(headers).length > 0) corpo.headers = headers;

  let res: Response;
  try {
    res = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const motivo =
      e instanceof Error && e.name === "TimeoutError"
        ? "o provedor de e-mail não respondeu a tempo"
        : "não foi possível alcançar o provedor de e-mail";
    return { ok: false, erro: motivo };
  }

  const json = (await res.json().catch(() => null)) as RespostaResend | null;

  if (!res.ok) {
    // A Resend devolve { name, message } no erro; 401/403 = chave ruim,
    // 403 também aparece quando o domínio não foi verificado lá.
    const msg = json?.message || json?.error?.message || `provedor respondeu HTTP ${res.status}`;
    return { ok: false, erro: msg };
  }

  return {
    ok: true,
    id: json?.id ?? null,
    // Devolvemos o Message-ID que PEDIMOS (o provedor não ecoa o dele):
    // é o valor que o webhook vai procurar no In-Reply-To da resposta.
    messageId: headers?.["Message-ID"] ?? null,
  };
}
