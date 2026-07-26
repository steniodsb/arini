// =====================================================================
// Página de categoria: lista os artigos publicados daquela categoria.
// =====================================================================

import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CartaoArtigo } from "@/components/ajuda/CartaoArtigo";
import { IconeCategoria } from "@/components/ajuda/IconeCategoria";
import { Trilha } from "@/components/ajuda/Trilha";
import {
  carregarArtigosDaCategoria,
  carregarCategoria,
  carregarPortal,
} from "@/components/ajuda/dados";

export const revalidate = 300;

interface Props {
  params: { portal: string; categoria: string };
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const portal = await carregarPortal(params.portal);
  if (!portal) return { title: "Central de Ajuda" };

  const categoria = await carregarCategoria(portal.id, params.categoria);
  if (!categoria) return { title: `Central de Ajuda — ${portal.nome}` };

  return {
    title: `${categoria.nome} — Central de Ajuda ${portal.nome}`,
    description:
      categoria.descricao?.trim() ||
      `Artigos de ajuda sobre ${categoria.nome} na Central de Ajuda ${portal.nome}.`,
  };
}

export default async function PaginaCategoria({ params }: Props) {
  const portal = await carregarPortal(params.portal);
  if (!portal) notFound();

  const categoria = await carregarCategoria(portal.id, params.categoria);
  if (!categoria) notFound();

  const artigos = await carregarArtigosDaCategoria(
    portal.id,
    categoria.id,
    categoria.slug,
  );

  const base = `/ajuda/${portal.slug}`;

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <Trilha
        passos={[
          { rotulo: "Central de Ajuda", href: base },
          { rotulo: categoria.nome },
        ]}
      />

      <header className="flex items-start gap-4">
        <span
          className="mt-0.5 inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-xl"
          style={{
            backgroundColor: `${portal.corDestaque}1f`,
            color: "var(--ajuda-link)",
          }}
        >
          <IconeCategoria icone={categoria.icone} tamanho={24} />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-foreground sm:text-3xl">
            {categoria.nome}
          </h1>
          {categoria.descricao && (
            <p className="mt-2 max-w-2xl text-base leading-relaxed text-muted-foreground">
              {categoria.descricao}
            </p>
          )}
          <p className="mt-2 text-sm text-muted-foreground/80">
            {artigos.length} {artigos.length === 1 ? "artigo" : "artigos"}
          </p>
        </div>
      </header>

      {artigos.length === 0 ? (
        <p className="mt-10 rounded-xl border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
          Ainda não há artigos publicados nesta categoria.
        </p>
      ) : (
        <ul className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {artigos.map((artigo) => (
            <CartaoArtigo key={artigo.id} portalSlug={portal.slug} artigo={artigo} />
          ))}
        </ul>
      )}
    </div>
  );
}
