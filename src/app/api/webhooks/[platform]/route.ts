import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import {
  verifyMetaSignature,
  conferirAssinaturaMeta,
  segredoConfere,
} from "@/lib/whatsapp";
import { dispararAutomacoes } from "@/lib/atendimento/triggers";
import {
  emitirContatoCriado,
  emitirConversaCriada,
  emitirMensagemCriada,
} from "@/lib/atendimento/webhook-eventos";
import { linhaSocialDaPlataforma } from "@/lib/meta-plataformas";
import type { ConversationChannel, MessageTipo } from "@/lib/types";

// Plataformas suportadas e a origem de lead correspondente.
const PLATFORM_ORIGIN: Record<string, string> = {
  instagram: "instagram",
  facebook: "facebook",
  messenger: "messenger",
  whatsapp: "whatsapp",
  tiktok: "tiktok",
};

// Canais que viram CONVERSA (inbox de atendimento). tiktok não tem inbox 2-vias.
const CONVERSATION_CHANNELS: Record<string, ConversationChannel> = {
  whatsapp: "whatsapp",
  instagram: "instagram",
  facebook: "facebook",
  messenger: "messenger",
};

// =====================================================================
// WhatsApp Cloud API: DUAS origens de credencial
//
// Historicamente esta rota só conhecia `social_integrations` — a tela
// antiga do CRM. Depois nasceu Atendimento › Canais, que cadastra Cloud
// API e Coexistence em `atendimento_channels` com os MESMOS campos
// (phone_number_id, verify_token, app_secret).
//
// O efeito de a rota não saber disso era um beco sem saída silencioso:
// quem conectasse o WhatsApp oficial pelo assistente via o canal ficar
// "conectado" e conseguia ENVIAR (o despacho lê atendimento_channels),
// mas não recebia nada — o handshake do webhook falhava por verify_token
// desconhecido e, se passasse, a mensagem era descartada porque a linha
// legada estava inativa. Nenhuma tela mostrava erro.
//
// Agora as duas origens valem, e o `phone_number_id` do payload diz qual
// canal recebeu — o que também amarra a conversa ao número certo, para a
// resposta sair por onde entrou.
// =====================================================================

type CanalCloud = { id: string; config: Record<string, string> };

async function canaisCloudApi(admin: ReturnType<typeof createSupabaseAdmin>): Promise<CanalCloud[]> {
  const { data } = await admin
    .from("atendimento_channels")
    .select("id, config")
    .in("provedor", ["cloud_api", "cloud_api_coexistence"]);
  return ((data ?? []) as { id: string; config: Record<string, string> | null }[]).map((c) => ({
    id: c.id,
    config: c.config ?? {},
  }));
}

/** `entry[0].changes[0].value.metadata.phone_number_id` — qual número recebeu. */
function phoneNumberIdDoPayload(payload: Record<string, unknown>): string | null {
  try {
    const entry = (payload.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
    const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown> | undefined;
    const value = change?.value as Record<string, unknown> | undefined;
    const meta = value?.metadata as Record<string, unknown> | undefined;
    const id = meta?.phone_number_id;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

/**
 * Verificação do webhook (Meta/Instagram/Facebook/WhatsApp usam este handshake).
 * GET ?hub.mode=subscribe&hub.verify_token=...&hub.challenge=...
 * O verify_token é comparado com o configurado em social_integrations.config.verify_token.
 */
export async function GET(req: Request, { params }: { params: { platform: string } }) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");

  if (mode !== "subscribe") return NextResponse.json({ error: "modo inválido" }, { status: 400 });

  const admin = createSupabaseAdmin();
  const { data: integ } = await admin
    .from("social_integrations")
    .select("config")
    .eq("plataforma", linhaSocialDaPlataforma(params.platform))
    .maybeSingle();

  const esperado = (integ?.config as { verify_token?: string } | null)?.verify_token ?? null;
  if (segredoConfere(token, esperado)) {
    return new Response(challenge ?? "", { status: 200 });
  }

  // Plano B do WhatsApp: o verify_token pode ter sido cadastrado em
  // Atendimento › Canais em vez da tela antiga do CRM. Sem isto, conectar
  // o WhatsApp oficial pelo assistente falhava logo no handshake — e a
  // mensagem da Meta ("não foi possível validar a URL de callback") não
  // dá pista nenhuma de que o token está no outro lugar.
  if (params.platform === "whatsapp") {
    for (const canal of await canaisCloudApi(admin)) {
      if (segredoConfere(token, canal.config.verify_token ?? null)) {
        return new Response(challenge ?? "", { status: 200 });
      }
    }
  }

  return NextResponse.json({ error: "verify_token inválido" }, { status: 403 });
}

/**
 * Recebe mensagens das plataformas e as anexa a uma CONVERSA no CRM.
 * Fluxo (dedupe): identifica o contato → acha-ou-cria a conversa (canal+external_id)
 * → acha-ou-cria o lead ligado → grava a mensagem (dedupe por external_id).
 * Não cria mais um lead por mensagem. Webhooks de status (entregue/lida) e
 * eventos sem mensagem são ignorados sem criar nada.
 */
export async function POST(req: Request, { params }: { params: { platform: string } }) {
  const origem = PLATFORM_ORIGIN[params.platform];
  if (!origem) return NextResponse.json({ error: "plataforma não suportada" }, { status: 404 });

  // Corpo cru é necessário para validar a assinatura HMAC da Meta.
  const rawBody = await req.text();
  let payload: Record<string, unknown> = {};
  try {
    payload = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const admin = createSupabaseAdmin();

  // Qual canal do Atendimento recebeu esta mensagem (só WhatsApp Cloud).
  // Serve para três coisas: validar a assinatura com o segredo certo, não
  // descartar a mensagem quando a linha legada está inativa, e amarrar a
  // conversa ao número — sem isso a resposta pode sair por outro.
  let canalCloud: CanalCloud | null = null;
  if (params.platform === "whatsapp") {
    const phoneNumberId = phoneNumberIdDoPayload(payload);
    const canais = await canaisCloudApi(admin);
    canalCloud =
      canais.find((c) => c.config.phone_number_id === phoneNumberId) ??
      // Um canal só cadastrado: não há ambiguidade possível. Vale como
      // rede de segurança para payload sem `metadata` (a Meta manda alguns
      // eventos assim) — com dois números, o `find` acima é quem decide.
      (canais.length === 1 && !phoneNumberId ? canais[0] : null);
  }

  // Assinatura: rejeita só quando há app_secret configurado e não confere.
  // Com canal do Atendimento identificado, o segredo dele vence — é o que
  // corresponde ao app da Meta que assinou este POST.
  const sig = req.headers.get("x-hub-signature-256");
  const verdict = canalCloud?.config.app_secret
    ? conferirAssinaturaMeta(canalCloud.config.app_secret, rawBody, sig)
    : await verifyMetaSignature(admin, params.platform, rawBody, sig);
  if (verdict === "invalid") {
    return NextResponse.json({ error: "assinatura inválida" }, { status: 403 });
  }

  const { data: integ } = await admin
    .from("social_integrations")
    .select("ativo")
    .eq("plataforma", linhaSocialDaPlataforma(params.platform))
    .maybeSingle();

  // Só descarta quando NENHUMA das duas origens quer esta mensagem. Antes
  // bastava a linha legada estar inativa para o canal do Atendimento ser
  // ignorado em silêncio — o defeito mais caro do fluxo, porque tudo na
  // tela dizia "conectado".
  if (!integ?.ativo && !canalCloud) return NextResponse.json({ ok: true, ignored: true });

  // Comentário em post do Instagram/Facebook: não é conversa (não dá para
  // responder DM a quem só comentou — a Meta exige que a pessoa escreva
  // primeiro), então vira LEAD, como o TikTok. Precisa vir antes de
  // `extractContact`, que só entende payload de mensagem e devolveria
  // "sem mensagem", descartando o evento em silêncio.
  const comentario = extrairComentario(payload, params.platform);
  if (comentario) {
    // Comentário da própria Página (resposta nossa) não é lead. `entry[].id`
    // é a Página no Facebook e a conta profissional no Instagram — nos dois
    // casos, é quem somos nós.
    if (comentario.autorId && comentario.autorId === comentario.contaId) {
      return NextResponse.json({ ok: true, ignored: true, reason: "comentário da própria página" });
    }

    // Dedupe pelo id do comentário: a Meta reenvia o evento em falha de
    // entrega e manda `edited` quando a pessoa corrige o texto.
    const { data: jaExiste } = await admin
      .from("leads")
      .select("id")
      .eq("external_id", comentario.id)
      .limit(1)
      .maybeSingle();
    if (jaExiste) {
      return NextResponse.json({ ok: true, ignored: true, reason: "comentário já registrado" });
    }

    const { data: novoLead } = await admin
      .from("leads")
      .insert({
        nome: comentario.autorNome || `Comentário ${origem}`,
        origem,
        mensagem: comentario.texto,
        external_id: comentario.id,
        raw_payload: payload,
        stage: "novo",
      })
      .select("id")
      .single();

    if (novoLead?.id) {
      emitirContatoCriado(admin, {
        id: novoLead.id,
        nome: comentario.autorNome || `Comentário ${origem}`,
        telefone: null,
        origem,
      });
    }

    await admin.from("notifications").insert({
      sector: "recepcao",
      tipo: "atendimento",
      titulo: `Novo comentário no ${origem === "instagram" ? "Instagram" : "Facebook"}`,
      mensagem: comentario.texto?.slice(0, 140) ?? "Comentário sem texto.",
      link: "/admin/leads",
    });

    return NextResponse.json({ ok: true, comentario: true, lead_id: novoLead?.id ?? null });
  }

  const extracted = extractContact(payload, params.platform);

  // Sem identificador de contato nem conteúdo → evento sem mensagem (ex.: status
  // de entrega/leitura do WhatsApp). Confirma e sai, sem criar nada.
  if (!extracted.contactId && !extracted.mensagem) {
    return NextResponse.json({ ok: true, ignored: true, reason: "sem mensagem" });
  }

  const canal = CONVERSATION_CHANNELS[params.platform];

  // Canais sem inbox (tiktok): mantém o comportamento antigo (cria lead simples).
  if (!canal) {
    await admin.from("leads").insert({
      nome: extracted.nome || `Lead ${origem}`,
      telefone: extracted.telefone,
      origem,
      mensagem: extracted.mensagem,
      external_id: extracted.contactId,
      raw_payload: payload,
      stage: "novo",
    });
    await notifyRecepcao(admin, origem, extracted.mensagem);
    return NextResponse.json({ ok: true, lead_only: true });
  }

  const contactId = extracted.contactId ?? extracted.telefone ?? "desconhecido";

  // 1) Acha-ou-cria a CONVERSA por (canal, external_id do contato) e, no
  //    WhatsApp oficial, também pelo NÚMERO que recebeu.
  //
  // Com dois números cadastrados, ignorar o `channel_id` juntava numa
  // conversa só o cliente que escreve para os dois — e a resposta saía
  // pelo número errado. Instagram/Messenger continuam sem esse filtro:
  // lá não há linha em `atendimento_channels`, o `channel_id` é sempre
  // nulo, e filtrar por ele não acharia conversa nenhuma.
  let buscaConv = admin
    .from("conversations")
    .select("id, lead_id, channel_id")
    .eq("canal", canal)
    .eq("external_id", contactId);
  if (canalCloud) buscaConv = buscaConv.eq("channel_id", canalCloud.id);
  const { data: achadas } = await buscaConv
    .order("last_message_at", { ascending: false, nullsFirst: false })
    .limit(1);
  let existingConv = achadas?.[0] ?? null;

  // Conversa ANTIGA, de antes de existir canal cadastrado: `channel_id`
  // nulo. Ela precisa ser adotada, não duplicada — senão o histórico do
  // cliente se parte em duas no dia em que o canal foi criado.
  if (!existingConv && canalCloud) {
    const { data: orfas } = await admin
      .from("conversations")
      .select("id, lead_id, channel_id")
      .eq("canal", canal)
      .eq("external_id", contactId)
      .is("channel_id", null)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(1);
    existingConv = orfas?.[0] ?? null;
  }

  let conversationId = existingConv?.id ?? null;
  let leadId = existingConv?.lead_id ?? null;

  // Conversa antiga (de antes de existir canal cadastrado) ganha o vínculo
  // na primeira mensagem nova. Sem ele o despacho de saída cai no "qualquer
  // canal conectado do mesmo tipo" — o que, com dois números, responde pelo
  // errado. Só preenche quando está vazio: nunca sequestra a conversa de um
  // canal para outro.
  if (conversationId && canalCloud && !existingConv?.channel_id) {
    await admin
      .from("conversations")
      .update({ channel_id: canalCloud.id })
      .eq("id", conversationId);
  }

  if (!conversationId) {
    // 2) Dedupe do LEAD: no WhatsApp casa pelo telefone; senão cria um novo.
    if (extracted.telefone) {
      const { data: lead } = await admin
        .from("leads")
        .select("id")
        .or(`whatsapp.eq.${extracted.telefone},telefone.eq.${extracted.telefone}`)
        .limit(1)
        .maybeSingle();
      leadId = lead?.id ?? null;
    }
    if (!leadId) {
      const nomeLead = extracted.nome || `Contato ${origem}`;
      const { data: novoLead } = await admin
        .from("leads")
        .insert({
          nome: nomeLead,
          telefone: extracted.telefone,
          whatsapp: canal === "whatsapp" ? extracted.telefone : null,
          origem,
          mensagem: extracted.mensagem,
          external_id: contactId,
          raw_payload: payload,
          stage: "novo",
        })
        .select("id")
        .single();
      leadId = novoLead?.id ?? null;

      // Webhook `contato_criado` — o dedupe não achou ninguém, é gente nova.
      if (leadId) {
        emitirContatoCriado(admin, {
          id: leadId,
          nome: nomeLead,
          telefone: extracted.telefone,
          origem,
        });
      }
    }

    const { data: novaConv } = await admin
      .from("conversations")
      .insert({
        canal,
        external_id: contactId,
        lead_id: leadId,
        // Amarra a conversa ao número que recebeu — é o que faz a resposta
        // sair pelo mesmo canal, e não por qualquer WhatsApp conectado.
        channel_id: canalCloud?.id ?? null,
        contato_nome: extracted.nome,
        contato_telefone: extracted.telefone,
        // `setor_responsavel` NÃO é mais escrito: até a migração 0040 ele
        // decidia quem via a conversa (pelo setor do CRM). Agora quem decide
        // é `triada_em` + a fila, e deixar "recepcao" gravado aqui só faria
        // o próximo leitor achar que o roteamento passa pelo setor.
        status: "aberta",
      })
      .select("id")
      .single();
    conversationId = novaConv?.id ?? null;

    // Webhook `conversa_criada` — só neste ramo, que é o nascimento.
    if (conversationId) {
      emitirConversaCriada(admin, {
        id: conversationId,
        canal,
        status: "aberta",
        contato_nome: extracted.nome,
        contato_telefone: extracted.telefone,
        lead_id: leadId,
      });
    }
  }

  if (!conversationId) {
    return NextResponse.json({ error: "falha ao abrir conversa" }, { status: 500 });
  }

  // 3) Grava a MENSAGEM (dedupe por external_id — a Meta reentrega webhooks).
  if (extracted.messageId) {
    const { data: dup } = await admin
      .from("messages")
      .select("id")
      .eq("external_id", extracted.messageId)
      .maybeSingle();
    if (dup) return NextResponse.json({ ok: true, duplicate: true });
  }

  const { data: msgCriada } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "in",
      remetente: "cliente",
      tipo: extracted.tipo,
      conteudo: extracted.mensagem,
      media_url: extracted.mediaUrl,
      external_id: extracted.messageId,
      raw_payload: payload,
      status: "recebida",
    })
    // id/created_at servem só para identificar a mensagem no payload.
    .select("id, created_at")
    .maybeSingle();

  // Webhook `mensagem_criada`. `raw_payload` (o envelope cru da Meta) e a
  // assinatura HMAC ficam de fora — nada disso é assunto do integrador.
  emitirMensagemCriada(
    admin,
    {
      id: conversationId,
      canal,
      status: "aberta",
      contato_nome: extracted.nome,
      contato_telefone: extracted.telefone,
      lead_id: leadId,
    },
    {
      id: (msgCriada?.id as string) ?? null,
      direcao: "in",
      remetente: "cliente",
      tipo: extracted.tipo,
      texto: extracted.mensagem,
      criada_em: (msgCriada?.created_at as string) ?? null,
    },
  );

  // Mantém o lead "vivo" no funil.
  if (leadId) {
    await admin.from("leads").update({ ultima_interacao_em: new Date().toISOString() }).eq("id", leadId);
  }

  await notifyRecepcao(admin, origem, extracted.mensagem);

  // Automações cadastradas na tela de Regras (boas-vindas, roteamento,
  // etiquetagem). Nunca lança — webhook precisa responder 200.
  const automacao = await dispararAutomacoes(admin, conversationId, {
    conversaNova: !existingConv,
    conteudo: extracted.mensagem,
    direcao: "in",
    interna: false,
  });

  return NextResponse.json({
    ok: true,
    conversation_id: conversationId,
    automacoes: automacao.regrasDisparadas,
  });
}

async function notifyRecepcao(
  admin: ReturnType<typeof createSupabaseAdmin>,
  origem: string,
  mensagem: string | null,
) {
  await admin.from("notifications").insert({
    sector: "recepcao",
    tipo: "atendimento",
    titulo: `Nova mensagem via ${origem}`,
    mensagem: mensagem?.slice(0, 140) ?? "Nova mensagem recebida.",
    link: "/admin/atendimento",
  });
}

/**
 * Comentário em post do Instagram ou da Página do Facebook.
 *
 * Os dois formatos são diferentes o bastante para não valer generalizar:
 *   · Instagram → changes[].field = "comments", value = { id, text,
 *     from: { id, username }, media: { id } }
 *   · Facebook  → changes[].field = "feed", value = { item: "comment",
 *     verb: "add", comment_id, message, from: { id, name }, post_id }
 *
 * Só `verb: "add"` interessa: "edited", "remove" e "hide" não são gente
 * nova chegando. No Instagram não existe `verb` — cada evento é um
 * comentário novo, e a repetição é tratada pelo dedupe do id.
 *
 * Devolve `null` para qualquer outro payload (inclusive mensagem), o que
 * mantém o fluxo de conversa exatamente como era.
 */
function extrairComentario(
  payload: Record<string, unknown>,
  platform: string,
): {
  id: string;
  autorId: string | null;
  autorNome: string | null;
  texto: string | null;
  postId: string | null;
  contaId: string | null;
} | null {
  if (platform !== "instagram" && platform !== "facebook" && platform !== "messenger") return null;
  try {
    const entry = (payload.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
    if (!entry) return null;
    const contaId = typeof entry.id === "string" ? entry.id : null;
    const change = (entry.changes as unknown[])?.[0] as Record<string, unknown> | undefined;
    if (!change) return null;
    const field = change.field as string | undefined;
    const value = (change.value ?? {}) as Record<string, unknown>;
    const from = (value.from ?? {}) as Record<string, unknown>;

    if (field === "comments") {
      const id = (value.id as string) ?? null;
      if (!id) return null;
      const username = from.username as string | undefined;
      return {
        id,
        autorId: (from.id as string) ?? null,
        autorNome: username ? `@${username}` : null,
        texto: (value.text as string) ?? null,
        postId: ((value.media as Record<string, unknown>)?.id as string) ?? null,
        contaId,
      };
    }

    if (field === "feed" && value.item === "comment" && value.verb === "add") {
      const id = (value.comment_id as string) ?? null;
      if (!id) return null;
      return {
        id,
        autorId: (from.id as string) ?? null,
        autorNome: (from.name as string) ?? null,
        texto: (value.message as string) ?? null,
        postId: (value.post_id as string) ?? null,
        contaId,
      };
    }

    return null;
  } catch {
    return null;
  }
}

function extractContact(payload: Record<string, unknown>, platform: string): {
  nome: string | null;
  telefone: string | null;
  mensagem: string | null;
  contactId: string | null; // identificador do contato (chaveia a conversa)
  messageId: string | null; // id da mensagem (dedupe)
  tipo: MessageTipo;
  mediaUrl: string | null;
} {
  const result = {
    nome: null as string | null,
    telefone: null as string | null,
    mensagem: null as string | null,
    contactId: null as string | null,
    messageId: null as string | null,
    tipo: "texto" as MessageTipo,
    mediaUrl: null as string | null,
  };
  try {
    if (platform === "whatsapp") {
      // WhatsApp Cloud API: entry[].changes[].value.{contacts,messages}
      const entry = (payload.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
      const change = (entry?.changes as unknown[])?.[0] as Record<string, unknown> | undefined;
      const value = change?.value as Record<string, unknown> | undefined;
      const contact = (value?.contacts as unknown[])?.[0] as Record<string, unknown> | undefined;
      const message = (value?.messages as unknown[])?.[0] as Record<string, unknown> | undefined;
      result.nome = ((contact?.profile as Record<string, unknown>)?.name as string) ?? null;
      result.telefone = (contact?.wa_id as string) ?? (message?.from as string) ?? null;
      result.contactId = (contact?.wa_id as string) ?? (message?.from as string) ?? null;
      result.messageId = (message?.id as string) ?? null;
      const mtype = (message?.type as string) ?? "text";
      if (mtype === "text") {
        result.mensagem = ((message?.text as Record<string, unknown>)?.body as string) ?? null;
      } else {
        result.tipo = mapWaType(mtype);
        const caption = (message?.[mtype] as Record<string, unknown>)?.caption as string | undefined;
        result.mensagem = caption ?? null;
      }
    } else {
      // Meta (Instagram/Facebook/Messenger): entry[].messaging[].{sender,message}
      const entry = (payload.entry as unknown[])?.[0] as Record<string, unknown> | undefined;
      const messaging = (entry?.messaging as unknown[])?.[0] as Record<string, unknown> | undefined;
      const sender = messaging?.sender as Record<string, unknown> | undefined;
      const message = messaging?.message as Record<string, unknown> | undefined;
      result.contactId = (sender?.id as string) ?? null;
      result.messageId = (message?.mid as string) ?? null;
      result.mensagem = (message?.text as string) ?? null;
    }
  } catch {
    // mantém os campos nulos; o payload bruto fica salvo
  }
  return result;
}

function mapWaType(t: string): MessageTipo {
  switch (t) {
    case "image": return "imagem";
    case "audio":
    case "voice": return "audio";
    case "video": return "video";
    case "document": return "documento";
    default: return "texto";
  }
}
