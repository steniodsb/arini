// Trilha de navegação (breadcrumb) do portal.
// `nav[aria-label]` + o `aria-current` no último item são o que faz o leitor
// de tela anunciar "você está aqui" — sem isso vira uma lista de links solta.

import Link from "next/link";
import { ChevronRight } from "lucide-react";

export interface PassoTrilha {
  rotulo: string;
  href?: string;
}

export function Trilha({ passos }: { passos: PassoTrilha[] }) {
  return (
    <nav aria-label="Trilha de navegação" className="mb-6">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-sm text-muted-foreground">
        {passos.map((passo, i) => {
          const ultimo = i === passos.length - 1;
          return (
            <li key={`${passo.rotulo}-${i}`} className="flex items-center gap-1.5">
              {i > 0 && <ChevronRight size={14} aria-hidden className="opacity-60" />}
              {passo.href && !ultimo ? (
                <Link
                  href={passo.href}
                  className="hover:underline hover:underline-offset-4"
                  style={{ color: "var(--ajuda-link)" }}
                >
                  {passo.rotulo}
                </Link>
              ) : (
                <span aria-current={ultimo ? "page" : undefined} className="text-foreground/70">
                  {passo.rotulo}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
