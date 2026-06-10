"use client";

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

type Tab = "imoveis" | "clientes" | "contratos";

export function JuridicoTabs({
  diretoria,
  initialTab,
  children,
}: {
  diretoria: boolean;
  initialTab?: Tab;
  children: { imoveis: ReactNode; clientes: ReactNode; contratos: ReactNode };
}) {
  // Aba "Imóveis anexados" é exclusiva da diretoria.
  const fallback: Tab = diretoria ? "imoveis" : "clientes";
  const [tab, setTab] = useState<Tab>(
    initialTab && (initialTab !== "imoveis" || diretoria) ? initialTab : fallback,
  );

  const btn = (key: Tab, label: ReactNode, locked = false) => (
    <button
      type="button"
      disabled={locked}
      onClick={() => !locked && setTab(key)}
      className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1 ${
        tab === key ? "border-gold-dark text-arini" : "border-transparent text-muted-foreground"
      } ${locked ? "opacity-50 cursor-not-allowed" : "hover:text-arini"}`}
    >
      {label}
    </button>
  );

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        {btn("imoveis", <>Imóveis anexados {!diretoria && <Lock size={12} />}</>, !diretoria)}
        {btn("clientes", "Documentos de clientes")}
        {btn("contratos", "Contratos")}
      </div>

      {tab === "imoveis" && diretoria && children.imoveis}
      {tab === "imoveis" && !diretoria && (
        <p className="text-sm text-muted-foreground">Acesso restrito à diretoria.</p>
      )}
      {tab === "clientes" && children.clientes}
      {tab === "contratos" && children.contratos}
    </div>
  );
}
