"use client";

import { useState } from "react";

type AgentRow = {
  id: string;
  nome: string;
  email: string;
  sector: string;
  is_admin_central: boolean;
  atendimento_access: boolean;
};

export function AgentsManager({ initial, canManage }: { initial: AgentRow[]; canManage: boolean }) {
  const [rows, setRows] = useState(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function toggle(id: string, access: boolean) {
    setBusy(id); setError(null);
    const res = await fetch("/api/atendimento/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: id, access }),
    });
    setBusy(null);
    if (!res.ok) { const j = await res.json().catch(() => ({})); setError(j.error ?? "Falha ao salvar."); return; }
    setRows((p) => p.map((r) => (r.id === id ? { ...r, atendimento_access: access } : r)));
  }

  return (
    <div className="space-y-3">
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!canManage && <p className="text-xs text-muted-foreground">Só a diretoria pode alterar o acesso dos agentes.</p>}
      <div className="rounded-xl border bg-card divide-y">
        {rows.map((r) => {
          const habilitado = r.atendimento_access || r.is_admin_central;
          return (
            <div key={r.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <div className="text-sm font-medium">{r.nome}</div>
                <div className="text-xs text-muted-foreground truncate">{r.email} · {r.sector}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.is_admin_central && <span className="text-[11px] text-muted-foreground">diretoria (sempre)</span>}
                <button
                  type="button"
                  disabled={!canManage || r.is_admin_central || busy === r.id}
                  onClick={() => void toggle(r.id, !r.atendimento_access)}
                  className={`relative h-6 w-11 rounded-full transition-colors ${habilitado ? "bg-arini" : "bg-muted"} ${(!canManage || r.is_admin_central) ? "opacity-50" : ""}`}
                  title={habilitado ? "Com acesso" : "Sem acesso"}
                >
                  <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${habilitado ? "left-[22px]" : "left-0.5"}`} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
