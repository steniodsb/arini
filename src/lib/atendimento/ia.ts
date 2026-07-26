import type { SupabaseClient } from "@supabase/supabase-js";
import type { IaSuggestionType } from "@/lib/types";

// =====================================================================
// IA do Atendimento — cliente da Messages API da Anthropic e os prompts
// do copiloto (sugerir resposta, resumir conversa, detectar intenção).
//
// Por que `fetch` direto e não o SDK: não queremos mexer no package.json
// para uma integração de três chamadas. A Messages API é HTTP simples.
//
// Módulo de SERVIDOR — usa a service role via `admin` e lê a chave do
// ambiente. Nunca importe isto de um componente client.
// =====================================================================

/** Cliente Supabase com service role (createSupabaseAdmin). */
type Admin = SupabaseClient;

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";

/** Modelo usado quando a caixa não tem `ia_modelo` gravado. */
export const MODELO_PADRAO = "claude-haiku-4-5-20251001";

/** Intenções aceitas pela triagem. O modelo NÃO pode inventar outras. */
export const INTENCOES = [
  "comprar",
  "alugar",
  "vender",
  "avaliar",
  "visita",
  "financiamento",
  "suporte",
  "outro",
] as const;
export type IaIntencao = (typeof INTENCOES)[number];

export const INTENCAO_LABELS: Record<IaIntencao, string> = {
  comprar: "Quer comprar",
  alugar: "Quer alugar",
  vender: "Quer vender",
  avaliar: "Quer avaliação",
  visita: "Quer agendar visita",
  financiamento: "Dúvida de financiamento",
  suporte: "Suporte / pós-venda",
  outro: "Outro",
};

/** Resultado de uma ação de IA. Nunca lança — sempre devolve este objeto. */
export type IaResultado =
  | { ok: true; conteudo: string; cacheada: boolean; modelo: string }
  | { ok: false; erro: string };

/** Há `ANTHROPIC_API_KEY` no ambiente? Sem ela, tudo responde 503. */
export function iaConfigurada(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

// ---------------------------------------------------------------------
// Chamada crua da Messages API
// ---------------------------------------------------------------------

export type ClaudeMensagem = { role: "user" | "assistant"; content: string };

/**
 * Faz uma chamada à Messages API. Nunca lança: erro de rede, timeout ou
 * status != 200 viram `{ ok: false, erro }` — a UI decide o que mostrar.
 */
export async function chamarClaude({
  modelo,
  system,
  messages,
  maxTokens = 1024,
}: {
  modelo: string;
  system: string;
  messages: ClaudeMensagem[];
  maxTokens?: number;
}): Promise<{ ok: true; texto: string } | { ok: false; erro: string }> {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) {
    return { ok: false, erro: "ANTHROPIC_API_KEY não configurada no ambiente." };
  }

  try {
    const resp = await fetch(ANTHROPIC_URL, {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": ANTHROPIC_VERSION,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: modelo,
        max_tokens: maxTokens,
        system,
        messages,
      }),
      // Atendente não pode ficar esperando: 30s e desiste.
      signal: AbortSignal.timeout(30_000),
    });

    if (!resp.ok) {
      // O corpo de erro da Anthropic é { error: { type, message } }.
      const bruto = await resp.text().catch(() => "");
      let detalhe = bruto.slice(0, 300);
      try {
        const j = JSON.parse(bruto) as { error?: { message?: string } };
        if (j.error?.message) detalhe = j.error.message;
      } catch {
        /* corpo não era JSON — usa o texto cru mesmo */
      }
      return { ok: false, erro: `Anthropic respondeu ${resp.status}: ${detalhe}` };
    }

    const data = (await resp.json()) as {
      content?: { type: string; text?: string }[];
      stop_reason?: string;
    };

    const texto = (data.content ?? [])
      .filter((b) => b.type === "text" && typeof b.text === "string")
      .map((b) => b.text as string)
      .join("\n")
      .trim();

    if (!texto) return { ok: false, erro: "A IA devolveu uma resposta vazia." };
    return { ok: true, texto };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    // AbortSignal.timeout dispara TimeoutError — vale traduzir para o atendente.
    if (/timeout|abort/i.test(msg)) {
      return { ok: false, erro: "A IA demorou mais de 30s para responder. Tente de novo." };
    }
    return { ok: false, erro: `Falha ao falar com a Anthropic: ${msg}` };
  }
}

// ---------------------------------------------------------------------
// Contexto da conversa
// ---------------------------------------------------------------------

type ConversaCtx = {
  conversationId: string;
  canal: string;
  contatoNome: string;
  etiquetas: string[];
  instrucoesCaixa: string;
  modelo: string;
  ultimaMensagemId: string | null;
  /** Transcrição já formatada ("Cliente: ..." / "Atendente: ..."). */
  transcricao: string;
  temMensagens: boolean;
};

/** Corta texto longo para não estourar contexto (e custo) à toa. */
function cortar(texto: string | null | undefined, max: number): string {
  const t = (texto ?? "").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max)}…`;
}

/**
 * Lê conversa, caixa e as últimas ~20 mensagens NÃO internas. Notas internas
 * ficam de fora de propósito: são conversa entre atendentes, não com o cliente.
 */
async function carregarContexto(
  admin: Admin,
  conversationId: string,
): Promise<{ ok: true; ctx: ConversaCtx } | { ok: false; erro: string }> {
  const { data: conversa, error: errConversa } = await admin
    .from("conversations")
    .select("id, canal, contato_nome, tags, inbox_id")
    .eq("id", conversationId)
    .single();

  if (errConversa || !conversa) {
    return { ok: false, erro: "Conversa não encontrada." };
  }

  let instrucoesCaixa = "";
  let modelo = MODELO_PADRAO;
  if (conversa.inbox_id) {
    const { data: caixa } = await admin
      .from("atendimento_inboxes")
      .select("ia_instrucoes, ia_modelo")
      .eq("id", conversa.inbox_id)
      .maybeSingle();
    if (caixa) {
      instrucoesCaixa = cortar(caixa.ia_instrucoes as string | null, 2000);
      if (caixa.ia_modelo) modelo = caixa.ia_modelo as string;
    }
  }

  // Mais recentes primeiro no banco, depois invertemos para ordem cronológica.
  const { data: msgs } = await admin
    .from("messages")
    .select("id, direcao, remetente, conteudo, tipo, created_at")
    .eq("conversation_id", conversationId)
    .eq("interna", false)
    .order("created_at", { ascending: false })
    .limit(20);

  const mensagens = [...(msgs ?? [])].reverse();
  const ultimaMensagemId = mensagens.length ? (mensagens[mensagens.length - 1].id as string) : null;

  const transcricao = mensagens
    .map((m) => {
      const quem =
        m.remetente === "cliente"
          ? "Cliente"
          : m.remetente === "ia"
            ? "IA"
            : m.remetente === "sistema"
              ? "Sistema"
              : "Atendente";
      const corpo =
        m.conteudo && String(m.conteudo).trim()
          ? cortar(String(m.conteudo), 1200)
          : `[${m.tipo ?? "mídia"} sem texto]`;
      return `${quem}: ${corpo}`;
    })
    .join("\n");

  return {
    ok: true,
    ctx: {
      conversationId,
      canal: (conversa.canal as string) ?? "desconhecido",
      contatoNome: (conversa.contato_nome as string | null)?.trim() || "Cliente sem nome cadastrado",
      etiquetas: (conversa.tags as string[] | null) ?? [],
      instrucoesCaixa,
      modelo,
      ultimaMensagemId,
      transcricao,
      temMensagens: mensagens.length > 0,
    },
  };
}

/** Respostas rápidas cadastradas — servem de referência de tom e conteúdo. */
async function carregarRespostasRapidas(admin: Admin): Promise<string> {
  const { data } = await admin
    .from("canned_responses")
    .select("atalho, titulo, conteudo")
    .order("atalho", { ascending: true })
    .limit(30);
  if (!data?.length) return "";
  return data
    .map((r) => `- /${r.atalho} (${r.titulo}): ${cortar(r.conteudo as string, 400)}`)
    .join("\n");
}

/** Base de conhecimento: só artigos PUBLICADOS da Central de Ajuda. */
async function carregarBaseConhecimento(admin: Admin): Promise<string> {
  const { data } = await admin
    .from("atendimento_articles")
    .select("titulo, resumo, conteudo")
    .eq("status", "publicado")
    .order("updated_at", { ascending: false })
    .limit(12);
  if (!data?.length) return "";
  return data
    .map((a) => {
      const corpo = cortar((a.conteudo as string | null) || (a.resumo as string | null), 1200);
      return `### ${a.titulo}\n${corpo || "(sem conteúdo)"}`;
    })
    .join("\n\n");
}

// ---------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------

/** Regras que valem para as três ações — o núcleo antialucinação. */
const REGRAS_BASE = `Você assiste a equipe de atendimento da Arini Negócios Imobiliários, uma imobiliária brasileira.
Escreva SEMPRE em português do Brasil.

REGRAS INEGOCIÁVEIS:
- NUNCA invente preço, valor de aluguel, condomínio, IPTU, endereço, metragem, número de quartos, disponibilidade, prazo ou condição de pagamento. Se o dado não estiver no contexto abaixo, não escreva o dado.
- Se faltar informação para responder com segurança, diga isso e sugira encaminhar a um corretor humano ("vou confirmar com o corretor responsável e te retorno").
- Não prometa nada em nome da empresa (desconto, reserva, exclusividade, aprovação de crédito).
- Não peça dados sensíveis (CPF completo, senha, dados de cartão) pelo canal de atendimento.`;

function blocoContexto(ctx: ConversaCtx, extras: { respostas?: string; artigos?: string }): string {
  const partes: string[] = [];
  partes.push(`## Dados da conversa
- Contato: ${ctx.contatoNome}
- Canal: ${ctx.canal}
- Etiquetas: ${ctx.etiquetas.length ? ctx.etiquetas.join(", ") : "nenhuma"}`);

  if (ctx.instrucoesCaixa) {
    partes.push(`## Instruções específicas desta caixa de entrada
${ctx.instrucoesCaixa}`);
  }
  if (extras.respostas) {
    partes.push(`## Respostas rápidas já aprovadas pela equipe (use o tom delas)
${extras.respostas}`);
  }
  if (extras.artigos) {
    partes.push(`## Base de conhecimento (artigos PUBLICADOS da Central de Ajuda)
Use SOMENTE o que está aqui como fonte de fatos sobre processos da imobiliária.

${extras.artigos}`);
  }
  return partes.join("\n\n");
}

// ---------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------

/**
 * Procura sugestão já gerada para a MESMA última mensagem e o mesmo tipo.
 * Se a conversa não mudou, gerar de novo é só queimar token.
 */
async function buscarCache(
  admin: Admin,
  conversationId: string,
  tipo: IaSuggestionType,
  baseadaEm: string | null,
): Promise<{ conteudo: string; modelo: string | null } | null> {
  let q = admin
    .from("atendimento_ia_sugestoes")
    .select("conteudo, modelo")
    .eq("conversation_id", conversationId)
    .eq("tipo", tipo)
    .order("created_at", { ascending: false })
    .limit(1);

  q = baseadaEm ? q.eq("baseada_em", baseadaEm) : q.is("baseada_em", null);

  const { data } = await q;
  const linha = data?.[0];
  if (!linha) return null;
  return { conteudo: linha.conteudo as string, modelo: (linha.modelo as string | null) ?? null };
}

/** Grava a sugestão gerada (também alimenta o bloco "Uso" da tela de IA). */
async function gravarSugestao(
  admin: Admin,
  conversationId: string,
  tipo: IaSuggestionType,
  conteudo: string,
  modelo: string,
  baseadaEm: string | null,
): Promise<void> {
  await admin.from("atendimento_ia_sugestoes").insert({
    conversation_id: conversationId,
    baseada_em: baseadaEm,
    tipo,
    conteudo,
    modelo,
  });
}

// ---------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------

/** Sugere uma resposta pronta para o atendente revisar e enviar. */
export async function sugerirResposta(
  admin: Admin,
  conversationId: string,
  opts: { forcar?: boolean } = {},
): Promise<IaResultado> {
  const base = await carregarContexto(admin, conversationId);
  if (!base.ok) return { ok: false, erro: base.erro };
  const { ctx } = base;

  if (!ctx.temMensagens) {
    return { ok: false, erro: "A conversa ainda não tem mensagens para a IA ler." };
  }

  if (!opts.forcar) {
    const cache = await buscarCache(admin, conversationId, "resposta", ctx.ultimaMensagemId);
    if (cache) {
      return { ok: true, conteudo: cache.conteudo, cacheada: true, modelo: cache.modelo ?? ctx.modelo };
    }
  }

  const [respostas, artigos] = await Promise.all([
    carregarRespostasRapidas(admin),
    carregarBaseConhecimento(admin),
  ]);

  const system = `${REGRAS_BASE}

Sua tarefa: escrever a PRÓXIMA mensagem que o atendente humano enviaria ao cliente.

Como escrever:
- Tom cordial e objetivo, de imobiliária séria. Sem formalidade exagerada, sem gíria, sem emoji em excesso (no máximo um).
- Direto ao ponto: 2 a 5 frases. Nada de introdução longa nem despedida protocolar.
- Trate o cliente pelo primeiro nome quando ele for conhecido.
- Se for preciso pedir alguma informação para avançar (bairro, faixa de valor, prazo), peça UMA coisa por vez.
- Se a dúvida não puder ser respondida com o contexto, escreva uma mensagem honesta dizendo que vai confirmar com o corretor.

Formato da saída: devolva SOMENTE o texto da mensagem, pronto para colar no campo de resposta. Sem aspas, sem "Sugestão:", sem markdown, sem assinatura.

${blocoContexto(ctx, { respostas, artigos })}`;

  const r = await chamarClaude({
    modelo: ctx.modelo,
    system,
    messages: [
      {
        role: "user",
        content: `Histórico recente da conversa (mais antigo primeiro):\n\n${ctx.transcricao}\n\nEscreva a próxima mensagem do atendente.`,
      },
    ],
    maxTokens: 900,
  });

  if (!r.ok) return { ok: false, erro: r.erro };

  await gravarSugestao(admin, conversationId, "resposta", r.texto, ctx.modelo, ctx.ultimaMensagemId);
  return { ok: true, conteudo: r.texto, cacheada: false, modelo: ctx.modelo };
}

/** Resume a conversa em 2–3 frases (útil quando alguém assume no meio). */
export async function resumirConversa(
  admin: Admin,
  conversationId: string,
  opts: { forcar?: boolean } = {},
): Promise<IaResultado> {
  const base = await carregarContexto(admin, conversationId);
  if (!base.ok) return { ok: false, erro: base.erro };
  const { ctx } = base;

  if (!ctx.temMensagens) {
    return { ok: false, erro: "A conversa ainda não tem mensagens para resumir." };
  }

  if (!opts.forcar) {
    const cache = await buscarCache(admin, conversationId, "resumo", ctx.ultimaMensagemId);
    if (cache) {
      return { ok: true, conteudo: cache.conteudo, cacheada: true, modelo: cache.modelo ?? ctx.modelo };
    }
  }

  const system = `${REGRAS_BASE}

Sua tarefa: resumir a conversa para um atendente que vai assumir agora e não leu nada.

Como escrever:
- 2 a 3 frases, em texto corrido. Sem tópicos, sem títulos, sem markdown.
- Diga o que o cliente quer, o que já foi combinado e qual é a pendência atual.
- Se algo estiver indefinido, escreva que está indefinido — não preencha lacuna com suposição.

Formato da saída: SOMENTE o resumo.

${blocoContexto(ctx, {})}`;

  const r = await chamarClaude({
    modelo: ctx.modelo,
    system,
    messages: [
      {
        role: "user",
        content: `Histórico recente da conversa (mais antigo primeiro):\n\n${ctx.transcricao}\n\nResuma.`,
      },
    ],
    maxTokens: 400,
  });

  if (!r.ok) return { ok: false, erro: r.erro };

  // O resumo fica na própria conversa para a lista/painel poder exibir.
  await admin.from("conversations").update({ ia_resumo: r.texto }).eq("id", conversationId);
  await gravarSugestao(admin, conversationId, "resumo", r.texto, ctx.modelo, ctx.ultimaMensagemId);

  return { ok: true, conteudo: r.texto, cacheada: false, modelo: ctx.modelo };
}

/** Classifica a intenção da conversa em uma das palavras de `INTENCOES`. */
export async function classificarIntencao(
  admin: Admin,
  conversationId: string,
  opts: { forcar?: boolean } = {},
): Promise<IaResultado> {
  const base = await carregarContexto(admin, conversationId);
  if (!base.ok) return { ok: false, erro: base.erro };
  const { ctx } = base;

  if (!ctx.temMensagens) {
    return { ok: false, erro: "A conversa ainda não tem mensagens para classificar." };
  }

  if (!opts.forcar) {
    const cache = await buscarCache(admin, conversationId, "intencao", ctx.ultimaMensagemId);
    if (cache) {
      return { ok: true, conteudo: cache.conteudo, cacheada: true, modelo: cache.modelo ?? ctx.modelo };
    }
  }

  const system = `${REGRAS_BASE}

Sua tarefa: classificar a intenção principal do cliente nesta conversa.

Escolha EXATAMENTE UMA destas palavras:
${INTENCOES.join(", ")}

Significado:
- comprar: quer adquirir um imóvel
- alugar: quer locar um imóvel
- vender: quer colocar um imóvel à venda com a imobiliária
- avaliar: quer saber quanto vale um imóvel
- visita: quer agendar/remarcar visita a um imóvel
- financiamento: dúvida sobre crédito, banco, entrada, parcelas
- suporte: cliente/inquilino já atendido com problema, cobrança, documento, manutenção
- outro: qualquer coisa que não caiba acima, ou conversa vaga demais para classificar

Formato da saída: responda SOMENTE com a palavra, em minúsculas, sem ponto final e sem nenhum outro texto.

${blocoContexto(ctx, {})}`;

  const r = await chamarClaude({
    modelo: ctx.modelo,
    system,
    messages: [
      {
        role: "user",
        content: `Histórico recente da conversa (mais antigo primeiro):\n\n${ctx.transcricao}\n\nQual a intenção?`,
      },
    ],
    maxTokens: 16,
  });

  if (!r.ok) return { ok: false, erro: r.erro };

  // Validação: o modelo pode responder com frase, acento ou pontuação.
  // Só aceitamos o que está na lista; qualquer outra coisa vira "outro".
  const bruto = r.texto
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z]/g, "");
  const intencao: IaIntencao =
    (INTENCOES as readonly string[]).includes(bruto) ? (bruto as IaIntencao) : "outro";

  await admin.from("conversations").update({ ia_intencao: intencao }).eq("id", conversationId);
  await gravarSugestao(admin, conversationId, "intencao", intencao, ctx.modelo, ctx.ultimaMensagemId);

  return { ok: true, conteudo: intencao, cacheada: false, modelo: ctx.modelo };
}
