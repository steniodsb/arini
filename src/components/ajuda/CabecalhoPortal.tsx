// =====================================================================
// Cabeçalho do portal público.
//
// É um Server Component de propósito: a busca é um <form method="get">
// comum, que funciona sem JavaScript e não custa bundle nenhum. Fazer disso
// um componente client só para chamar router.push seria pagar hidratação
// por uma navegação que o navegador já sabe fazer.
// =====================================================================

import Link from "next/link";
import { Search } from "lucide-react";
import type { PortalPublico } from "./dados";

export function CabecalhoPortal({
  portal,
  termoInicial = "",
}: {
  portal: PortalPublico;
  termoInicial?: string;
}) {
  const base = `/ajuda/${portal.slug}`;

  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/90 backdrop-blur supports-[backdrop-filter]:bg-background/75">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:px-6 sm:py-4">
        <Link
          href={base}
          className="flex shrink-0 items-center gap-3"
          aria-label={`Central de Ajuda ${portal.nome} — página inicial`}
        >
          {portal.logoUrl ? (
            // <img> em vez de next/image: `logo_url` é digitada pelo admin e
            // pode apontar para qualquer host — o next/image valida a lista
            // de domínios em tempo de build e retornaria 400 para um host
            // novo, deixando o portal sem logo até um redeploy.
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={portal.logoUrl}
              alt={portal.nome}
              className="h-9 w-auto max-w-[180px] object-contain"
            />
          ) : (
            <span
              className="text-lg font-semibold tracking-tight"
              style={{ color: "var(--ajuda-link)" }}
            >
              {portal.nome}
            </span>
          )}
          <span className="hidden text-sm text-muted-foreground sm:inline">
            Central de Ajuda
          </span>
        </Link>

        {portal.mostrarBusca && (
          <form
            action={`${base}/busca`}
            method="get"
            role="search"
            className="relative w-full sm:max-w-xs"
          >
            <Search
              size={16}
              aria-hidden
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              name="q"
              defaultValue={termoInicial}
              placeholder="Buscar na ajuda…"
              aria-label="Buscar artigos na Central de Ajuda"
              className="h-10 w-full rounded-full border border-border bg-muted/50 pl-9 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:bg-background"
            />
          </form>
        )}
      </div>
    </header>
  );
}
