"use client";

/**
 * Modal de VISUALIZAÇÃO — a espiada rápida antes de decidir abrir para editar.
 *
 * O CRM só tinha telas de edição: para conferir um dado era preciso entrar no
 * formulário completo, com risco de alterar sem querer e sem caminho de volta
 * barato. Aqui o registro é só leitura; editar é uma escolha explícita.
 *
 * No celular vira folha de baixo (bottom sheet), que é onde o polegar alcança.
 */

import { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { X, Pencil, ExternalLink } from "lucide-react";

export type CampoVisualizacao = {
  rotulo: string;
  valor: React.ReactNode;
  /** ocupa a linha inteira — para observações, endereço, descrição */
  largo?: boolean;
};

export function ModalVisualizacao({
  aberto,
  aoFechar,
  titulo,
  subtitulo,
  etiqueta,
  campos,
  hrefEdicao,
  rotuloEdicao = "Abrir e editar",
  extra,
}: {
  aberto: boolean;
  aoFechar: () => void;
  titulo: string;
  subtitulo?: React.ReactNode;
  /** selo de status, à direita do título */
  etiqueta?: React.ReactNode;
  campos: CampoVisualizacao[];
  hrefEdicao?: string;
  rotuloEdicao?: string;
  /** blocos livres embaixo dos campos (mídia, listas relacionadas…) */
  extra?: React.ReactNode;
}) {
  const caixaRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();

  // ESC fecha e a página de trás não rola junto
  useEffect(() => {
    if (!aberto) return;
    const aoTeclar = (e: KeyboardEvent) => { if (e.key === "Escape") aoFechar(); };
    document.addEventListener("keydown", aoTeclar);
    const overflowAntes = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // foco entra no diálogo, senão o teclado continua na tabela atrás
    const t = setTimeout(() => caixaRef.current?.focus(), 0);
    return () => {
      document.removeEventListener("keydown", aoTeclar);
      document.body.style.overflow = overflowAntes;
      clearTimeout(t);
    };
  }, [aberto, aoFechar]);

  if (!aberto || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby={tituloId}
    >
      <button
        type="button"
        aria-label="Fechar"
        onClick={aoFechar}
        className="absolute inset-0 bg-black/50 cursor-default"
      />
      <div
        ref={caixaRef}
        tabIndex={-1}
        className="relative bg-white w-full sm:max-w-2xl max-h-[88vh] flex flex-col
                   rounded-t-2xl sm:rounded-2xl shadow-2xl outline-none"
      >
        <div className="flex items-start gap-3 p-5 border-b">
          <div className="min-w-0 flex-1">
            <h2 id={tituloId} className="font-display text-xl text-arini leading-tight break-words">
              {titulo}
            </h2>
            {subtitulo && <div className="text-sm text-muted-foreground mt-0.5">{subtitulo}</div>}
          </div>
          {etiqueta}
          <button
            type="button"
            onClick={aoFechar}
            aria-label="Fechar"
            className="shrink-0 p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-arini transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        <div className="p-5 overflow-y-auto grid sm:grid-cols-2 gap-x-6 gap-y-4">
          {campos.map((c, i) => (
            <div key={i} className={c.largo ? "sm:col-span-2" : undefined}>
              <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{c.rotulo}</div>
              <div className="text-sm text-arini mt-0.5 break-words">
                {c.valor === null || c.valor === undefined || c.valor === "" ? (
                  <span className="text-muted-foreground/60">—</span>
                ) : c.valor}
              </div>
            </div>
          ))}
          {extra && <div className="sm:col-span-2">{extra}</div>}
        </div>

        <div className="p-4 border-t flex flex-wrap gap-2 justify-end bg-muted/30 rounded-b-2xl">
          <button
            type="button"
            onClick={aoFechar}
            className="px-4 py-2 rounded-md border text-sm hover:bg-muted transition-colors"
          >
            Fechar
          </button>
          {hrefEdicao && (
            <Link
              href={hrefEdicao}
              className="px-4 py-2 rounded-md bg-arini text-white text-sm font-medium
                         hover:bg-arini/90 transition-colors inline-flex items-center gap-2"
            >
              <Pencil size={14} /> {rotuloEdicao}
            </Link>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/** Link de "abrir em página cheia" para usar dentro de `extra`. */
export function LinkExterno({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="text-arini hover:text-gold-dark text-sm inline-flex items-center gap-1.5">
      <ExternalLink size={13} /> {children}
    </Link>
  );
}
