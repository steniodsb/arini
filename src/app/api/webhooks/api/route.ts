import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  autenticarCanalWebhook,
  registrarMensagemEntrada,
} from "@/lib/atendimento/inbound";
import type { MessageTipo } from "@/lib/types";

// =====================================================================
// Webhook do CANAL POR API GENÉRICA.
//
// É a porta para o cliente plugar QUALQUER sistema próprio no inbox:
// um app, um chat de site feito na mão, um bot interno, um formulário.
// Nós não sabemos nada sobre o outro lado — ele é quem diz qual contato
// falou e o que foi dito.
//
// Mesma forma dos outros webhooks: acha o canal → valida o segredo em
// tempo constante → acha-ou-cria conversa/lead → grava a mensagem →
// denormaliza o inbox → dispara as automações.
//
// ---------------------------------------------------------------------
// CONTRATO DE ENTRADA
// ---------------------------------------------------------------------
//   POST /api/webhooks/api?canal=<id-do-canal>
//   Authorization: Bearer <webhook_secret>
//   Content-Type: application/json
//
//   {
//     "contatoId":  "cliente-123",     // OBRIGATÓRIO — sua chave estável
//     "nome":       "Fulano de Tal",   // opcional
//     "telefone":   "+5511999999999",  // opcional
//     "email":      "fulano@x.com",    // opcional
//     "texto":      "Olá, tudo bem?",  // obrigatório se não houver mídia
//     "mediaUrl":   "https://...",     // opcional, precisa ser pública
//     "mediaTipo":  "imagem",          // imagem | audio | video | documento
//     "mediaNome":  "contrato.pdf",    // opcional
//     "externalId": "msg-987"          // opcional, evita mensagem duplicada
//   }
//
// `contatoId` é o que amarra tudo: é a chave da thread (uma conversa por
// contatoId neste canal) e a chave de dedupe do contato. Mande sempre o
// MESMO valor para a mesma pessoa — se ele mudar, o inbox abre uma
// conversa nova, como se fosse outro cliente.
//
// Resposta: { ok, conversation_id, duplicate, automacoes }.
// Erro sempre com { error: "motivo em português" }.
// =====================================================================

const TIPOS_MIDIA: MessageTipo[] = ["imagem", "audio", "video", "documento"];

type PayloadApi = {
  contatoId?: string;
  contato_id?: string;
  nome?: string;
  telefone?: string;
  email?: string;
  texto?: string;
  mediaUrl?: string;
  mediaTipo?: string;
  mediaNome?: string;
  mediaMime?: string;
  externalId?: string;
};

export async function POST(req: Request) {
  let payload: PayloadApi;
  try {
    payload = (await req.json()) as PayloadApi;
  } catch {
    return NextResponse.json({ error: "payload inválido — envie JSON" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Aqui não há busca alternativa: o canal por API SEMPRE vem na URL.
  // Não existe "endereço de destino" para casar como no e-mail/SMS.
  const auth = await autenticarCanalWebhook(admin, req, "api_generica");
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: auth.status });
  const canal = auth.canal;

  const contatoId = (payload.contatoId ?? payload.contato_id ?? "").trim();
  if (!contatoId) {
    return NextResponse.json(
      { error: "contatoId é obrigatório — é ele que identifica a conversa" },
      { status: 400 },
    );
  }

  const texto = payload.texto?.trim() || null;
  const mediaUrl = payload.mediaUrl?.trim() || null;
  if (!texto && !mediaUrl) {
    return NextResponse.json({ error: "envie texto ou mediaUrl" }, { status: 400 });
  }

  // Mídia só por URL pública: não recebemos upload aqui, e um link que o
  // navegador do atendente não abre é pior do que nenhum anexo.
  if (mediaUrl && !/^https:\/\/.+/i.test(mediaUrl)) {
    return NextResponse.json({ error: "mediaUrl precisa ser uma URL https pública" }, { status: 400 });
  }

  const tipoInformado = (payload.mediaTipo ?? "").trim() as MessageTipo;
  const tipo: MessageTipo = mediaUrl
    ? (TIPOS_MIDIA.includes(tipoInformado) ? tipoInformado : "documento")
    : "texto";

  const resultado = await registrarMensagemEntrada(admin, {
    canal: "api",
    channelId: canal.id,
    externalIdConversa: contatoId,
    // Prefixado com o id do canal: dois clientes de API diferentes podem
    // usar "cliente-1" sem uma mensagem sumir por dedupe cruzado.
    externalIdMensagem: payload.externalId?.trim()
      ? `api:${canal.id}:${payload.externalId.trim()}`
      : null,
    nome: payload.nome ?? null,
    telefone: payload.telefone ?? null,
    email: payload.email ?? null,
    leadExternalId: `api:${canal.id}:${contatoId}`,
    texto,
    tipo,
    mediaUrl,
    mediaNome: payload.mediaNome ?? null,
    mediaMime: payload.mediaMime ?? null,
    rawPayload: payload as unknown as Record<string, unknown>,
    tituloNotificacao: "Nova mensagem via API",
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

/** Ping de sanidade — serve para o integrador conferir a URL e o segredo. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook api genérica" });
}
