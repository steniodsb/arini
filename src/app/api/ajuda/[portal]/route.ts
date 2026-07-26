// =====================================================================
// API pública do portal de ajuda — /api/ajuda/[portal]
//
//   POST { acao: 'voto', articleId, util, comentario?, visitanteToken }
//   POST { acao: 'visualizacao', articleId }
//
// É a ÚNICA porta de escrita aberta a visitante anônimo em todo o sistema,
// então o desenho é defensivo:
//   - usa a service role (a RLS do 0035 exige usuário do Atendimento), mas
//     valida à mão que o artigo está PUBLICADO e pertence a um portal ATIVO
//     cujo slug bate com o da URL — nenhum id solto escreve em qualquer lugar;
//   - a resposta é sempre `{ ok: true }`, sem eco de dados do banco: um id
//     inexistente e um artigo de rascunho devolvem a mesma coisa, para não
//     virar oráculo de enumeração de conteúdo não publicado;
//   - rate limit em memória por token/artigo.
// =====================================================================

import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase/server";

// Escrita em banco: nunca deve ser cacheada nem pré-renderizada.
export const dynamic = "force-dynamic";

/** Resposta única de sucesso — sem nada do banco no corpo.
 *  É uma função (e não uma constante) porque o corpo de um NextResponse é um
 *  stream de uso único: reaproveitar a mesma instância entre requisições
 *  devolveria corpo vazio a partir da segunda. */
const respostaOk = () => NextResponse.json({ ok: true });

// ---------------------------------------------------------------------
// Rate limit simples em memória.
//
// Limitação assumida: o estado vive no processo. Em serverless com várias
// instâncias o teto efetivo é maior que o configurado. Mesmo assim vale a
// pena — segura o caso real (script rodando de um navegador só) sem exigir
// Redis. O abuso distribuído já é problema da borda (Vercel/Cloudflare).
// ---------------------------------------------------------------------

const JANELA_MS = 60_000;
const MAX_POR_JANELA = 20;
const carimbos = new Map<string, number[]>();

function excedeuLimite(chave: string): boolean {
  const agora = Date.now();
  const anteriores = (carimbos.get(chave) ?? []).filter((t) => agora - t < JANELA_MS);
  if (anteriores.length >= MAX_POR_JANELA) {
    carimbos.set(chave, anteriores);
    return true;
  }
  anteriores.push(agora);
  carimbos.set(chave, anteriores);

  // Poda preguiçosa: sem isso o Map cresceria indefinidamente com tokens
  // que apareceram uma vez e nunca mais voltaram.
  if (carimbos.size > 5_000) {
    for (const [k, v] of carimbos) {
      if (v.every((t) => agora - t >= JANELA_MS)) carimbos.delete(k);
    }
  }
  return false;
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface Corpo {
  acao?: string;
  articleId?: string;
  util?: boolean;
  comentario?: string;
  visitanteToken?: string;
}

/**
 * Confirma que o artigo é realmente público neste portal.
 * Devolve o id do artigo ou `null` — quem chama nunca vê o motivo da recusa.
 */
async function artigoPublico(
  supabase: ReturnType<typeof createSupabaseAdmin>,
  portalSlug: string,
  articleId: string,
): Promise<string | null> {
  const { data: portal } = await supabase
    .from("atendimento_portals")
    .select("id")
    .eq("slug", portalSlug)
    .eq("ativo", true)
    .maybeSingle();
  if (!portal) return null;

  const { data: artigo } = await supabase
    .from("atendimento_articles")
    .select("id")
    .eq("id", articleId)
    .eq("portal_id", portal.id as string)
    .eq("status", "publicado")
    .maybeSingle();

  return (artigo?.id as string | undefined) ?? null;
}

export async function POST(
  req: Request,
  { params }: { params: { portal: string } },
) {
  let corpo: Corpo;
  try {
    corpo = (await req.json()) as Corpo;
  } catch {
    return NextResponse.json({ error: "payload inválido" }, { status: 400 });
  }

  const acao = corpo.acao;
  const articleId = (corpo.articleId ?? "").trim();
  if (!UUID_RE.test(articleId)) {
    return NextResponse.json({ error: "artigo inválido" }, { status: 400 });
  }

  const supabase = createSupabaseAdmin();

  // ------------------------------------------------------------------
  // VISUALIZAÇÃO
  // ------------------------------------------------------------------
  if (acao === "visualizacao") {
    // Sem token nesta ação (o cliente já limita a 1 por sessão), então a
    // chave do rate limit é o próprio artigo — evita alguém inflar o
    // contador em loop a partir de uma aba aberta.
    if (excedeuLimite(`view:${articleId}`)) return respostaOk();

    const id = await artigoPublico(supabase, params.portal, articleId);
    if (!id) return respostaOk();

    // Ler-somar-escrever tem corrida entre requisições simultâneas e pode
    // perder uma contagem ou outra. É aceitável: isto é métrica de leitura,
    // não saldo — e a alternativa (função SQL de incremento atômico) exigiria
    // uma migração nova, que está fora do escopo desta entrega.
    const { data: atual } = await supabase
      .from("atendimento_articles")
      .select("visualizacoes")
      .eq("id", id)
      .maybeSingle();

    await supabase
      .from("atendimento_articles")
      .update({ visualizacoes: ((atual?.visualizacoes as number | null) ?? 0) + 1 })
      .eq("id", id);

    return respostaOk();
  }

  // ------------------------------------------------------------------
  // VOTO
  // ------------------------------------------------------------------
  if (acao === "voto") {
    if (typeof corpo.util !== "boolean") {
      return NextResponse.json({ error: "voto inválido" }, { status: 400 });
    }

    const token = (corpo.visitanteToken ?? "").trim().slice(0, 100);
    if (!token) {
      return NextResponse.json({ error: "token ausente" }, { status: 400 });
    }
    if (excedeuLimite(`voto:${token}`)) {
      return NextResponse.json({ error: "muitas tentativas" }, { status: 429 });
    }

    const id = await artigoPublico(supabase, params.portal, articleId);
    if (!id) return respostaOk();

    // Comentário é texto livre de anônimo: cortamos o tamanho aqui, no
    // servidor, porque o maxLength do textarea é só conveniência de UI.
    const comentario = (corpo.comentario ?? "").trim().slice(0, 1000) || null;

    const { data: existente } = await supabase
      .from("atendimento_article_votes")
      .select("id, comentario")
      .eq("article_id", id)
      .eq("visitante_token", token)
      .maybeSingle();

    if (existente) {
      // Duplicata: NÃO cria outro voto. Mas se o visitante clicou em 👎 e só
      // depois escreveu o comentário (dois POSTs, por desenho da UI),
      // completamos o registro que já existe em vez de perder o texto.
      if (comentario && !existente.comentario) {
        await supabase
          .from("atendimento_article_votes")
          .update({ comentario })
          .eq("id", existente.id as string);
      }
      return respostaOk();
    }

    await supabase.from("atendimento_article_votes").insert({
      article_id: id,
      util: corpo.util,
      comentario,
      // Só o token do navegador. IP e user-agent ficam de fora de propósito:
      // não precisamos identificar a pessoa para saber se o artigo ajudou.
      visitante_token: token,
    });

    return respostaOk();
  }

  return NextResponse.json({ error: "ação desconhecida" }, { status: 400 });
}
