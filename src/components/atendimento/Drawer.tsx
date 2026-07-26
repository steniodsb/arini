"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

// Painel lateral que desliza da direita. Usamos no lugar de uma rota nova para
// o detalhe de contato/empresa: a lista continua montada atrás, então filtros,
// seleção e paginação sobrevivem a abrir/fechar um registro.
export function Drawer({
  aberto,
  onFechar,
  titulo,
  subtitulo,
  cabecalho,
  acoes,
  children,
  largura = "max-w-md",
}: {
  aberto: boolean;
  onFechar: () => void;
  titulo: string;
  subtitulo?: string;
  /** Bloco à esquerda do título (avatar, ícone). */
  cabecalho?: React.ReactNode;
  acoes?: React.ReactNode;
  children: React.ReactNode;
  largura?: string;
}) {
  useEffect(() => {
    if (!aberto) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onFechar();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [aberto, onFechar]);

  if (!aberto) return null;
  return (
    <div
      className="fixed inset-0 z-[85] flex justify-end bg-black/40 backdrop-blur-sm"
      onClick={onFechar}
    >
      <aside
        className={cn(
          "h-full w-full border-l bg-card text-card-foreground shadow-2xl flex flex-col",
          largura,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        <header className="px-4 py-3 border-b flex items-center gap-3 shrink-0">
          {cabecalho}
          <div className="min-w-0 flex-1">
            <h2 className="text-sm font-semibold truncate">{titulo}</h2>
            {subtitulo && <p className="text-xs text-muted-foreground truncate">{subtitulo}</p>}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {acoes}
            <button
              type="button"
              onClick={onFechar}
              aria-label="Fechar"
              className="p-1 rounded text-muted-foreground hover:bg-muted"
            >
              <X size={16} />
            </button>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto">{children}</div>
      </aside>
    </div>
  );
}

/** Bloco de seção do drawer (título discreto + conteúdo). */
export function DrawerSection({
  titulo,
  acoes,
  children,
}: {
  titulo: string;
  acoes?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="p-4 border-b last:border-b-0">
      <div className="flex items-center justify-between gap-2 mb-2">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {titulo}
        </h3>
        {acoes}
      </div>
      {children}
    </section>
  );
}

/** Linha rótulo → valor usada nos blocos de dados. */
export function DrawerRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-xs py-0.5">
      <span className="text-muted-foreground w-28 shrink-0">{label}</span>
      <span className="min-w-0 flex-1 break-words">{children}</span>
    </div>
  );
}
