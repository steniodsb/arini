// Item de lista de artigo — reaproveitado na categoria, nos "mais lidos",
// nos relacionados e na busca. Um componente só evita quatro cartões que
// divergem com o tempo.

import Link from "next/link";
import { formatarData, type ArtigoResumo } from "./dados";
import { destacarTermo } from "./destacar";

export function CartaoArtigo({
  portalSlug,
  artigo,
  termo,
  mostrarData = true,
}: {
  portalSlug: string;
  artigo: ArtigoResumo;
  /** Quando vem da busca, realça as ocorrências no título e no trecho. */
  termo?: string;
  mostrarData?: boolean;
}) {
  if (!artigo.categoriaSlug) return null;
  const data = mostrarData ? formatarData(artigo.publishedAt) : null;

  return (
    <li className="group">
      <Link
        href={`/ajuda/${portalSlug}/${artigo.categoriaSlug}/${artigo.slug}`}
        className="block rounded-xl border border-border bg-card p-5 transition-colors hover:border-foreground/20 hover:bg-muted/40"
      >
        <h3 className="text-base font-semibold leading-snug text-foreground">
          {termo ? destacarTermo(artigo.titulo, termo) : artigo.titulo}
        </h3>
        {artigo.resumo && (
          <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">
            {termo ? destacarTermo(artigo.resumo, termo) : artigo.resumo}
          </p>
        )}
        {data && (
          <p className="mt-3 text-xs text-muted-foreground/80">
            Publicado em {data}
          </p>
        )}
      </Link>
    </li>
  );
}
