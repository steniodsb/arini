"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { formatDateBR } from "@/lib/utils";
import { Plus, Check, Trash2 } from "lucide-react";
import type { MarketingContent } from "@/lib/types";

const TIPOS = [
  ["feed", "Feed"], ["reels", "Reels"], ["story", "Story"],
  ["banner", "Banner"], ["video", "Vídeo"], ["tour_virtual", "Tour virtual"], ["outro", "Outro"],
] as const;

export function MarketingContents({
  propertyId, campaignId, initial,
}: {
  propertyId: string;
  campaignId: string | null;
  initial: MarketingContent[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<MarketingContent[]>(initial);
  const [tipo, setTipo] = useState("feed");
  const [titulo, setTitulo] = useState("");
  const [data, setData] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { data: row, error } = await supabase.from("marketing_contents").insert({
      campaign_id: campaignId,
      property_id: propertyId,
      tipo,
      titulo: titulo || null,
      data_publicacao: data || null,
      created_by: user?.id,
    }).select().single();
    setBusy(false);
    if (error) { alert(error.message); return; }
    setItems((p) => [...p, row as MarketingContent]);
    setTitulo(""); setData("");
    router.refresh();
  }

  async function togglePub(id: string, publicado: boolean) {
    const supabase = createSupabaseBrowser();
    await supabase.from("marketing_contents").update({ publicado }).eq("id", id);
    setItems((p) => p.map((c) => (c.id === id ? { ...c, publicado } : c)));
  }

  async function remove(id: string) {
    if (!confirm("Excluir este conteúdo?")) return;
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("marketing_contents").delete().eq("id", id);
    if (error) { alert(error.message); return; }
    setItems((p) => p.filter((c) => c.id !== id));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Conteúdos e datas de publicação</CardTitle>
        <p className="text-xs text-muted-foreground">Cada conteúdo tem sua data de publicação.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-end gap-2">
          <div><Label>Tipo</Label><Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-auto min-w-[140px]">{TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</Select></div>
          <div className="flex-1 min-w-[160px]"><Label>Título / descrição</Label><Input value={titulo} onChange={(e) => setTitulo(e.target.value)} /></div>
          <div><Label>Data de publicação</Label><Input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <Button type="button" variant="gold" onClick={add} disabled={busy}><Plus size={14} /> Adicionar</Button>
        </div>

        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum conteúdo programado.</p>}
          {items.map((c) => (
            <div key={c.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{TIPOS.find(([v]) => v === c.tipo)?.[1] ?? c.tipo}</Badge>
                <span>{c.titulo ?? "—"}</span>
                {c.publicado && <Badge variant="success">Publicado</Badge>}
              </div>
              <div className="flex items-center gap-3">
                <span className="text-xs text-muted-foreground">{c.data_publicacao ? formatDateBR(c.data_publicacao) : "sem data"}</span>
                <button type="button" onClick={() => togglePub(c.id, !c.publicado)} className="text-xs text-arini hover:text-gold-dark font-semibold inline-flex items-center gap-1">
                  <Check size={12} /> {c.publicado ? "Marcar pendente" : "Marcar publicado"}
                </button>
                <button type="button" onClick={() => remove(c.id)} className="text-xs text-red-600 hover:text-red-700 inline-flex items-center gap-1">
                  <Trash2 size={12} /> Excluir
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
