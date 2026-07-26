"use client";

import { useState, useMemo } from "react";
import { LEAD_STAGES } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import { Search } from "lucide-react";

export type Contato = {
  id: string;
  nome: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  origem: string | null;
  stage: string | null;
  created_at: string;
};

function stageLabel(s: string | null) {
  return LEAD_STAGES.find((x) => x.key === s)?.label ?? s ?? "—";
}

export function ContatosList({ initial }: { initial: Contato[] }) {
  const [busca, setBusca] = useState("");
  const filtered = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return initial;
    return initial.filter((c) =>
      `${c.nome ?? ""} ${c.telefone ?? ""} ${c.whatsapp ?? ""} ${c.email ?? ""}`.toLowerCase().includes(q),
    );
  }, [initial, busca]);

  return (
    <div className="p-6 space-y-4 h-full overflow-y-auto">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-xl text-arini">Contatos</h1>
          <p className="text-sm text-muted-foreground">{initial.length} contatos</p>
        </div>
        <div className="relative w-64">
          <Search size={14} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar contato…" className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border bg-background" />
        </div>
      </div>

      <div className="rounded-xl border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="text-left font-medium px-3 py-2">Nome</th>
              <th className="text-left font-medium px-3 py-2">Telefone</th>
              <th className="text-left font-medium px-3 py-2">Origem</th>
              <th className="text-left font-medium px-3 py-2">Funil</th>
              <th className="text-left font-medium px-3 py-2">Criado</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 && (
              <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Nenhum contato.</td></tr>
            )}
            {filtered.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2">
                    <span className="h-6 w-6 rounded-full bg-arini/10 text-arini flex items-center justify-center text-[11px] font-semibold">
                      {(c.nome ?? "?").charAt(0).toUpperCase()}
                    </span>
                    {c.nome ?? "—"}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{c.telefone ?? c.whatsapp ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{c.origem ?? "—"}</td>
                <td className="px-3 py-2"><span className="text-xs rounded-full bg-muted px-2 py-0.5">{stageLabel(c.stage)}</span></td>
                <td className="px-3 py-2 text-muted-foreground">{formatDateBR(c.created_at)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
