"use client";

import { useState, type ReactNode } from "react";
import { Lock } from "lucide-react";

export function JuridicoTabs({
  diretoria,
  children,
}: {
  diretoria: boolean;
  children: { imoveis: ReactNode; clientes: ReactNode };
}) {
  // Aba "Imóveis anexados" é exclusiva da diretoria. Se não for diretoria,
  // começa (e fica) na aba de clientes.
  const [tab, setTab] = useState<"imoveis" | "clientes">(diretoria ? "imoveis" : "clientes");

  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b">
        <button
          type="button"
          disabled={!diretoria}
          onClick={() => diretoria && setTab("imoveis")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px inline-flex items-center gap-1 ${
            tab === "imoveis" ? "border-gold-dark text-arini" : "border-transparent text-muted-foreground"
          } ${!diretoria ? "opacity-50 cursor-not-allowed" : "hover:text-arini"}`}
        >
          Imóveis anexados {!diretoria && <Lock size={12} />}
        </button>
        <button
          type="button"
          onClick={() => setTab("clientes")}
          className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
            tab === "clientes" ? "border-gold-dark text-arini" : "border-transparent text-muted-foreground hover:text-arini"
          }`}
        >
          Documentos de clientes
        </button>
      </div>

      {tab === "imoveis" && diretoria && children.imoveis}
      {tab === "imoveis" && !diretoria && (
        <p className="text-sm text-muted-foreground">Acesso restrito à diretoria.</p>
      )}
      {tab === "clientes" && children.clientes}
    </div>
  );
}
