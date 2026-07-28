// =====================================================================
// Resultados da busca — /ajuda/[portal]/busca?q=…
//
// O segmento estático `busca` tem precedência sobre `[categoria]` no Next,
// então esta rota nunca vai colidir com uma categoria de slug "busca".
// =====================================================================

import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Search } from "lucide-react";
import { CartaoArtigo } from "@/components/ajuda/CartaoArtigo";
import { corDeTextoSobre } from "@/components/ajuda/cores";
import { buscarArtigos, carregarPortal } from "@/components/ajuda/dados";

export const revalidate = 300;

interface Props {
  params: { portal: string };
  searchParams: { q?: string | string[] };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const portal = await carregarPortal(params.portal);
  return {
    title: portal
      ? `Busca — Central de Ajuda ${portal.nome}`
      : "Busca — Central de Ajuda",
    // Página de resultado não deve entrar no índice do Google: gera conteúdo
    // duplicado e URLs infinitas a partir da query string.
    robots: { index: false, follow: true },
  };
}

export default async function PaginaBusca({ params, searchParams }: Props) {
  const portal = await carregarPortal(params.portal);
  if (!portal) notFound();

  const bruto = searchParams.q;
  const termo = (Array.isArray(bruto) ? bruto[0] : bruto ?? "").trim().slice(0, 120);
  const curto = termo.length > 0 && termo.length < 2;
  const resultados = termo.length >= 2 ? await buscarArtigos(portal.id, termo) : [];

  const base = `/ajuda/${portal.slug}`;
  const textoNaMarca = corDeTextoSobre(portal.corDestaque);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
        Resultados da busca
      </h1>

      {/* Campo repetido aqui (além do cabeçalho) para refinar o termo sem
          precisar voltar ao topo — é o gesto mais comum depois de uma busca
          que não achou o que se queria. */}
      <form action={`${base}/busca`} method="get" role="search" className="relative mt-5">
        <Search
          size={18}
          aria-hidden
          className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground"
        />
        <input
          type="search"
          name="q"
          defaultValue={termo}
          placeholder="Descreva sua dúvida…"
          aria-label="Buscar artigos na Central de Ajuda"
          className="h-12 w-full rounded-full border border-border bg-background pl-12 pr-24 text-base text-foreground placeholder:text-muted-foreground"
        />
        <button
          type="submit"
          className="absolute right-1.5 top-1.5 h-9 rounded-full px-4 text-sm font-medium transition-opacity hover:opacity-90"
          style={{ backgroundColor: portal.corDestaque, color: textoNaMarca }}
        >
          Buscar
        </button>
      </form>

      {!termo ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Digite o que você procura para ver os artigos correspondentes.
        </p>
      ) : curto ? (
        <p className="mt-8 text-sm text-muted-foreground">
          Use pelo menos 2 caracteres na busca.
        </p>
      ) : resultados.length === 0 ? (
        // ------------------------ Estado vazio ------------------------
        <div className="mt-8 rounded-xl border border-dashed border-border p-8 text-center">
          <p className="text-base font-medium text-foreground">
            Não encontramos nada sobre “{termo}”.
          </p>
          <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted-foreground">
            Tente palavras mais simples ou com outra grafia. Se ainda assim não
            aparecer, fale com a gente — a dúvida vira artigo novo.
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              href="/contato"
              className="rounded-full px-5 py-2.5 text-sm font-medium transition-opacity hover:opacity-90"
              style={{ backgroundColor: portal.corDestaque, color: textoNaMarca }}
            >
              Falar com o atendimento
            </Link>
            <Link
              href={base}
              className="rounded-full border border-border px-5 py-2.5 text-sm text-muted-foreground hover:bg-muted"
            >
              Ver todas as categorias
            </Link>
          </div>
        </div>
      ) : (
        <>
          <p className="mt-6 text-sm text-muted-foreground">
            {resultados.length}{" "}
            {resultados.length === 1
              ? "artigo encontrado para"
              : "artigos encontrados para"}{" "}
            <span className="font-medium text-foreground">“{termo}”</span>
          </p>
          <ul className="mt-5 space-y-4">
            {resultados.map((artigo) => (
              <CartaoArtigo
                key={artigo.id}
                portalSlug={portal.slug}
                artigo={artigo}
                termo={termo}
                mostrarData={false}
              />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
