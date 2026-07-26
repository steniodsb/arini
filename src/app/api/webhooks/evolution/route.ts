import crypto from "crypto";
import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { toChannelStatus, type EvolutionState } from "@/lib/evolution";
import { dispararAutomacoes } from "@/lib/atendimento/triggers";
import type { MessageTipo } from "@/lib/types";

type Admin = ReturnType<typeof createSupabaseAdmin>;

// =====================================================================
// Webhook da Evolution API (WhatsApp via QR Code).
//
// Sem esta rota a Evolution não entrega NADA: o canal conecta, o QR é
// lido, mas nenhuma mensagem chega ao inbox. Ela trata quatro eventos:
//   connection.update  → status do canal (conectado / desconectado)
//   qrcode.updated     → volta para "aguardando leitura do QR"
//   messages.upsert    → mensagem nova (entrada e o eco das enviadas)
//   messages.update    → confirmação de entrega/leitura
//
// Segurança: o canal guarda um `webhook_secret` em config, enviado pela
// Evolution no header Authorization. Um evento sem o segredo certo é
// rejeitado — a URL é pública e qualquer um poderia forjar mensagem.
// =====================================================================

type EvolutionPayload = {
  event?: string;
  instance?: string;
  data?: Record<string, unknown>;
};

type CanalRow = {
  id: string;
  canal: string;
  config: Record<string, string | undefined>;
};

/** Compara o segredo em tempo constante (evita descobrir por temporização). */
function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const limpo = recebido.replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(limpo);
  const b = Buffer.from(esperado);
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/** "5511999999999@s.whatsapp.net" → "5511999999999". Grupos são ignorados. */
function telefoneDoJid(jid: string | undefined): string | null {
  if (!jid) return null;
  if (jid.endsWith("@g.us")) return null; // grupo — fora do escopo do atendimento
  const n = jid.split("@")[0]?.split(":")[0];
  return n && /^\d{8,15}$/.test(n) ? n : null;
}

/** Extrai texto e mídia dos vários formatos de `message` do Baileys. */
function extrairConteudo(message: Record<string, unknown> | undefined): {
  texto: string | null;
  tipo: MessageTipo;
  mediaUrl: string | null;
  mediaNome: string | null;
  mediaMime: string | null;
} {
  const vazio = { texto: null, tipo: "texto" as MessageTipo, mediaUrl: null, mediaNome: null, mediaMime: null };
  if (!message) return vazio;

  const obj = (k: string) => message[k] as Record<string, unknown> | undefined;

  if (typeof message.conversation === "string") {
    return { ...vazio, texto: message.conversation };
  }
  const ext = obj("extendedTextMessage");
  if (ext && typeof ext.text === "string") return { ...vazio, texto: ext.text };

  const mapa: [string, MessageTipo][] = [
    ["imageMessage", "imagem"],
    ["videoMessage", "video"],
    ["audioMessage", "audio"],
    ["documentMessage", "documento"],
    ["stickerMessage", "imagem"],
  ];
  for (const [chave, tipo] of mapa) {
    const m = obj(chave);
    if (!m) continue;
    return {
      texto: (m.caption as string) ?? null,
      tipo,
      // A Evolution devolve a URL criptografada do WhatsApp; quando o
      // servidor está com S3/Minio ligado, vem também `mediaUrl` já
      // hospedada — é essa que conseguimos exibir no navegador.
      mediaUrl: (m.mediaUrl as string) ?? (message.mediaUrl as string) ?? null,
      mediaNome: (m.fileName as string) ?? null,
      mediaMime: (m.mimetype as string) ?? null,
    };
  }

  const loc = obj("locationMessage");
  if (loc) {
    const lat = loc.degreesLatitude, lng = loc.degreesLongitude;
    return { ...vazio, texto: `📍 Localização: https://maps.google.com/?q=${lat},${lng}` };
  }
  const contato = obj("contactMessage");
  if (contato) return { ...vazio, texto: `👤 Contato: ${contato.displayName ?? ""}` };

  return vazio;
}

export async function POST(req: Request) {
  let payload: EvolutionPayload;
  try {
    payload = (await req.json()) as EvolutionPayload;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const instancia = payload.instance;
  if (!instancia) return NextResponse.json({ ok: true, ignored: "sem instância" });

  const admin = createSupabaseAdmin();

  // Acha o canal pela instância (é a chave que a Evolution devolve).
  const { data: canalRow } = await admin
    .from("atendimento_channels")
    .select("id, canal, config")
    .eq("provedor", "evolution")
    .eq("config->>instance_name", instancia)
    .maybeSingle();

  const canal = canalRow as CanalRow | null;
  if (!canal) return NextResponse.json({ ok: true, ignored: "canal desconhecido" });

  const esperado = canal.config.webhook_secret;
  if (esperado && !segredoConfere(req.headers.get("authorization"), esperado)) {
    return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  }

  const evento = (payload.event ?? "").toLowerCase().replace(/_/g, ".");
  const data = payload.data ?? {};

  // ---------------- Estado da conexão ----------------
  if (evento === "connection.update") {
    const state = (data.state as EvolutionState) ?? "close";
    const status = toChannelStatus(state);
    await admin
      .from("atendimento_channels")
      .update({
        status,
        conectado_em: status === "conectado" ? new Date().toISOString() : null,
        ultimo_erro: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", canal.id);
    return NextResponse.json({ ok: true, status });
  }

  if (evento === "qrcode.updated") {
    await admin
      .from("atendimento_channels")
      .update({ status: "aguardando_qr", updated_at: new Date().toISOString() })
      .eq("id", canal.id);
    return NextResponse.json({ ok: true });
  }

  // ---------------- Confirmação de entrega/leitura ----------------
  if (evento === "messages.update") {
    const key = data.key as Record<string, unknown> | undefined;
    const externalId = (key?.id as string) ?? (data.keyId as string) ?? null;
    const bruto = String(data.status ?? "").toUpperCase();
    const novo =
      bruto === "READ" || bruto === "PLAYED" ? "lida"
        : bruto === "DELIVERY_ACK" ? "entregue"
          : bruto === "SERVER_ACK" ? "enviada"
            : null;
    if (externalId && novo) {
      await admin.from("messages").update({ status: novo }).eq("external_id", externalId);
    }
    return NextResponse.json({ ok: true });
  }

  if (evento !== "messages.upsert") {
    return NextResponse.json({ ok: true, ignored: evento });
  }

  // ---------------- Mensagem nova ----------------
  const key = data.key as Record<string, unknown> | undefined;
  const jid = key?.remoteJid as string | undefined;
  const fromMe = key?.fromMe === true;
  const externalId = (key?.id as string) ?? null;
  const telefone = telefoneDoJid(jid);

  // Grupo, broadcast ou status: fora do escopo do atendimento 1-a-1.
  if (!telefone) return NextResponse.json({ ok: true, ignored: "não é conversa individual" });

  const conteudo = extrairConteudo(data.message as Record<string, unknown> | undefined);
  if (!conteudo.texto && !conteudo.mediaUrl) {
    return NextResponse.json({ ok: true, ignored: "mensagem sem conteúdo legível" });
  }

  // Dedupe: a Evolution reentrega eventos, e o eco de mensagem enviada por
  // nós já foi gravado pela rota /api/atendimento/send.
  if (externalId) {
    const { data: dup } = await admin
      .from("messages").select("id").eq("external_id", externalId).maybeSingle();
    if (dup) return NextResponse.json({ ok: true, duplicate: true });
  }

  const nome = (data.pushName as string) || null;

  // 1) Acha-ou-cria a conversa por (canal, external_id do contato).
  const { data: convExistente } = await admin
    .from("conversations")
    .select("id, lead_id, unread_count")
    .eq("canal", "whatsapp")
    .eq("external_id", telefone)
    .maybeSingle();

  let conversationId = convExistente?.id as string | undefined;
  let leadId = (convExistente?.lead_id as string | null) ?? null;

  if (!conversationId) {
    // 2) Dedupe do contato pelo telefone antes de criar um lead novo.
    const { data: lead } = await admin
      .from("leads")
      .select("id")
      .or(`whatsapp.eq.${telefone},telefone.eq.${telefone}`)
      .limit(1)
      .maybeSingle();
    leadId = (lead?.id as string) ?? null;

    if (!leadId) {
      const { data: novoLead } = await admin
        .from("leads")
        .insert({
          nome: nome || `Contato ${telefone}`,
          telefone,
          whatsapp: telefone,
          origem: "whatsapp",
          stage: "novo",
        })
        .select("id")
        .single();
      leadId = (novoLead?.id as string) ?? null;
    }

    const { data: novaConv, error: convErr } = await admin
      .from("conversations")
      .insert({
        canal: "whatsapp",
        external_id: telefone,
        channel_id: canal.id,
        lead_id: leadId,
        contato_nome: nome,
        contato_telefone: telefone,
        setor_responsavel: "recepcao",
        status: "aberta",
      })
      .select("id")
      .single();
    if (convErr || !novaConv) {
      return NextResponse.json({ error: convErr?.message ?? "falha ao abrir conversa" }, { status: 500 });
    }
    conversationId = novaConv.id as string;
  }

  // 3) Grava a mensagem.
  const preview = conteudo.texto?.slice(0, 140) ?? `[${conteudo.tipo}]`;
  await admin.from("messages").insert({
    conversation_id: conversationId,
    direcao: fromMe ? "out" : "in",
    // fromMe sem autor = respondido pelo celular (coexistence do Baileys).
    remetente: fromMe ? "atendente" : "cliente",
    tipo: conteudo.tipo,
    conteudo: conteudo.texto,
    media_url: conteudo.mediaUrl,
    media_nome: conteudo.mediaNome,
    media_mime: conteudo.mediaMime,
    external_id: externalId,
    raw_payload: payload as unknown as Record<string, unknown>,
    status: fromMe ? "enviada" : "recebida",
  });

  // 4) Denormaliza o inbox. Só mensagem do cliente conta como não lida, e
  //    a chegada dela reabre a conversa adiada (o cliente respondeu).
  const patch: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    last_message_preview: preview,
    contato_nome: nome ?? undefined,
  };
  if (!fromMe) {
    patch.unread_count = ((convExistente?.unread_count as number) ?? 0) + 1;
    patch.status = "aberta";
    patch.snoozed_until = null;
  }
  await admin.from("conversations").update(patch).eq("id", conversationId);

  if (leadId) {
    await admin.from("leads")
      .update({ ultima_interacao_em: new Date().toISOString() })
      .eq("id", leadId);
  }

  if (!fromMe) {
    await notificarRecepcao(admin, preview);
  }

  // 5) Automações. Só mensagem do cliente dispara regra — eco de mensagem
  //    nossa (fromMe) não deve reprocessar boas-vindas nem reatribuir.
  let automacao: Awaited<ReturnType<typeof dispararAutomacoes>> | null = null;
  if (!fromMe) {
    automacao = await dispararAutomacoes(admin, conversationId, {
      conversaNova: !convExistente,
      conteudo: conteudo.texto,
      direcao: "in",
      interna: false,
    });
  }

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    automacoes: automacao?.regrasDisparadas ?? 0,
  });
}

async function notificarRecepcao(admin: Admin, mensagem: string) {
  await admin.from("notifications").insert({
    sector: "recepcao",
    tipo: "atendimento",
    titulo: "Nova mensagem no WhatsApp",
    mensagem,
    link: "/atendimento",
  });
}

/** A Evolution faz um GET de sanidade na URL ao configurar o webhook. */
export async function GET() {
  return NextResponse.json({ ok: true, servico: "webhook evolution" });
}
