"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SECTOR_LABELS, type Sector, type SectorObservation } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import { Send, Check, Building2, ArrowRight } from "lucide-react";

const TARGET_SECTORS: Sector[] = [
  "captacao", "marketing", "administrativo", "juridico", "financeiro", "recepcao", "admin_central",
];

export type PropertyRefMap = Record<string, { codigo: string; titulo: string | null }>;

// Resolve a qual imóvel uma observação se refere. As observações de imóvel
// nascem com o property_id em entity_id: 'properties' (captação) abre em
// /admin/captacao, 'marketing_campaigns' (marketing) em /admin/marketing.
// Mensagens gerais da caixa usam entity_table 'comunicacao' → sem imóvel.
function propertyRef(o: SectorObservation, properties: PropertyRefMap) {
  if (o.entity_table !== "properties" && o.entity_table !== "marketing_campaigns") return null;
  const p = properties[o.entity_id];
  if (!p) return null;
  const href =
    o.entity_table === "marketing_campaigns"
      ? `/admin/marketing/${o.entity_id}`
      : `/admin/captacao/${o.entity_id}`;
  return { href, codigo: p.codigo, titulo: p.titulo };
}

function Msg({
  o, properties, onResolve,
}: {
  o: SectorObservation;
  properties: PropertyRefMap;
  onResolve?: (id: string) => void;
}) {
  const ref = propertyRef(o, properties);
  return (
    <div className={`rounded-md border p-3 text-sm ${o.resolvido ? "opacity-60 bg-muted/30" : "bg-card"}`}>
      <div className="flex items-center justify-between gap-2 mb-1">
        <div className="flex items-center gap-2 text-xs">
          {o.autor_sector && <Badge variant="outline">{SECTOR_LABELS[o.autor_sector]}</Badge>}
          <span className="text-muted-foreground">→</span>
          <Badge variant="gold">{SECTOR_LABELS[o.target_sector]}</Badge>
          {o.resolvido && <Badge variant="success">Resolvida</Badge>}
        </div>
        <span className="text-[11px] text-muted-foreground">{formatDateBR(o.created_at)}</span>
      </div>
      <div className="whitespace-pre-line">{o.texto}</div>
      {ref && (
        <Link
          href={ref.href}
          className="mt-2 flex items-center gap-1.5 rounded-md border border-gold/40 bg-gold/5 px-2 py-1.5 text-xs font-medium text-arini hover:bg-gold/10"
        >
          <Building2 size={13} className="shrink-0 text-gold-dark" />
          <span className="truncate">
            Imóvel {ref.codigo}
            {ref.titulo ? ` — ${ref.titulo}` : ""}
          </span>
          <ArrowRight size={12} className="ml-auto shrink-0 opacity-60" />
        </Link>
      )}
      {!o.resolvido && onResolve && (
        <button type="button" onClick={() => onResolve(o.id)} className="mt-2 inline-flex items-center gap-1 text-xs text-arini hover:text-gold-dark font-semibold">
          <Check size={12} /> Marcar como resolvida
        </button>
      )}
    </div>
  );
}

export function CommunicationBox({
  currentUserId, currentSector, recebidas, enviadas, properties,
}: {
  currentUserId: string;
  currentSector: Sector;
  recebidas: SectorObservation[];
  enviadas: SectorObservation[];
  properties: PropertyRefMap;
}) {
  const router = useRouter();
  const [tab, setTab] = useState<"recebidas" | "enviadas">("recebidas");
  const [inbox, setInbox] = useState(recebidas);
  const [sent, setSent] = useState(enviadas);
  const [texto, setTexto] = useState("");
  const [target, setTarget] = useState<Sector>("administrativo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("sector_observations")
      .insert({
        entity_table: "comunicacao",
        entity_id: currentUserId,
        target_sector: target,
        autor_id: currentUserId,
        autor_sector: currentSector,
        texto: texto.trim(),
      })
      .select()
      .single();
    setLoading(false);
    if (error) { setError(error.message); return; }
    setSent((p) => [data as SectorObservation, ...p]);
    setTexto("");
    setTab("enviadas");
    router.refresh();
  }

  async function resolve(id: string) {
    const supabase = createSupabaseBrowser();
    await supabase.from("sector_observations").update({ resolvido: true, resolvido_por: currentUserId, resolvido_em: new Date().toISOString() }).eq("id", id);
    setInbox((p) => p.map((o) => (o.id === id ? { ...o, resolvido: true } : o)));
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Nova mensagem / delegação</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          <Textarea rows={3} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a mensagem ou tarefa a delegar…" />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Para o setor:</span>
            <Select value={target} onChange={(e) => setTarget(e.target.value as Sector)} className="w-auto min-w-[200px]">
              {TARGET_SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABELS[s]}</option>)}
            </Select>
            <Button type="button" size="sm" variant="gold" onClick={send} disabled={loading || !texto.trim()}>
              <Send size={14} /> {loading ? "Enviando…" : "Enviar"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </CardContent>
      </Card>

      <div className="flex gap-2">
        <Button variant={tab === "recebidas" ? "gold" : "outline"} size="sm" onClick={() => setTab("recebidas")}>
          Recebidas ({inbox.length})
        </Button>
        <Button variant={tab === "enviadas" ? "gold" : "outline"} size="sm" onClick={() => setTab("enviadas")}>
          Enviadas ({sent.length})
        </Button>
      </div>

      <div className="space-y-2">
        {tab === "recebidas" && (inbox.length === 0
          ? <p className="text-sm text-muted-foreground">Nenhuma mensagem recebida.</p>
          : inbox.map((o) => <Msg key={o.id} o={o} properties={properties} onResolve={resolve} />))}
        {tab === "enviadas" && (sent.length === 0
          ? <p className="text-sm text-muted-foreground">Nenhuma mensagem enviada.</p>
          : sent.map((o) => <Msg key={o.id} o={o} properties={properties} />))}
      </div>
    </div>
  );
}
