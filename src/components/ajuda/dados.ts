// =====================================================================
// Camada de dados do PORTAL PÚBLICO da Central de Ajuda.
//
// Por que `createSupabaseAdmin()` num site sem login: a RLS de
// `atendimento_articles` (migração 0035) exige `fn_has_atendimento(auth.uid())`,
// ou seja, um usuário logado no Atendimento. O visitante do portal não tem
// sessão nenhuma, então nenhuma leitura passaria. Usamos a service role para
// atravessar a RLS, mas TODA consulta aqui filtra explicitamente por
// `status = 'publicado'` e `portal.ativo` — o "portão" que a RLS não pode
// fazer por nós passa a ser responsabilidade deste arquivo. Nada além do que
// é público deve sair daqui (sem autor_id cru, sem rascunhos, sem tokens).
//
// Todas as funções são embrulhadas em `cache()` do React para deduplicar a
// mesma consulta entre layout e page dentro de um único render — sem isso o
// portal seria buscado 2x em cada página.
// =====================================================================

import { cache } from "react";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { corSegura } from "./cores";

// ---------------------------------------------------------------------
// Tipos públicos (locais: `src/lib/types.ts` é intocável e estas formas
// só interessam ao portal).
// ---------------------------------------------------------------------

export interface PortalPublico {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  idioma: string;
  metaTitulo: string | null;
  metaDescricao: string | null;
  logoUrl: string | null;
  /** Cor de marca já validada — segura para ir em `style` inline. */
  corDestaque: string;
  mostrarBusca: boolean;
  rodapeTexto: string | null;
}

export interface CategoriaPublica {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  icone: string | null;
  ordem: number;
  /** Quantidade de artigos PUBLICADOS (o visitante não pode contar rascunho). */
  totalArtigos: number;
}

export interface ArtigoResumo {
  id: string;
  titulo: string;
  slug: string;
  resumo: string | null;
  visualizacoes: number;
  publishedAt: string | null;
  categoriaId: string | null;
  /** Preenchido só quando precisamos montar o link completo (mais lidos/busca). */
  categoriaSlug: string | null;
}

export interface ArtigoCompleto extends ArtigoResumo {
  conteudo: string | null;
  autorNome: string | null;
}

// ---------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------

/** Data em pt-BR sem depender de locale do servidor. */
export function formatarData(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Sao_Paulo",
  }).format(d);
}

/**
 * Escapa o que o usuário digitou antes de ir para um `ilike`.
 * `%` e `_` são curingas do SQL e `,` quebra a sintaxe do `.or()` do
 * PostgREST — sem isso uma busca por "100%" viraria um filtro maluco.
 */
function termoSeguroParaIlike(termo: string): string {
  return termo.replace(/[%_\\]/g, "\\$&").replace(/[,()]/g, " ").trim();
}

// ---------------------------------------------------------------------
// Consultas
// ---------------------------------------------------------------------

export const carregarPortal = cache(
  async (slug: string): Promise<PortalPublico | null> => {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from("atendimento_portals")
      .select(
        "id, nome, slug, descricao, idioma, ativo, meta_titulo, meta_descricao, logo_url, cor, cor_destaque, mostrar_busca, rodape_html",
      )
      .eq("slug", slug)
      // Portal desativado simplesmente não existe para o público.
      .eq("ativo", true)
      .maybeSingle();

    if (!data) return null;

    return {
      id: data.id as string,
      nome: (data.nome as string) ?? "",
      slug: data.slug as string,
      descricao: (data.descricao as string | null) ?? null,
      idioma: (data.idioma as string | null) ?? "pt-BR",
      metaTitulo: (data.meta_titulo as string | null) ?? null,
      metaDescricao: (data.meta_descricao as string | null) ?? null,
      logoUrl: (data.logo_url as string | null) ?? null,
      // `cor_destaque` é a cor de marca da onda G; `cor` é a legada do 0032.
      corDestaque: corSegura(
        (data.cor_destaque as string | null) ?? (data.cor as string | null),
      ),
      mostrarBusca: (data.mostrar_busca as boolean | null) ?? true,
      rodapeTexto: (data.rodape_html as string | null) ?? null,
    };
  },
);

/**
 * Categorias do portal já com a contagem de artigos publicados.
 * Fazemos a contagem em memória (uma query extra só com `category_id`) em vez
 * de N subconsultas: um portal tem dezenas de artigos, não milhões.
 */
export const carregarCategorias = cache(
  async (portalId: string): Promise<CategoriaPublica[]> => {
    const supabase = createSupabaseAdmin();

    const [{ data: categorias }, { data: artigos }] = await Promise.all([
      supabase
        .from("atendimento_categories")
        .select("id, nome, slug, descricao, icone, ordem")
        .eq("portal_id", portalId)
        .order("ordem", { ascending: true })
        .order("nome", { ascending: true }),
      supabase
        .from("atendimento_articles")
        .select("category_id")
        .eq("portal_id", portalId)
        .eq("status", "publicado"),
    ]);

    const contagem = new Map<string, number>();
    for (const a of artigos ?? []) {
      const id = a.category_id as string | null;
      if (id) contagem.set(id, (contagem.get(id) ?? 0) + 1);
    }

    return (categorias ?? []).map((c) => ({
      id: c.id as string,
      nome: (c.nome as string) ?? "",
      slug: c.slug as string,
      descricao: (c.descricao as string | null) ?? null,
      icone: (c.icone as string | null) ?? null,
      ordem: (c.ordem as number | null) ?? 0,
      totalArtigos: contagem.get(c.id as string) ?? 0,
    }));
  },
);

/** Mapa id → slug de categoria, para montar URLs de artigos "soltos". */
const mapaCategorias = cache(
  async (portalId: string): Promise<Map<string, string>> => {
    const cats = await carregarCategorias(portalId);
    return new Map(cats.map((c) => [c.id, c.slug]));
  },
);

const SELECT_RESUMO =
  "id, titulo, slug, resumo, visualizacoes, published_at, category_id";

function paraResumo(
  linha: Record<string, unknown>,
  slugPorCategoria: Map<string, string>,
): ArtigoResumo {
  const categoriaId = (linha.category_id as string | null) ?? null;
  return {
    id: linha.id as string,
    titulo: (linha.titulo as string) ?? "",
    slug: linha.slug as string,
    resumo: (linha.resumo as string | null) ?? null,
    visualizacoes: (linha.visualizacoes as number | null) ?? 0,
    publishedAt: (linha.published_at as string | null) ?? null,
    categoriaId,
    categoriaSlug: categoriaId ? slugPorCategoria.get(categoriaId) ?? null : null,
  };
}

export const carregarMaisLidos = cache(
  async (portalId: string, limite = 6): Promise<ArtigoResumo[]> => {
    const supabase = createSupabaseAdmin();
    const [{ data }, slugs] = await Promise.all([
      supabase
        .from("atendimento_articles")
        .select(SELECT_RESUMO)
        .eq("portal_id", portalId)
        .eq("status", "publicado")
        .order("visualizacoes", { ascending: false })
        .order("published_at", { ascending: false, nullsFirst: false })
        .limit(limite),
      mapaCategorias(portalId),
    ]);
    // Artigo sem categoria não tem URL canônica no portal — some da vitrine.
    return (data ?? [])
      .map((l) => paraResumo(l as Record<string, unknown>, slugs))
      .filter((a) => a.categoriaSlug);
  },
);

export const carregarCategoria = cache(
  async (portalId: string, slug: string): Promise<CategoriaPublica | null> => {
    const cats = await carregarCategorias(portalId);
    return cats.find((c) => c.slug === slug) ?? null;
  },
);

export const carregarArtigosDaCategoria = cache(
  async (
    portalId: string,
    categoriaId: string,
    categoriaSlug: string,
  ): Promise<ArtigoResumo[]> => {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from("atendimento_articles")
      .select(SELECT_RESUMO)
      .eq("portal_id", portalId)
      .eq("category_id", categoriaId)
      .eq("status", "publicado")
      // `ordem` é a curadoria manual do admin; empate cai na data.
      .order("ordem", { ascending: true })
      .order("published_at", { ascending: false, nullsFirst: false });

    const slugs = new Map([[categoriaId, categoriaSlug]]);
    return (data ?? []).map((l) => paraResumo(l as Record<string, unknown>, slugs));
  },
);

export const carregarArtigo = cache(
  async (
    portalId: string,
    categoriaId: string,
    categoriaSlug: string,
    artigoSlug: string,
  ): Promise<ArtigoCompleto | null> => {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from("atendimento_articles")
      .select(`${SELECT_RESUMO}, conteudo, autor_id`)
      .eq("portal_id", portalId)
      .eq("category_id", categoriaId)
      .eq("status", "publicado")
      .eq("slug", artigoSlug)
      .maybeSingle();

    if (!data) return null;

    // Buscamos só o NOME do autor, em consulta separada: assim nenhum outro
    // campo de `profiles` (e-mail, setor, flags) chega perto do HTML público.
    let autorNome: string | null = null;
    const autorId = (data.autor_id as string | null) ?? null;
    if (autorId) {
      const { data: perfil } = await supabase
        .from("profiles")
        .select("nome")
        .eq("id", autorId)
        .maybeSingle();
      autorNome = (perfil?.nome as string | null) ?? null;
    }

    const base = paraResumo(
      data as Record<string, unknown>,
      new Map([[categoriaId, categoriaSlug]]),
    );
    return { ...base, conteudo: (data.conteudo as string | null) ?? null, autorNome };
  },
);

export const carregarRelacionados = cache(
  async (
    portalId: string,
    categoriaId: string,
    categoriaSlug: string,
    excluirId: string,
    limite = 4,
  ): Promise<ArtigoResumo[]> => {
    const supabase = createSupabaseAdmin();
    const { data } = await supabase
      .from("atendimento_articles")
      .select(SELECT_RESUMO)
      .eq("portal_id", portalId)
      .eq("category_id", categoriaId)
      .eq("status", "publicado")
      .neq("id", excluirId)
      .order("visualizacoes", { ascending: false })
      .limit(limite);

    const slugs = new Map([[categoriaId, categoriaSlug]]);
    return (data ?? []).map((l) => paraResumo(l as Record<string, unknown>, slugs));
  },
);

export const buscarArtigos = cache(
  async (portalId: string, termo: string): Promise<ArtigoResumo[]> => {
    const t = termoSeguroParaIlike(termo);
    if (t.length < 2) return [];

    const supabase = createSupabaseAdmin();
    const [{ data }, slugs] = await Promise.all([
      supabase
        .from("atendimento_articles")
        .select(`${SELECT_RESUMO}, conteudo`)
        .eq("portal_id", portalId)
        .eq("status", "publicado")
        .or(`titulo.ilike.%${t}%,resumo.ilike.%${t}%,conteudo.ilike.%${t}%`)
        .order("visualizacoes", { ascending: false })
        .limit(50),
      mapaCategorias(portalId),
    ]);

    return (data ?? [])
      .map((linha) => {
        const l = linha as Record<string, unknown>;
        const base = paraResumo(l, slugs);
        // Reaproveitamos `resumo` como o trecho a exibir: se o termo não está
        // no resumo, mostramos o pedaço do conteúdo onde ele aparece.
        const conteudo = (l.conteudo as string | null) ?? "";
        const noResumo = (base.resumo ?? "").toLowerCase().includes(termo.toLowerCase());
        return {
          ...base,
          resumo: noResumo ? base.resumo : trechoAoRedor(conteudo, termo) ?? base.resumo,
        };
      })
      .filter((a) => a.categoriaSlug);
  },
);

/** Recorta ~220 caracteres em volta da 1ª ocorrência do termo no texto. */
function trechoAoRedor(texto: string, termo: string): string | null {
  if (!texto || !termo) return null;
  const limpo = texto.replace(/[#*`>]/g, "").replace(/\s+/g, " ").trim();
  const pos = limpo.toLowerCase().indexOf(termo.toLowerCase());
  if (pos < 0) return limpo.slice(0, 220) || null;
  const ini = Math.max(0, pos - 80);
  const fim = Math.min(limpo.length, pos + termo.length + 140);
  return `${ini > 0 ? "…" : ""}${limpo.slice(ini, fim)}${fim < limpo.length ? "…" : ""}`;
}
