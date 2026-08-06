import type { SupabaseClient } from "@supabase/supabase-js";
import type { ConversationChannel, MessageTipo } from "./types";

// =====================================================================
// Envio pela MESSENGER PLATFORM — Instagram Direct, Messenger e as DMs de
// página do Facebook.
//
// POR QUE ESTE ARQUIVO EXISTE
// ---------------------------
// O webhook `/api/webhooks/[platform]` já recebia DM dessas três redes e
// abria conversa no inbox desde sempre. Só que responder falhava: o
// despacho de saída caía em `sendOutboundText`, que atende apenas o
// WhatsApp e devolvia "envio por instagram ainda não habilitado". Na
// prática o atendimento era MÃO ÚNICA nesses canais — via a mensagem e
// tinha que responder pelo app do celular, fora do histórico.
//
// POR QUE NÃO É A MESMA COISA QUE O WHATSAPP
// ------------------------------------------
// Apesar de ser a mesma Graph API, o contrato é outro:
//   · WhatsApp  → POST /<phone_number_id>/messages, com
//                 `messaging_product: "whatsapp"` e `to: <telefone>`.
//   · Messenger → POST /<page_id>/messages, com
//                 `recipient: { id: <PSID/IGSID> }`. Não há telefone: o
//                 destinatário é um id opaco por página, que é justamente
//                 o que o webhook guarda em `conversations.external_id`.
// Juntar os dois numa função só custaria mais em `if` do que separar.
//
// CREDENCIAL
// ----------
// Vem de `social_integrations` (a tela CRM › Integrações), não de
// `atendimento_channels`: é lá que Instagram e Facebook sempre moraram, e
// duplicar o cadastro faria a pessoa configurar duas vezes a mesma página.
// O `access_token` precisa ser um TOKEN DE PÁGINA (não de usuário) com
// `pages_messaging` — e, para o Instagram, a conta profissional vinculada
// à página, com `instagram_manage_messages`.
//
// JANELA DE 24 HORAS
// ------------------
// A Meta só aceita mensagem livre dentro de 24 h desde a última mensagem
// do cliente. Fora disso a chamada é recusada por lá — não tentamos adivinhar
// o prazo aqui, porque a contagem é da Meta e qualquer réplica nossa
// erraria em algum fuso. O que fazemos é traduzir a recusa para uma frase
// que o atendente entenda, em vez de mostrar o texto cru da Graph API.
// =====================================================================

const GRAPH_VERSION = "v21.0";

export type MetaSendResult =
  | { ok: true; externalId: string | null }
  | { ok: false; reason: string };

/** Canais atendidos aqui. Fora destes, quem manda é o fluxo do WhatsApp. */
export function ehCanalMeta(canal: ConversationChannel): boolean {
  return canal === "instagram" || canal === "facebook" || canal === "messenger";
}

/**
 * Qual linha de `social_integrations` atende cada canal, em ordem de
 * preferência. `messenger` aceita "facebook" como plano B porque a tela do
 * CRM cadastra só quatro plataformas e Messenger é a caixa da própria
 * página do Facebook — quem configurou "facebook" configurou as duas.
 */
const PLATAFORMAS_DO_CANAL: Record<string, string[]> = {
  instagram: ["instagram"],
  facebook: ["facebook", "messenger"],
  messenger: ["messenger", "facebook"],
};

type Credencial = { accessToken: string; pageId: string | null; plataforma: string };

async function carregarCredencial(
  admin: SupabaseClient,
  canal: ConversationChannel,
): Promise<{ ok: true; cred: Credencial } | { ok: false; reason: string }> {
  const candidatas = PLATAFORMAS_DO_CANAL[canal] ?? [];
  let encontradaInativa = false;

  for (const plataforma of candidatas) {
    const { data } = await admin
      .from("social_integrations")
      .select("ativo, config")
      .eq("plataforma", plataforma)
      .maybeSingle();
    if (!data) continue;

    const config = (data.config ?? {}) as { access_token?: string; page_id?: string };
    const accessToken = config.access_token?.trim();
    if (!data.ativo) {
      encontradaInativa = true;
      continue;
    }
    if (!accessToken) continue;

    return {
      ok: true,
      cred: { accessToken, pageId: config.page_id?.trim() || null, plataforma },
    };
  }

  if (encontradaInativa) {
    return {
      ok: false,
      reason: `a integração do ${canal} está desativada — ligue em CRM › Integrações`,
    };
  }
  return {
    ok: false,
    reason:
      `sem credencial do ${canal} — cadastre o Access Token da página em CRM › Integrações`,
  };
}

/**
 * Tipos de anexo aceitos pela Messenger Platform.
 * O Instagram NÃO aceita `file`: mandar um PDF por lá volta erro da Meta
 * com mensagem obscura, então recusamos antes com um motivo legível.
 */
function tipoAnexo(tipo: MessageTipo): "image" | "audio" | "video" | "file" {
  if (tipo === "imagem") return "image";
  if (tipo === "audio") return "audio";
  if (tipo === "video") return "video";
  return "file";
}

/**
 * Traduz a recusa da Meta. O texto cru ("(#10) This message is sent
 * outside of allowed window") não diz ao atendente o que fazer.
 */
function motivoLegivel(mensagem: string | undefined, status: number): string {
  const cru = mensagem?.trim();
  if (!cru) return `a Meta recusou o envio (HTTP ${status})`;

  const baixo = cru.toLowerCase();
  if (baixo.includes("outside") && baixo.includes("window")) {
    return (
      "fora da janela de 24 h: a Meta só permite responder até 24 h depois da última " +
      "mensagem do cliente. Espere ele escrever de novo para retomar a conversa."
    );
  }
  if (baixo.includes("permission") || baixo.includes("(#200)")) {
    return (
      `${cru} — geralmente é permissão faltando no app da Meta ` +
      "(pages_messaging e, no Instagram, instagram_manage_messages)."
    );
  }
  return cru;
}

/**
 * Envia texto e/ou anexo para o contato de uma conversa de Instagram,
 * Messenger ou Facebook.
 *
 * `destino` é o PSID/IGSID que o webhook guardou em
 * `conversations.external_id` — ele só vale para ESTA página. Não é o
 * @usuário e não serve para iniciar conversa com alguém que nunca
 * escreveu: a Meta não expõe esse caminho, de propósito.
 *
 * Nunca lança — devolve `{ ok:false, reason }` para a mensagem ficar
 * gravada com status "falha" e o atendente ver o motivo na tela.
 */
export async function enviarPorMeta(
  admin: SupabaseClient,
  args: {
    canal: ConversationChannel;
    destino: string;
    texto: string | null;
    media: { url: string; tipo: MessageTipo; nome?: string | null } | null;
  },
): Promise<MetaSendResult> {
  const { canal, destino, texto, media } = args;

  const cred = await carregarCredencial(admin, canal);
  if (!cred.ok) return { ok: false, reason: cred.reason };

  if (media && canal === "instagram" && tipoAnexo(media.tipo) === "file") {
    return {
      ok: false,
      reason: "o Instagram não aceita documento por DM — mande o link no texto",
    };
  }

  // Sem page_id cai em /me/messages, que a Graph resolve pelo próprio
  // token de página. Funciona, mas o id explícito é melhor: com mais de
  // uma página no mesmo app, /me depende de qual token veio.
  const alvo = cred.cred.pageId || "me";
  const url = `https://graph.facebook.com/${GRAPH_VERSION}/${alvo}/messages`;

  // Anexo e texto são DUAS mensagens na Messenger Platform — não existe
  // "caption". Mandamos o anexo primeiro (é o conteúdo) e o texto em
  // seguida, para a legenda aparecer embaixo, como no app.
  const envios: Record<string, unknown>[] = [];
  if (media) {
    envios.push({
      attachment: {
        type: tipoAnexo(media.tipo),
        payload: { url: media.url, is_reusable: false },
      },
    });
  }
  if (texto?.trim()) envios.push({ text: texto });
  if (envios.length === 0) return { ok: false, reason: "nada para enviar" };

  let ultimoId: string | null = null;

  for (const message of envios) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${cred.cred.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          recipient: { id: destino },
          messaging_type: "RESPONSE",
          message,
        }),
        // Mesmo teto dos outros despachos: o atendente está olhando a tela.
        signal: AbortSignal.timeout(15_000),
      });
      const json = (await res.json().catch(() => ({}))) as {
        message_id?: string;
        error?: { message?: string };
      };
      if (!res.ok) {
        // Falha no meio (anexo foi, texto não): informamos a falha, e a
        // mensagem fica gravada como "falha". Reenviar duplica o anexo —
        // é o mal menor perto de dar por enviado o que não saiu.
        return { ok: false, reason: motivoLegivel(json?.error?.message, res.status) };
      }
      ultimoId = json?.message_id ?? ultimoId;
    } catch (e) {
      const motivo =
        e instanceof Error && e.name === "TimeoutError"
          ? "a Meta não respondeu a tempo"
          : e instanceof Error
            ? e.message
            : "falha de rede";
      return { ok: false, reason: motivo };
    }
  }

  return { ok: true, externalId: ultimoId };
}
