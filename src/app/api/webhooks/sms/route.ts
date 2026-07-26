import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  autenticarCanalWebhook,
  registrarMensagemEntrada,
} from "@/lib/atendimento/inbound";
import { normalizarNumero } from "@/lib/sms";

// =====================================================================
// Webhook de SMS DE ENTRADA (adaptador genérico).
//
// Mesma forma dos outros webhooks: acha o canal → valida o segredo em
// tempo constante → acha-ou-cria conversa/lead → grava a mensagem →
// denormaliza o inbox → dispara as automações.
//
// ---------------------------------------------------------------------
// FORMATO ESPERADO (POST application/json)
// ---------------------------------------------------------------------
//   { "de": "+5511999999999", "mensagem": "texto", "id": "opcional" }
//
// Como não existe padrão de mercado (ver o cabeçalho de src/lib/sms.ts),
// aceitamos os apelidos mais comuns dos gateways:
//   remetente : de | from | From | origem | sender | msisdn | telefone
//   texto     : mensagem | message | Body | text | texto | content
//   id        : id | messageId | message_id | sid | MessageSid
//   destino   : para | to | To | destino   (usado só para achar o canal)
// Um gateway com nomes exóticos precisa de um proxy simples do lado do
// cliente, ou de um apelido novo aqui — é uma linha.
//
// ---------------------------------------------------------------------
// AUTENTICAÇÃO
// ---------------------------------------------------------------------
//   https://<host>/api/webhooks/sms?canal=<id-do-canal>&secret=<segredo>
// Ou Authorization: Bearer <segredo> / X-Arini-Secret, se o gateway
// deixar configurar header. Sem segredo válido → 401.
// =====================================================================

type PayloadSms = Record<string, unknown>;

/** Primeiro apelido presente e não vazio. */
function campo(payload: PayloadSms, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const v = payload[nome];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number") return String(v);
  }
  return null;
}

export async function POST(req: Request) {
  let payload: PayloadSms;
  try {
    payload = (await req.json()) as PayloadSms;
  } catch {
    // Vários gateways entregam SMS como form-urlencoded (é o caso da
    // Twilio). Sem isso o canal quebraria logo no primeiro recebimento.
    try {
      const form = await req.formData();
      payload = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
    } catch {
      return NextResponse.json({ error: "payload inválido" }, { status: 400 });
    }
  }

  const de = campo(payload, "de", "from", "From", "origem", "sender", "msisdn", "telefone");
  const para = campo(payload, "para", "to", "To", "destino");
  const texto = campo(payload, "mensagem", "message", "Body", "text", "texto", "content");
  const idProvedor = campo(payload, "id", "messageId", "message_id", "sid", "MessageSid");

  const admin = createSupabaseAdmin();

  // Sem `?canal=` na URL, casamos pelo número que recebeu o SMS.
  const auth = await autenticarCanalWebhook(admin, req, "sms_generico", {
    chaveConfig: "remetente",
    valor: para,
  });
  if (!auth.ok) return NextResponse.json({ error: auth.erro }, { status: auth.status });
  const canal = auth.canal;

  if (!de) return NextResponse.json({ ok: true, ignored: "SMS sem remetente" });
  if (!texto) return NextResponse.json({ ok: true, ignored: "SMS sem texto" });

  // E.164 sempre: o mesmo celular chega ora "11999999999", ora
  // "+5511999999999". Sem normalizar, viram duas conversas do mesmo cliente.
  const numero = normalizarNumero(de);

  const resultado = await registrarMensagemEntrada(admin, {
    canal: "sms",
    channelId: canal.id,
    externalIdConversa: numero,
    externalIdMensagem: idProvedor ? `sms:${idProvedor}` : null,
    nome: null,
    telefone: numero,
    email: null,
    leadExternalId: `sms:${numero}`,
    texto,
    tipo: "texto",
    rawPayload: payload,
    tituloNotificacao: "Novo SMS no atendimento",
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

/** Ping de sanidade — muitos gateways fazem GET ao salvar a URL. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook sms de entrada" });
}
