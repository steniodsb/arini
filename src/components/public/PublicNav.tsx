"use client";

import Link from "next/link";
import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TYPE_NAV_GROUPS, CATEGORY_NAV } from "@/lib/types";

export function PublicNav() {
  const [openImoveis, setOpenImoveis] = useState(false);

  return (
    <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-arini">
      <Link href="/" className="hover:text-gold-dark transition-colors">Início</Link>

      {/* Dropdown Imóveis */}
      <div
        className="relative"
        onMouseEnter={() => setOpenImoveis(true)}
        onMouseLeave={() => setOpenImoveis(false)}
      >
        <button
          type="button"
          className="inline-flex items-center gap-1 hover:text-gold-dark transition-colors"
          onClick={() => setOpenImoveis((v) => !v)}
        >
          Imóveis <ChevronDown size={14} />
        </button>
        {openImoveis && (
          <div className="absolute left-0 top-full pt-2 z-50">
            <div className="bg-white rounded-md border shadow-lg min-w-[200px] py-2">
              <Link
                href="/imoveis"
                className="block px-4 py-2 text-sm hover:bg-muted text-arini"
              >
                Todos os imóveis
              </Link>
              <div className="my-1 border-t" />
              {TYPE_NAV_GROUPS.map((g) => {
                const param = g.types.length === 1
                  ? `type=${g.types[0]}`
                  : `types=${g.types.join(",")}`;
                return (
                  <Link
                    key={g.label}
                    href={`/imoveis?${param}`}
                    className="block px-4 py-2 text-sm hover:bg-muted text-arini"
                  >
                    {g.label}
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* Categorias diretas */}
      {CATEGORY_NAV.map((c) => (
        <Link
          key={c.key}
          href={`/imoveis?category=${c.key}`}
          className="hover:text-gold-dark transition-colors"
        >
          {c.label}
        </Link>
      ))}

      <Link href="/sobre" className="hover:text-gold-dark transition-colors">Sobre</Link>
      <Link href="/contato" className="hover:text-gold-dark transition-colors">Contato</Link>

      <Link
        href="/admin/login"
        className="ml-2 inline-flex items-center px-4 py-2 rounded-md btn-gold text-sm"
      >
        Área Interna
      </Link>
    </nav>
  );
}
