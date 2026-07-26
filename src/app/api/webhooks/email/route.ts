import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  autenticarCanalWebhook,
  registrarMensagemEntrada,
} from "@/lib/atendimento/inbound";
import {
  HEADER_CONVERSA,
  extrairConversaDeReferencias,
  extrairEndereco,
  extrairNome,
  htmlParaTexto,
  removerCitacao,
} from "@/lib/email";

// =====================================================================
// Webhook de E-MAIL DE ENTRADA (formato inbound da Resend).
//
// Mesma forma dos outros webhooks do atendimento: acha o canal → valida o
// segredo em tempo constante → resolve a thread → acha-ou-cria a conversa
// e o lead → grava a mensagem → denormaliza o inbox → dispara automações.
//
// ---------------------------------------------------------------------
// FORMATO ESPERADO (Resend inbound — POST application/json)
// ---------------------------------------------------------------------
// {
//   "type": "email.received",
//   "created_at": "2026-07-26T12:00:00.000Z",
//   "data": {
//     "email_id":  "4ef9a417-...",           // id da mensagem no provedor
//     "from":      "Fulano <fulano@empresa.com>",
//     "to":        ["atendimento@arini.com.br"],
//     "subject":   "Re: Proposta do apartamento 302",
//     "text":      "corpo em texto puro (pode faltar)",
//     "html":      "<p>corpo em HTML</p>",
//     "headers": [                            // lista nome/valor
//       { "name": "Message-ID",  "value": "<abc@mail.empresa.com>" },
//       { "name": "In-Reply-To", "value": "<c.<uuid>.a1b2c3@arini.com.br>" },
//       { "name": "References",  "value": "<...> <...>" }
//     ],
//     "attachments": [{ "filename": "...", "content_type": "...", "url": "..." }]
//   }
// }
//
// Somos tolerantes de propósito: aceitamos os mesmos campos no nível raiz
// (sem o envelope `data`) e `headers` como objeto em vez de lista, porque
// outros serviços de inbound (Postmark, Mailgun, CloudMailin) mandam
// variações disso e um ajuste de forma não deveria exigir código novo.
//
// ---------------------------------------------------------------------
// AUTENTICAÇÃO
// ---------------------------------------------------------------------
// A URL cadastrada no provedor é
//   https://<host>/api/webhooks/email?canal=<id-do-canal>&secret=<segredo>
// O segredo também pode vir no header Authorization: Bearer <segredo> ou
// X-Arini-Secret — o que o provedor permitir. Sem segredo válido, 401:
// esta rota é pública e sem prova qualquer um injetaria e-mail falso.
//
// NÃO validamos a assinatura Svix da Resend: ela exige o segredo do
// endpoint no formato deles e um cabeçalho de timestamp, coisa que o
// cadastro do canal hoje não guarda. O segredo próprio dá a mesma
// garantia de autenticidade para o nosso caso.
// =====================================================================

type Anexo = {
  filename?: string;
  content_type?: string;
  contentType?: string;
  url?: string;
};

type DadosEmail = {
  email_id?: string;
  message_id?: string;
  messageId?: string;
  from?: string | { address?: string; name?: string };
  sender?: string;
  to?: string | string[];
  recipient?: string;
  subject?: string;
  text?: string;
  html?: string;
  headers?: { name?: string; value?: string }[] | Record<string, string>;
  attachments?: Anexo[];
};

type PayloadEmail = DadosEmail & {
  type?: string;
  data?: DadosEmail;
};

/** Lê um cabeçalho seja qual for o formato (lista nome/valor ou objeto). */
function header(dados: DadosEmail, nome: string): string | null {
  const alvo = nome.toLowerCase();
  const h = dados.headers;
  if (!h) return null;
  if (Array.isArray(h)) {
    const achado = h.find((x) => (x?.name ?? "").toLowerCase() === alvo);
    return achado?.value ?? null;
  }
  for (const [k, v] of Object.entries(h)) {
    if (k.toLowerCase() === alvo) return typeof v === "string" ? v : null;
  }
  return null;
}

/** Normaliza o remetente, que pode vir string ou objeto. */
function remetenteBruto(dados: DadosEmail): string {
  const f = dados.from ?? dados.sender;
  if (!f) return "";
  if (typeof f === "string") return f;
  return f.name ? `${f.name} <${f.address ?? ""}>` : (f.address ?? "");
}

/** Primeiro destinatário — é ele que identifica a caixa/canal. */
function destinatario(dados: DadosEmail): string | null {
  const t = dados.to ?? dados.recipient;
  if (!t) return null;
  const bruto = Array.isArray(t) ? t[0] : t;
  return extrairEndereco(bruto) || null;
}

export async function POST(req: Request) {
  let payload: PayloadEmail;
  try {
    payload = (await req.json()) as PayloadEmail;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  // Envelope da Resend (`data`) ou payload plano.
  const dados: DadosEmail = payload.data ?? payload;

  // Eventos de entrega/abertura usam a MESMA URL de webhook na Resend.
  // Só nos interessa e-mail recebido; o resto vira 200 silencioso para o
  // provedor não ficar reentregando.
  const tipoEvento = payload.type;
  if (tipoEvento && tipoEvento !== "email.received" && tipoEvento !== "inbound.email") {
    return NextResponse.json({ ok: true, ignored: tipoEvento });
  }

  const admin = createSupabaseAdmin();

  // Sem `?canal=` na URL, casamos pelo endereço que recebeu o e-mail.
  const auth = await autenticarCanalWebhook(admin, req, "email_smtp", {
    chaveConfig: "remetente",
    valor: destinatario(dados),
  });
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: auth.status });
  const canal = auth.canal;

  const de = remetenteBruto(dados);
  const enderecoCliente = extrairEndereco(de);
  if (!enderecoCliente) {
    return NextResponse.json({ ok: true, ignored: "e-mail sem remetente" });
  }

  // Auto-resposta e bounce não são atendimento — responder a eles cria
  // laço infinito de e-mail entre dois robôs.
  const autoSubmitted = header(dados, "Auto-Submitted");
  const precedence = header(dados, "Precedence");
  if (
    (autoSubmitted && autoSubmitted.toLowerCase() !== "no") ||
    ["bulk", "auto_reply", "junk", "list"].includes((precedence ?? "").toLowerCase()) ||
    /^(mailer-daemon|no-?reply|postmaster)@/i.test(enderecoCliente)
  ) {
    return NextResponse.json({ ok: true, ignored: "resposta automática" });
  }

  // ---- Corpo: prefere o texto puro; senão, converte o HTML ------------
  const bruto = dados.text?.trim() || (dados.html ? htmlParaTexto(dados.html) : "");
  const texto = bruto ? removerCitacao(bruto) : "";

  const anexos = Array.isArray(dados.attachments) ? dados.attachments : [];
  const primeiroAnexo = anexos.find((a) => a?.url);

  if (!texto && !primeiroAnexo) {
    return NextResponse.json({ ok: true, ignored: "e-mail sem conteúdo legível" });
  }

  // ---- Threading: é aqui que o canal de e-mail acerta a conversa ------
  // O Message-ID que NÓS geramos carrega o uuid da conversa; o cliente o
  // devolve em In-Reply-To/References ao responder. Se achar, a mensagem
  // entra na thread certa mesmo que ele escreva de outro endereço ou
  // troque o assunto. Se não achar, cai no external_id (o endereço).
  const conversaPorThread =
    extrairConversaDeReferencias(
      header(dados, "In-Reply-To"),
      header(dados, "References"),
      header(dados, HEADER_CONVERSA),
    ) ?? null;

  const assunto = (dados.subject ?? "").trim() || null;
  const idProvedor =
    dados.email_id ?? dados.message_id ?? dados.messageId ?? header(dados, "Message-ID") ?? null;

  const resultado = await registrarMensagemEntrada(admin, {
    canal: "email",
    channelId: canal.id,
    externalIdConversa: enderecoCliente,
    conversaId: conversaPorThread,
    externalIdMensagem: idProvedor,
    nome: extrairNome(de),
    email: enderecoCliente,
    telefone: null,
    leadExternalId: `email:${enderecoCliente}`,
    // O assunto entra no corpo da primeira linha: no inbox, um e-mail sem
    // assunto visível fica difícil de entender fora do contexto.
    texto: assunto && !conversaPorThread ? `${assunto}\n\n${texto}`.trim() : texto || null,
    tipo: primeiroAnexo && !texto ? "documento" : "texto",
    mediaUrl: primeiroAnexo?.url ?? null,
    mediaNome: primeiroAnexo?.filename ?? null,
    mediaMime: primeiroAnexo?.content_type ?? primeiroAnexo?.contentType ?? null,
    rawPayload: payload as unknown as Record<string, unknown>,
    tituloNotificacao: "Novo e-mail no atendimento",
    // Guardamos o assunto para a resposta sair como "Re: <assunto>" e o
    // Message-ID DELE para virar o nosso In-Reply-To. Sem esses dois, a
    // resposta do agente chega como e-mail solto, fora da thread.
    atributos: {
      ...(assunto ? { email_assunto: assunto } : {}),
      ...(header(dados, "Message-ID") ? { email_message_id: header(dados, "Message-ID") } : {}),
    },
  });

  if (!resultado.ok) {
    return NextResponse.json({ error: resultado.erro }, { status: 500 });
  }

  return NextResponse.json({
    ok: true,
    conversation_id: resultado.conversationId,
    duplicate: resultado.duplicada,
    automacoes: resultado.automacoes,
  });
}

/** Ping de sanidade — alguns provedores fazem GET ao salvar a URL. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook e-mail de entrada" });
}
