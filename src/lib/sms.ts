// =====================================================================
// Cliente de SMS do Atendimento — ADAPTADOR GENÉRICO.
//
// SEJA HONESTO COM QUEM LÊ: não existe "API padrão de SMS". Zenvia,
// Twilio, Infobip, Total Voice e os gateways nacionais têm cada um o seu
// corpo, o seu esquema de autenticação e o seu formato de resposta.
// Este módulo implementa o denominador comum — o formato que a maioria
// dos gateways brasileiros aceita:
//
//     POST <api_url>
//     Authorization: Bearer <api_key>
//     Content-Type: application/json
//     { "para": "+5511999999999", "mensagem": "...", "remetente": "Arini" }
//
// Para plugar um provedor de verdade, uma das três coisas vai acontecer:
//   1) ele aceita esse corpo (alguns aceitam) → funciona direto;
//   2) ele espera outros NOMES de campo (Twilio usa To/From/Body em
//      form-urlencoded; Zenvia usa from/to/contents[]) → é preciso um
//      ramo novo aqui ou um pequeno proxy do lado do cliente;
//   3) ele autentica de outro jeito (Basic com SID:token no Twilio,
//      X-API-TOKEN na Zenvia) → idem.
//
// Ou seja: o canal está PRONTO na estrutura (envia, recebe, grava, dispara
// automação), mas o corpo pode precisar de ajuste no provedor real. Isso
// é uma decisão consciente: adivinhar o dialeto de um provedor que não
// temos credencial para testar seria pior do que documentar o contrato.
// =====================================================================

/** Timeout: gateway de SMS lento não pode segurar a rota do Next. */
const TIMEOUT_MS = 15_000;

export type EnviarSmsArgs = {
  /** Endpoint completo do gateway (atendimento_channels.config.api_url). */
  apiUrl: string;
  apiKey: string;
  /** Número do destinatário. Normalizado para E.164 antes de sair. */
  para: string;
  mensagem: string;
  /** Remetente/sender id — alguns gateways exigem, outros ignoram. */
  remetente?: string | null;
};

export type EnvioSmsResultado =
  | { ok: true; id: string | null }
  | { ok: false; erro: string };

/** Resposta possível do gateway. Cada um usa um nome para o id. */
type RespostaSms = {
  id?: string | number;
  sid?: string;
  messageId?: string;
  message_id?: string;
  error?: string | { message?: string };
  message?: string;
  erro?: string;
};

/**
 * Normaliza para E.164 (+55...). Número brasileiro sem DDI é o erro mais
 * comum de integração: o gateway aceita a chamada e a mensagem some.
 */
export function normalizarNumero(bruto: string): string {
  const digitos = (bruto ?? "").replace(/\D/g, "");
  if (!digitos) return "";
  // 10 ou 11 dígitos = número nacional sem DDI → assume Brasil.
  if (digitos.length === 10 || digitos.length === 11) return `+55${digitos}`;
  return `+${digitos}`;
}

/** Extrai o id da mensagem seja qual for o nome que o gateway usou. */
function idDaResposta(json: RespostaSms | null): string | null {
  if (!json) return null;
  const bruto = json.id ?? json.sid ?? json.messageId ?? json.message_id;
  return bruto == null ? null : String(bruto);
}

/**
 * Dispara o SMS. NUNCA lança — mesmo contrato do resto do despacho de
 * saída: `{ ok:false, erro }` vira mensagem com status "falha" no inbox.
 */
export async function enviarSms(args: EnviarSmsArgs): Promise<EnvioSmsResultado> {
  const { apiUrl, apiKey, mensagem, remetente } = args;

  if (!apiUrl) return { ok: false, erro: "canal de SMS sem api_url configurada" };
  if (!apiKey) return { ok: false, erro: "canal de SMS sem api_key configurada" };

  const para = normalizarNumero(args.para);
  if (!para || para.length < 8) return { ok: false, erro: "número de destino inválido para SMS" };

  const texto = (mensagem ?? "").trim();
  if (!texto) return { ok: false, erro: "SMS sem texto" };

  let res: Response;
  try {
    res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        para,
        mensagem: texto,
        remetente: remetente ?? undefined,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (e) {
    const motivo =
      e instanceof Error && e.name === "TimeoutError"
        ? "o gateway de SMS não respondeu a tempo"
        : "não foi possível alcançar o gateway de SMS";
    return { ok: false, erro: motivo };
  }

  // Gateway de SMS costuma responder JSON, mas alguns devolvem texto puro.
  const cru = await res.text().catch(() => "");
  let json: RespostaSms | null = null;
  try {
    json = cru ? (JSON.parse(cru) as RespostaSms) : null;
  } catch {
    json = null;
  }

  if (!res.ok) {
    const doJson =
      typeof json?.error === "string"
        ? json.error
        : json?.error?.message || json?.message || json?.erro;
    return {
      ok: false,
      erro: doJson || `gateway de SMS respondeu HTTP ${res.status}${cru ? ` — ${cru.slice(0, 200)}` : ""}`,
    };
  }

  return { ok: true, id: idDaResposta(json) };
}

/**
 * Quantos SMS a mensagem vai consumir. GSM-7 cabe 160 caracteres; se
 * houver acento fora do alfabeto GSM ou emoji, o gateway cai em UCS-2 e o
 * limite despenca para 70. É informação de custo — a UI pode mostrar.
 */
export function segmentosSms(texto: string): { segmentos: number; unicode: boolean } {
  // Estimativa conservadora: qualquer caractere fora do ASCII (acento,
  // cedilha, emoji) já pode empurrar o gateway para UCS-2.
  const unicode = [...texto].some((c) => (c.codePointAt(0) ?? 0) > 127);
  const limite = unicode ? 70 : 160;
  const limiteConcat = unicode ? 67 : 153;
  if (texto.length <= limite) return { segmentos: 1, unicode };
  return { segmentos: Math.ceil(texto.length / limiteConcat), unicode };
}
