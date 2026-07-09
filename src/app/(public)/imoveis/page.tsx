import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PropertyCard } from "@/components/public/PropertyCard";
import { PropertyFilterBar } from "@/components/public/PropertyFilterBar";
import { PageHero } from "@/components/public/PageHero";
import { type Property } from "@/lib/types";
import { getPublicGalleries } from "@/lib/publicMedia";

export const revalidate = 60;

// Quantos imóveis por página (grade de 3 colunas → 3 linhas cheias).
const PAGE_SIZE = 9;

interface SP { type?: string; types?: string; category?: string; cidade?: string; q?: string; min?: string; max?: string; page?: string; }

export default async function ImoveisPage({ searchParams }: { searchParams: SP }) {
  const supabase = createSupabaseServer();

  // Página atual (1-based), sanitizada.
  const page = Math.max(1, Number(searchParams.page) || 1);
  const from = (page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  let q = supabase
    .from("properties")
    .select("*", { count: "exact" })
    .eq("publicado_no_site", true);
  if (searchParams.types) {
    const arr = searchParams.types.split(",").map((s) => s.trim()).filter(Boolean);
    if (arr.length) q = q.in("type", arr);
  } else if (searchParams.type) {
    q = q.eq("type", searchParams.type);
  }
  if (searchParams.category) q = q.eq("category", searchParams.category);
  if (searchParams.cidade) q = q.ilike("cidade", `%${searchParams.cidade}%`);
  if (searchParams.q) q = q.or(`titulo.ilike.%${searchParams.q}%,bairro.ilike.%${searchParams.q}%,codigo.ilike.%${searchParams.q}%`);
  if (searchParams.min) q = q.gte("valor", Number(searchParams.min));
  if (searchParams.max) q = q.lte("valor", Number(searchParams.max));

  const { data: properties, count } = await q
    .order("created_at", { ascending: false })
    .range(from, to);
  const ids = (properties ?? []).map((p) => p.id);
  const galleriesByProp = await getPublicGalleries(supabase, ids);
  const list = (properties ?? []) as Property[];

  const total = count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  // Monta um href de página preservando os filtros atuais.
  function pageHref(target: number) {
    const params = new URLSearchParams();
    if (searchParams.q) params.set("q", searchParams.q);
    if (searchParams.type) params.set("type", searchParams.type);
    if (searchParams.types) params.set("types", searchParams.types);
    if (searchParams.category) params.set("category", searchParams.category);
    if (searchParams.cidade) params.set("cidade", searchParams.cidade);
    if (searchParams.min) params.set("min", searchParams.min);
    if (searchParams.max) params.set("max", searchParams.max);
    if (target > 1) params.set("page", String(target));
    const qs = params.toString();
    return qs ? `/imoveis?${qs}` : "/imoveis";
  }

  // Janela de páginas exibidas (no máx. 5 números ao redor da atual).
  const windowSize = 5;
  let start = Math.max(1, page - Math.floor(windowSize / 2));
  const end = Math.min(totalPages, start + windowSize - 1);
  start = Math.max(1, end - windowSize + 1);
  const pageNumbers = Array.from({ length: end - start + 1 }, (_, i) => start + i);

  return (
    <>
      <PageHero
        eyebrow="Nossa carteira"
        title={
          <>
            Veja nossos <span className="text-gold-gradient">imóveis</span>
          </>
        }
        subtitle="Casas, apartamentos, terrenos, loteamentos, ranchos e propriedades rurais com curadoria, transparência e documentação validada."
        bgImage="/hero-imoveis.jpg"
        size="md"
      />
    <div className="container py-12">
      <div className="mb-8">
        <PropertyFilterBar
          defaults={{
            q: searchParams.q,
            type: searchParams.type,
            category: searchParams.category,
            cidade: searchParams.cidade,
          }}
        />
      </div>

      {list.length === 0 ? (
        <div className="text-center py-20 border border-dashed rounded-lg">
          <p className="text-muted-foreground">Nenhum imóvel encontrado com esses filtros.</p>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between mb-6 text-sm text-muted-foreground">
            <span>
              {total} {total === 1 ? "imóvel encontrado" : "imóveis encontrados"}
            </span>
            <span>Página {page} de {totalPages}</span>
          </div>

          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {list.map((p) => (
              <PropertyCard key={p.id} property={p} coverUrl={p.foto_principal_url} images={galleriesByProp[p.id]} />
            ))}
          </div>

          {totalPages > 1 && (
            <nav className="mt-10 flex items-center justify-center gap-1.5" aria-label="Paginação">
              <PageLink
                href={pageHref(page - 1)}
                disabled={page <= 1}
                aria-label="Página anterior"
              >
                <ChevronLeft size={16} />
              </PageLink>

              {start > 1 && (
                <>
                  <PageLink href={pageHref(1)}>1</PageLink>
                  {start > 2 && <span className="px-1 text-muted-foreground">…</span>}
                </>
              )}

              {pageNumbers.map((n) => (
                <PageLink key={n} href={pageHref(n)} active={n === page}>
                  {n}
                </PageLink>
              ))}

              {end < totalPages && (
                <>
                  {end < totalPages - 1 && <span className="px-1 text-muted-foreground">…</span>}
                  <PageLink href={pageHref(totalPages)}>{totalPages}</PageLink>
                </>
              )}

              <PageLink
                href={pageHref(page + 1)}
                disabled={page >= totalPages}
                aria-label="Próxima página"
              >
                <ChevronRight size={16} />
              </PageLink>
            </nav>
          )}
        </>
      )}
    </div>
    </>
  );
}

function PageLink({
  href,
  active = false,
  disabled = false,
  children,
  ...rest
}: {
  href: string;
  active?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
} & React.AriaAttributes) {
  const base =
    "inline-flex items-center justify-center min-w-9 h-9 px-3 rounded-md border text-sm font-medium transition-colors";
  if (disabled) {
    return (
      <span
        {...rest}
        aria-disabled
        className={`${base} border-transparent text-muted-foreground/40 cursor-not-allowed`}
      >
        {children}
      </span>
    );
  }
  return (
    <Link
      {...rest}
      href={href}
      className={
        active
          ? `${base} border-gold bg-gold-gradient text-arini`
          : `${base} border-border bg-white text-arini hover:border-gold`
      }
    >
      {children}
    </Link>
  );
}
