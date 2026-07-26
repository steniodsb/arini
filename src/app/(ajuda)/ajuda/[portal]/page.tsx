// =====================================================================
// Home do portal público: hero + busca, grade de categorias e mais lidos.
// =====================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { CartaoArtigo } from "@/components/ajuda/CartaoArtigo";
import { IconeCategoria } from "@/components/ajuda/IconeCategoria";
import { corDeTextoSobre } from "@/components/ajuda/cores";
import {
  carregarCategorias,
  carregarMaisLidos,
  carregarPortal,
} from "@/components/ajuda/dados";

// Conteúdo de ajuda muda pouco e é lido muito: 5 min de cache tira o banco
// do caminho da maioria das visitas sem deixar o artigo velho por horas.
export const revalidate = 300;

export async function generateMetadata({
  params,
}: {
  params: { portal: string };
}): Promise<Metadata> {
  const portal = await carregarPortal(params.portal);
  if (!portal) return { title: "Central de Ajuda" };

  const titulo = portal.metaTitulo?.trim() || `Central de Ajuda — ${portal.nome}`;
  const descricao =
    portal.metaDescricao?.trim() ||
    portal.descricao?.trim() ||
    `Tire suas dúvidas sobre ${portal.nome}.`;

  return {
    title: titulo,
    description: descricao,
    openGraph: { title: titulo, description: descricao, type: "website" },
  };
}

export default async function HomePortal({
  params,
}: {
  params: { portal: string };
}) {
  const portal = await carregarPortal(params.portal);
  if (!portal) notFound();

  const [categorias, maisLidos] = await Promise.all([
    carregarCategorias(portal.id),
    carregarMaisLidos(portal.id, 6),
  ]);

  // Categoria sem nenhum artigo publicado seria um beco sem saída para o
  // visitante — escondemos até alguém publicar algo nela.
  const categoriasVisiveis = categorias.filter((c) => c.totalArtigos > 0);
  const base = `/ajuda/${portal.slug}`;
  const textoNaMarca = corDeTextoSobre(portal.corDestaque);

  return (
    <>
      {/* ---------------------------------------------------------- */}
      {/* Hero: o degradê usa a cor de marca com alfa, então precisa  */}
      {/* de style inline (valor de runtime).                        */}
      {/* ---------------------------------------------------------- */}
      <section className="border-b border-border bg-muted/30">
        <div className="mx-auto max-w-5xl px-4 py-14 text-center sm:px-6 sm:py-20">
          <h1 className="text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            Como podemos ajudar?
          </h1>
          {portal.descricao && (
            <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {portal.descricao}
            </p>
          )}

          {portal.mostrarBusca && (
            <form
              action={`${base}/busca`}
              method="get"
              role="search"
              className="relative mx-auto mt-8 max-w-xl"
            >
              <Search
                size={18}
                aria-hidden
                className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                name="q"
                placeholder="Descreva sua dúvida…"
                aria-label="Buscar artigos na Central de Ajuda"
                className="h-14 w-full rounded-full border border-border bg-background pl-12 pr-28 text-base text-foreground shadow-sm placeholder:text-muted-foreground"
              />
              <button
                type="submit"
                className="absolute right-2 top-2 h-10 rounded-full px-5 text-sm font-medium transition-opacity hover:opacity-90"
                style={{ backgroundColor: portal.corDestaque, color: textoNaMarca }}
              >
                Buscar
              </button>
            </form>
          )}
        </div>
      </section>

      <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6 sm:py-16">
        {/* ------------------------- Categorias ------------------------- */}
        <section aria-labelledby="titulo-categorias">
          <h2
            id="titulo-categorias"
            className="text-xl font-semibold tracking-tight text-foreground"
          >
            Categorias
          </h2>

          {categoriasVisiveis.length === 0 ? (
            <p className="mt-4 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
              Ainda não há artigos publicados nesta Central de Ajuda.
            </p>
          ) : (
            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {categoriasVisiveis.map((categoria) => (
                <li key={categoria.id}>
                  <Link
                    href={`${base}/${categoria.slug}`}
                    className="flex h-full flex-col rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-muted/40"
                  >
                    <span
                      className="mb-3 inline-flex h-11 w-11 items-center justify-center rounded-lg"
                      style={{
                        // 12% da cor de marca como fundo do "chip" do ícone:
                        // funciona nos dois temas sem precisar de variante.
                        backgroundColor: `${portal.corDestaque}1f`,
                        color: "var(--ajuda-link)",
                      }}
                    >
                      <IconeCategoria icone={categoria.icone} tamanho={22} />
                    </span>
                    <span className="text-base font-semibold text-foreground">
                      {categoria.nome}
                    </span>
                    {categoria.descricao && (
                      <span className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted-foreground">
                        {categoria.descricao}
                      </span>
                    )}
                    <span className="mt-4 text-xs text-muted-foreground/80">
                      {categoria.totalArtigos}{" "}
                      {categoria.totalArtigos === 1 ? "artigo" : "artigos"}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ------------------------ Mais lidos ------------------------ */}
        {maisLidos.length > 0 && (
          <section aria-labelledby="titulo-mais-lidos" className="mt-14">
            <h2
              id="titulo-mais-lidos"
              className="text-xl font-semibold tracking-tight text-foreground"
            >
              Artigos mais lidos
            </h2>
            <ul className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {maisLidos.map((artigo) => (
                <CartaoArtigo
                  key={artigo.id}
                  portalSlug={portal.slug}
                  artigo={artigo}
                  mostrarData={false}
                />
              ))}
            </ul>
          </section>
        )}
      </div>
    </>
  );
}
