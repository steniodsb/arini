import crypto from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dispararAutomacoes } from "@/lib/atendimento/triggers";
import {
  emitirContatoCriado,
  emitirConversaCriada,
  emitirMensagemCriada,
} from "@/lib/atendimento/webhook-eventos";
import type { ConversationChannel, MessageTipo } from "@/lib/types";

// =====================================================================
// Entrada de mensagem — o miolo compartilhado dos webhooks novos
// (e-mail, SMS e API genérica).
//
// POR QUE EXISTE: o webhook da Evolution já fazia esta sequência inteira
// (acha-ou-cria conversa → acha-ou-cria lead → grava mensagem → dedupe →
// denormaliza o inbox → notifica a recepção → dispara automações). Três
// canais novos repetindo isso à mão seriam três lugares para a regra
// divergir — e a que mais dói de divergir é o dedupe do contato, que
// quando erra JUNTA clientes diferentes na mesma ficha.
//
// A Evolution e o Telegram continuam com o código deles (são arquivos de
// outro agente); daqui para frente é este módulo que carrega a regra.
//
// O que NÃO está aqui de propósito: extrair conteúdo do payload. Cada
// provedor tem o seu formato e essa tradução mora na rota do webhook.
// =====================================================================

export type EntradaMensagem = {
  canal: ConversationChannel;
  channelId: string;

  /**
   * Chave da thread NAQUELE canal (o índice único é `canal + external_id`).
   * E-mail: o endereço do cliente. SMS: o número. API: o contatoId.
   */
  externalIdConversa: string;

  /**
   * Conversa já resolvida por outro caminho (no e-mail, pelo Message-ID
   * do In-Reply-To). Quando vem preenchido, pulamos a busca por
   * external_id — é justamente o caso em que o cliente respondeu de
   * OUTRO endereço e só o threading sabe onde encaixar.
   */
  conversaId?: string | null;

  /** Id da mensagem no provedor — usado para não gravar duas vezes. */
  externalIdMensagem?: string | null;

  nome?: string | null;
  telefone?: string | null;
  email?: string | null;

  /** Chave de dedupe do lead, ex.: "email:fulano@empresa.com". */
  leadExternalId: string;

  texto: string | null;
  tipo?: MessageTipo;
  mediaUrl?: string | null;
  mediaNome?: string | null;
  mediaMime?: string | null;

  rawPayload: Record<string, unknown>;

  /** Título do sino da recepção ("Novo e-mail", "Novo SMS"...). */
  tituloNotificacao: string;

  /**
   * Campos extras gravados em conversations.custom_attributes (mesclados,
   * não sobrescritos). É onde o e-mail guarda o assunto da thread.
   */
  atributos?: Record<string, string | number | boolean | null>;
};

/** Colunas da conversa que este módulo precisa reler antes de atualizar. */
type ConversaExistente = {
  id: string;
  lead_id: string | null;
  unread_count: number;
  custom_attributes: Record<string, unknown> | null;
};

export type ResultadoEntrada =
  | {
      ok: true;
      conversationId: string;
      duplicada: boolean;
      automacoes: number;
      /** Contato bloqueado: a mensagem foi descartada de propósito. */
      bloqueada?: boolean;
    }
  | { ok: false; erro: string };

/** Compara segredo em tempo constante (mesma regra do webhook da Evolution). */
export function segredoConfere(recebido: string | null, esperado: string): boolean {
  if (!recebido) return false;
  const limpo = recebido.replace(/^Bearer\s+/i, "").trim();
  const a = Buffer.from(limpo);
  const b = Buffer.from(esperado);
  // Comprimento diferente já elimina — timingSafeEqual exige buffers iguais.
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Lê o segredo do canal de qualquer um dos lugares em que um provedor
 * consegue colocá-lo. Nem todo serviço de e-mail/SMS permite header
 * personalizado no webhook; alguns só deixam pôr querystring na URL.
 * Por isso aceitamos os três — a URL com segredo continua sendo secreta.
 */
export function segredoDaRequisicao(req: Request): string | null {
  return (
    req.headers.get("authorization") ||
    req.headers.get("x-arini-secret") ||
    new URL(req.url).searchParams.get("secret")
  );
}

type CanalWebhook = {
  id: string;
  canal: string;
  provedor: string;
  config: Record<string, string | undefined>;
};

/**
 * Acha o canal e confere o segredo de uma vez só — os três webhooks novos
 * começam exatamente igual.
 *
 * O canal vem por `?canal=<id>` na URL (que o próprio sistema mostra na
 * tela de configuração). Isso é conveniência, NÃO autenticação: quem
 * garante a autenticidade é o `webhook_secret`, comparado em tempo
 * constante. Sem segredo cadastrado a rota recusa — uma URL pública sem
 * prova nenhuma deixaria qualquer um injetar mensagem falsa no inbox.
 */
export async function autenticarCanalWebhook(
  admin: SupabaseClient,
  req: Request,
  provedor: string,
  /** Fallback quando a URL não traz `?canal=`: casa por um campo da config. */
  buscaAlternativa?: { chaveConfig: string; valor: string | null },
): Promise<{ ok: true; canal: CanalWebhook } | { ok: false; status: number; erro: string }> {
  const canalId = new URL(req.url).searchParams.get("canal");

  let query = admin
    .from("atendimento_channels")
    .select("id, canal, provedor, config")
    .eq("provedor", provedor);

  if (canalId) {
    query = query.eq("id", canalId);
  } else if (buscaAlternativa?.valor) {
    query = query.eq(`config->>${buscaAlternativa.chaveConfig}`, buscaAlternativa.valor);
  } else {
    return { ok: false, status: 400, erro: "canal não informado (use ?canal=<id> na URL)" };
  }

  const { data } = await query.maybeSingle();
  const canal = data as CanalWebhook | null;
  if (!canal) return { ok: false, status: 404, erro: "canal desconhecido" };

  const esperado = canal.config.webhook_secret;
  if (!esperado) {
    return {
      ok: false,
      status: 401,
      erro: "canal sem segredo de webhook — gere um em Configurações › Canal por API",
    };
  }
  if (!segredoConfere(segredoDaRequisicao(req), esperado)) {
    return { ok: false, status: 401, erro: "não autorizado" };
  }

  return { ok: true, canal };
}

/**
 * Grava uma mensagem de ENTRADA e deixa o inbox coerente.
 * Nunca lança: devolve `{ ok:false, erro }` para o webhook responder algo
 * inteligível em vez de estourar 500 (e o provedor ficar reentregando).
 */
/**
 * O contato está bloqueado? Procura na mesma ordem do dedupe de lead:
 * external_id (chave nossa, exata) → e-mail → telefone. Qualquer falha de
 * consulta devolve `false` — na dúvida, é melhor deixar a mensagem entrar
 * do que perdê-la por causa de um erro de rede.
 */
async function contatoBloqueado(
  admin: SupabaseClient,
  chaves: { leadExternalId?: string | null; telefone: string | null; email: string | null },
): Promise<boolean> {
  const { leadExternalId, telefone, email } = chaves;
  try {
    const buscas: { coluna: string; valor: string }[] = [];
    if (leadExternalId) buscas.push({ coluna: "external_id", valor: leadExternalId });
    if (email) buscas.push({ coluna: "email", valor: email });
    if (telefone) {
      buscas.push({ coluna: "whatsapp", valor: telefone });
      buscas.push({ coluna: "telefone", valor: telefone });
    }
    for (const { coluna, valor } of buscas) {
      const { data } = await admin
        .from("leads")
        .select("bloqueado")
        .eq(coluna, valor)
        .limit(1)
        .maybeSingle();
      if (data) return (data as { bloqueado?: boolean }).bloqueado === true;
    }
  } catch {
    // Consulta falhou — não é motivo para descartar a mensagem do cliente.
  }
  return false;
}

export async function registrarMensagemEntrada(
  admin: SupabaseClient,
  entrada: EntradaMensagem,
): Promise<ResultadoEntrada> {
  const {
    canal,
    channelId,
    externalIdConversa,
    externalIdMensagem,
    leadExternalId,
    texto,
    rawPayload,
    tituloNotificacao,
  } = entrada;

  const tipo: MessageTipo = entrada.tipo ?? "texto";
  const nome = entrada.nome?.trim() || null;
  const telefone = entrada.telefone?.trim() || null;
  const email = entrada.email?.trim().toLowerCase() || null;

  // ---- 0) Dedupe da mensagem -----------------------------------------
  // Provedor que não recebe 200 reentrega o mesmo evento; sem isso a
  // conversa enche de mensagens repetidas.
  if (externalIdMensagem) {
    const { data: dup } = await admin
      .from("messages")
      .select("id, conversation_id")
      .eq("external_id", externalIdMensagem)
      .maybeSingle();
    if (dup) {
      return {
        ok: true,
        conversationId: (dup as { conversation_id?: string }).conversation_id ?? "",
        duplicada: true,
        automacoes: 0,
      };
    }
  }

  // ---- 0.5) Contato bloqueado -----------------------------------------
  // `leads.bloqueado` existia desde a 0031, mas nenhum webhook o checava:
  // bloquear alguém era só uma marcação decorativa e a mensagem entrava na
  // caixa do mesmo jeito. A checagem mora aqui porque este é o miolo
  // compartilhado — cobre WhatsApp, e-mail, SMS e o canal por API de uma
  // vez. Descartamos em silêncio e devolvemos ok: o provedor não pode ver
  // diferença entre bloqueado e entregue, senão vira canal de sondagem.
  if (await contatoBloqueado(admin, { leadExternalId, telefone, email })) {
    return { ok: true, conversationId: "", duplicada: false, bloqueada: true, automacoes: 0 };
  }

  // ---- 1) Acha-ou-cria a conversa ------------------------------------
  let convExistente: ConversaExistente | null = null;

  if (entrada.conversaId) {
    const { data } = await admin
      .from("conversations")
      .select("id, lead_id, unread_count, custom_attributes")
      .eq("id", entrada.conversaId)
      .maybeSingle();
    convExistente = (data as ConversaExistente | null) ?? null;
  }
  if (!convExistente) {
    const { data } = await admin
      .from("conversations")
      .select("id, lead_id, unread_count, custom_attributes")
      .eq("canal", canal)
      .eq("external_id", externalIdConversa)
      .maybeSingle();
    convExistente = (data as ConversaExistente | null) ?? null;
  }

  let conversationId = convExistente?.id;
  let leadId = convExistente?.lead_id ?? null;

  if (!conversationId) {
    // ---- 2) Dedupe do contato antes de criar lead novo ---------------
    // Ordem: external_id (chave nossa, sempre exata) → e-mail → telefone.
    // Casar por nome NUNCA: "João Silva" existe aos montes.
    const { data: porExterno } = await admin
      .from("leads").select("id").eq("external_id", leadExternalId).limit(1).maybeSingle();
    leadId = (porExterno?.id as string) ?? null;

    if (!leadId && email) {
      const { data } = await admin
        .from("leads").select("id").ilike("email", email).limit(1).maybeSingle();
      leadId = (data?.id as string) ?? null;
    }
    if (!leadId && telefone) {
      const { data } = await admin
        .from("leads").select("id")
        .or(`whatsapp.eq.${telefone},telefone.eq.${telefone}`)
        .limit(1).maybeSingle();
      leadId = (data?.id as string) ?? null;
    }

    if (!leadId) {
      const nomeLead = nome || email || telefone || `Contato ${externalIdConversa}`;
      const { data: novoLead } = await admin
        .from("leads")
        .insert({
          nome: nomeLead,
          telefone,
          email,
          external_id: leadExternalId,
          // O enum lead_origin não tem 'email'/'sms'/'api' (mexer nele é
          // migração, fora do escopo). O canal real fica na conversa.
          origem: "outros",
          stage: "novo",
        })
        .select("id")
        .single();
      leadId = (novoLead?.id as string) ?? null;

      // Webhook `contato_criado`: só quando o dedupe acima falhou em achar
      // alguém, ou seja, quando a pessoa é mesmo nova no CRM.
      if (leadId) {
        emitirContatoCriado(admin, {
          id: leadId,
          nome: nomeLead,
          telefone,
          email,
          origem: "outros",
        });
      }
    }

    const { data: novaConv, error: convErr } = await admin
      .from("conversations")
      .insert({
        canal,
        external_id: externalIdConversa,
        channel_id: channelId,
        lead_id: leadId,
        contato_nome: nome,
        contato_telefone: telefone,
        setor_responsavel: "recepcao",
        status: "aberta",
        custom_attributes: entrada.atributos ?? {},
      })
      .select("id")
      .single();
    if (convErr || !novaConv) {
      return { ok: false, erro: convErr?.message ?? "falha ao abrir conversa" };
    }
    conversationId = novaConv.id as string;

    // Webhook `conversa_criada`: aqui e não no fim da função, porque é
    // exatamente este ramo que representa "a conversa nasceu".
    emitirConversaCriada(admin, {
      id: conversationId,
      canal,
      status: "aberta",
      contato_nome: nome,
      contato_telefone: telefone,
      lead_id: leadId,
    });
  }

  // ---- 3) Grava a mensagem -------------------------------------------
  const preview = texto?.slice(0, 140) ?? `[${tipo}]`;
  const { data: msgCriada, error: msgErr } = await admin
    .from("messages")
    .insert({
      conversation_id: conversationId,
      direcao: "in",
      remetente: "cliente",
      tipo,
      conteudo: texto,
      media_url: entrada.mediaUrl ?? null,
      media_nome: entrada.mediaNome ?? null,
      media_mime: entrada.mediaMime ?? null,
      external_id: externalIdMensagem ?? null,
      raw_payload: rawPayload,
      status: "recebida",
    })
    // Devolvemos o id/created_at só para o payload do webhook conseguir
    // identificar a mensagem do lado de fora.
    .select("id, created_at")
    .single();
  if (msgErr) return { ok: false, erro: msgErr.message };

  // Webhook `mensagem_criada`. `raw_payload` fica de fora de propósito —
  // ele carrega o corpo cru do provedor (e às vezes credencial dentro).
  emitirMensagemCriada(
    admin,
    {
      id: conversationId,
      canal,
      status: "aberta",
      contato_nome: nome ?? null,
      contato_telefone: telefone,
      lead_id: leadId,
    },
    {
      id: (msgCriada?.id as string) ?? null,
      direcao: "in",
      remetente: "cliente",
      tipo,
      texto,
      criada_em: (msgCriada?.created_at as string) ?? null,
    },
  );

  // ---- 4) Denormaliza o inbox ----------------------------------------
  // Mensagem do cliente sempre conta como não lida e reabre a conversa
  // adiada — o cliente respondeu, o caso voltou a ser urgente.
  const patch: Record<string, unknown> = {
    last_message_at: new Date().toISOString(),
    last_message_preview: preview,
    unread_count: (convExistente?.unread_count ?? 0) + 1,
    status: "aberta",
    snoozed_until: null,
  };
  if (nome) patch.contato_nome = nome;
  if (telefone) patch.contato_telefone = telefone;
  if (entrada.atributos && convExistente) {
    // Mescla: os atributos personalizados do agente não podem sumir só
    // porque chegou e-mail novo na thread.
    patch.custom_attributes = {
      ...(convExistente.custom_attributes ?? {}),
      ...entrada.atributos,
    };
  }
  await admin.from("conversations").update(patch).eq("id", conversationId);

  if (leadId) {
    await admin
      .from("leads")
      .update({ ultima_interacao_em: new Date().toISOString() })
      .eq("id", leadId);
  }

  // Sino da recepção — best-effort, não pode derrubar o recebimento.
  await admin
    .from("notifications")
    .insert({
      sector: "recepcao",
      tipo: "atendimento",
      titulo: tituloNotificacao,
      mensagem: preview,
      link: `/atendimento?c=${conversationId}`,
    })
    .then(undefined, () => undefined);

  // ---- 5) Automações --------------------------------------------------
  const automacao = await dispararAutomacoes(admin, conversationId, {
    conversaNova: !convExistente,
    conteudo: texto,
    direcao: "in",
    interna: false,
  });

  return {
    ok: true,
    conversationId,
    duplicada: false,
    automacoes: automacao.regrasDisparadas,
  };
}
