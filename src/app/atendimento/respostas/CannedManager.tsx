"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { type CannedResponse } from "@/lib/types";
import { Trash2, Plus } from "lucide-react";

export function CannedManager({ initial }: { initial: CannedResponse[] }) {
  const [items, setItems] = useState<CannedResponse[]>(initial);
  const [atalho, setAtalho] = useState("");
  const [titulo, setTitulo] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!titulo.trim() || !conteudo.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("canned_responses")
      .insert({
        atalho: (atalho.trim() || titulo.trim().toLowerCase().replace(/\s+/g, "_")).slice(0, 40),
        titulo: titulo.trim(),
        conteudo: conteudo.trim(),
      })
      .select("*")
      .single();
    setSaving(false);
    if (error) { setError(error.message); return; }
    setItems((p) => [...p, data as CannedResponse].sort((a, b) => a.titulo.localeCompare(b.titulo)));
    setAtalho(""); setTitulo(""); setConteudo("");
  }

  async function remove(id: string) {
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("canned_responses").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setItems((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      <div className="rounded-xl border bg-card p-4 space-y-2 h-fit">
        <h2 className="text-sm font-semibold">Nova resposta rápida</h2>
        <Input placeholder="Título (ex.: Horário de atendimento)" value={titulo} onChange={(e) => setTitulo(e.target.value)} />
        <Input placeholder="Atalho (ex.: horario) — opcional" value={atalho} onChange={(e) => setAtalho(e.target.value)} />
        <Textarea rows={4} placeholder="Conteúdo da mensagem…" value={conteudo} onChange={(e) => setConteudo(e.target.value)} />
        {error && <p className="text-xs text-red-600">{error}</p>}
        <Button type="button" variant="gold" onClick={() => void add()} disabled={saving || !titulo.trim() || !conteudo.trim()}>
          <Plus size={15} /> {saving ? "Salvando…" : "Adicionar"}
        </Button>
      </div>

      <div className="space-y-2">
        {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhuma resposta cadastrada.</p>}
        {items.map((cr) => (
          <div key={cr.id} className="rounded-lg border bg-card p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-sm font-medium">{cr.titulo} <span className="text-muted-foreground text-xs">/{cr.atalho}</span></div>
                <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">{cr.conteudo}</div>
              </div>
              <button type="button" onClick={() => void remove(cr.id)} className="text-muted-foreground hover:text-red-600 shrink-0" title="Excluir">
                <Trash2 size={15} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
