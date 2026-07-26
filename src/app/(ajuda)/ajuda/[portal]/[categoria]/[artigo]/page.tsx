// =====================================================================
// Página do artigo — o destino final de quase todo visitante do portal.
//
// Layout em duas colunas no desktop (corpo + sumário fixo) e uma coluna no
// celular, com o sumário virando um <details> recolhido: numa tela pequena,
// um índice aberto empurraria o texto para baixo da dobra.
// =====================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { markdownParaHtml } from "@/app/atendimento/ajuda/markdown";
import { CartaoArtigo } from "@/components/ajuda/CartaoArtigo";
import { RegistroVisualizacao } from "@/components/ajuda/RegistroVisualizacao";
import { Trilha } from "@/components/ajuda/Trilha";
import { VotoArtigo } from "@/components/ajuda/VotoArtigo";
import {
  carregarArtigo,
  carregarCategoria,
  carregarPortal,
  carregarRelacionados,
  formatarData,
} from "@/components/ajuda/dados";
import {
  aplicarAncoras,
  extrairSumario,
  rebaixarTitulos,
} from "@/components/ajuda/sumario";

export const revalidate = 300;

interface Props {
  params: { portal: string; categoria: string; artigo: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const portal = await carregarPortal(params.portal);
  if (!portal) return { title: "Central de Ajuda" };

  const categoria = await carregarCategoria(portal.id, params.categoria);
  if (!categoria) return { title: `Central de Ajuda — ${portal.nome}` };

  const artigo = await carregarArtigo(
    portal.id,
    categoria.id,
    categoria.slug,
    params.artigo,
  );
  if (!artigo) return { title: `Central de Ajuda — ${portal.nome}` };

  const descricao =
    artigo.resumo?.trim() ||
    // Sem resumo, usamos o começo do texto: melhor que a descrição genérica
    // do portal na busca do Google.
    (artigo.conteudo ?? "")
      .replace(/[#*`>_-]/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 155) ||
    `Artigo de ajuda de ${portal.nome}.`;

  return {
    title: `${artigo.titulo} — ${portal.nome}`,
    description: descricao,
    openGraph: {
      title: artigo.titulo,
      description: descricao,
      type: "article",
      publishedTime: artigo.publishedAt ?? undefined,
    },
  };
}

export default async function PaginaArtigo({ params }: Props) {
  const portal = await carregarPortal(params.portal);
  if (!portal) notFound();

  const categoria = await carregarCategoria(portal.id, params.categoria);
  if (!categoria) notFound();

  const artigo = await carregarArtigo(
    portal.id,
    categoria.id,
    categoria.slug,
    params.artigo,
  );
  if (!artigo) notFound();

  const relacionados = await carregarRelacionados(
    portal.id,
    categoria.id,
    categoria.slug,
    artigo.id,
    4,
  );

  const sumario = extrairSumario(artigo.conteudo);
  // O markdown compartilhado já escapa tudo do autor antes de gerar HTML —
  // por isso o dangerouslySetInnerHTML abaixo é seguro. `aplicarAncoras` só
  // acrescenta ids que nós mesmos geramos (slug a-z0-9-).
  const html = rebaixarTitulos(
    aplicarAncoras(markdownParaHtml(artigo.conteudo ?? ""), sumario),
  );
  const data = formatarData(artigo.publishedAt);
  const base = `/ajuda/${portal.slug}`;

  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6 sm:py-14">
      <Trilha
        passos={[
          { rotulo: "Central de Ajuda", href: base },
          { rotulo: categoria.nome, href: `${base}/${categoria.slug}` },
          { rotulo: artigo.titulo },
        ]}
      />

      <div className="lg:flex lg:items-start lg:gap-12">
        {/* --------------------------- Corpo --------------------------- */}
        {/* max-w-[72ch]: medida de linha confortável para leitura longa. */}
        <article className="min-w-0 flex-1 lg:max-w-[72ch]">
          <header className="border-b border-border pb-6">
            <h1 className="text-3xl font-semibold leading-tight tracking-tight text-foreground sm:text-4xl">
              {artigo.titulo}
            </h1>
            {artigo.resumo && (
              <p className="mt-3 text-lg leading-relaxed text-muted-foreground">
                {artigo.resumo}
              </p>
            )}
            <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground/80">
              {artigo.autorNome && <span>Por {artigo.autorNome}</span>}
              {artigo.autorNome && data && <span aria-hidden>·</span>}
              {data && (
                <span>
                  Publicado em{" "}
                  <time dateTime={artigo.publishedAt ?? undefined}>{data}</time>
                </span>
              )}
            </p>
          </header>

          {/* Sumário recolhido — só no celular/tablet. */}
          {sumario.length > 1 && (
            <details className="mt-6 rounded-xl border border-border bg-muted/30 p-4 lg:hidden">
              <summary className="cursor-pointer text-sm font-medium text-foreground">
                Neste artigo ({sumario.length})
              </summary>
              <ul className="mt-3 space-y-2">
                {sumario.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="text-sm text-muted-foreground hover:underline hover:underline-offset-4"
                    >
                      {item.texto}
                    </a>
                  </li>
                ))}
              </ul>
            </details>
          )}

          <div
            className="ajuda-prose mt-6 text-foreground"
            dangerouslySetInnerHTML={{ __html: html }}
          />

          <VotoArtigo
            portalSlug={portal.slug}
            articleId={artigo.id}
            corDestaque={portal.corDestaque}
          />

          {relacionados.length > 0 && (
            <section aria-labelledby="titulo-relacionados" className="mt-12">
              <h2
                id="titulo-relacionados"
                className="text-lg font-semibold tracking-tight text-foreground"
              >
                Artigos relacionados
              </h2>
              <ul className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                {relacionados.map((rel) => (
                  <CartaoArtigo
                    key={rel.id}
                    portalSlug={portal.slug}
                    artigo={rel}
                    mostrarData={false}
                  />
                ))}
              </ul>
            </section>
          )}
        </article>

        {/* -------------------------- Sumário -------------------------- */}
        {sumario.length > 1 && (
          <aside className="hidden w-60 shrink-0 lg:block">
            {/* top-24 acompanha o cabeçalho fixo do layout. */}
            <nav
              aria-labelledby="titulo-sumario"
              className="sticky top-24 max-h-[calc(100vh-8rem)] overflow-y-auto border-l border-border pl-5"
            >
              <h2
                id="titulo-sumario"
                className="text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                Neste artigo
              </h2>
              <ul className="mt-3 space-y-2.5">
                {sumario.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      className="block text-sm leading-snug text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {item.texto}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}
      </div>

      {/* Não renderiza nada: só dispara a contagem uma vez por sessão. */}
      <RegistroVisualizacao portalSlug={portal.slug} articleId={artigo.id} />
    </div>
  );
}
