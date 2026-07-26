"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { type AtendimentoLabel } from "@/lib/types";
import { Trash2, Plus } from "lucide-react";

const CORES = ["#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899", "#6b7280"];

export function LabelsManager({ initial }: { initial: AtendimentoLabel[] }) {
  const [items, setItems] = useState(initial);
  const [nome, setNome] = useState("");
  const [cor, setCor] = useState(CORES[0]);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const n = nome.trim().toLowerCase();
    if (!n) return;
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase.from("atendimento_labels").insert({ nome: n, cor }).select("*").single();
    if (error) { setError(error.message); return; }
    setItems((p) => [...p, data as AtendimentoLabel].sort((a, b) => a.nome.localeCompare(b.nome)));
    setNome("");
  }
  async function remove(id: string) {
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_labels").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setItems((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <h2 className="text-sm font-semibold">Nova etiqueta</h2>
        <div className="flex items-center gap-2">
          <Input placeholder="nome (ex.: quente)" value={nome} onChange={(e) => setNome(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void add(); }} />
          <div className="flex gap-1">
            {CORES.map((c) => (
              <button key={c} type="button" onClick={() => setCor(c)} style={{ background: c }} className={`h-6 w-6 rounded-full ${cor === c ? "ring-2 ring-offset-1 ring-arini" : ""}`} />
            ))}
          </div>
          <Button type="button" variant="gold" onClick={() => void add()} disabled={!nome.trim()}><Plus size={15} /></Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}
      </div>

      <div className="rounded-xl border bg-card divide-y">
        {items.length === 0 && <p className="p-4 text-sm text-muted-foreground">Nenhuma etiqueta.</p>}
        {items.map((l) => (
          <div key={l.id} className="flex items-center justify-between p-3">
            <span className="inline-flex items-center gap-2 text-sm">
              <span className="h-3 w-3 rounded-full" style={{ background: l.cor }} /> {l.nome}
            </span>
            <button type="button" onClick={() => void remove(l.id)} className="text-muted-foreground hover:text-red-600"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}
