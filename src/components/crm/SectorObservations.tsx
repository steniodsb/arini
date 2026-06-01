"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SECTOR_LABELS, type Sector, type SectorObservation } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import { Send, Check } from "lucide-react";

// Setores que podem ser destinatários de uma observação (delegação).
const TARGET_SECTORS: Sector[] = [
  "captacao",
  "marketing",
  "administrativo",
  "juridico",
  "financeiro",
  "recepcao",
  "admin_central",
];

export function SectorObservations({
  entityTable,
  entityId,
  currentUserId,
  currentSector,
  initial,
  canAdd = true,
}: {
  entityTable: string;
  entityId: string;
  currentUserId: string;
  currentSector: Sector;
  initial: SectorObservation[];
  canAdd?: boolean;
}) {
  const router = useRouter();
  const [items, setItems] = useState<SectorObservation[]>(initial);
  const [texto, setTexto] = useState("");
  const [target, setTarget] = useState<Sector>("administrativo");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    if (!texto.trim()) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("sector_observations")
      .insert({
        entity_table: entityTable,
        entity_id: entityId,
        target_sector: target,
        autor_id: currentUserId,
        autor_sector: currentSector,
        texto: texto.trim(),
      })
      .select()
      .single();
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    setItems((prev) => [data as SectorObservation, ...prev]);
    setTexto("");
    router.refresh();
  }

  async function resolve(id: string) {
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("sector_observations")
      .update({ resolvido: true, resolvido_por: currentUserId, resolvido_em: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      setError(error.message);
      return;
    }
    setItems((prev) => prev.map((o) => (o.id === id ? { ...o, resolvido: true } : o)));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Observações por setor</CardTitle>
        <p className="text-xs text-muted-foreground">
          Direcione uma observação a um setor — ele recebe uma notificação.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!canAdd && (
          <p className="text-xs text-muted-foreground italic">
            As observações ficam disponíveis após a aprovação do imóvel.
          </p>
        )}
        {canAdd && (
        <div className="space-y-2">
          <Textarea
            rows={2}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escreva a observação…"
          />
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs text-muted-foreground">Setor que vai receber:</span>
            <Select
              value={target}
              onChange={(e) => setTarget(e.target.value as Sector)}
              className="w-auto min-w-[200px]"
            >
              {TARGET_SECTORS.map((s) => (
                <option key={s} value={s}>
                  {SECTOR_LABELS[s]}
                </option>
              ))}
            </Select>
            <Button type="button" size="sm" variant="gold" onClick={add} disabled={loading || !texto.trim()}>
              <Send size={14} /> {loading ? "Enviando…" : "Enviar"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600">{error}</p>}
        </div>
        )}

        <div className="space-y-2">
          {items.length === 0 && (
            <p className="text-sm text-muted-foreground">Nenhuma observação ainda.</p>
          )}
          {items.map((o) => (
            <div
              key={o.id}
              className={`rounded-md border p-3 text-sm ${o.resolvido ? "opacity-60 bg-muted/30" : "bg-card"}`}
            >
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
              {!o.resolvido && (
                <button
                  type="button"
                  onClick={() => resolve(o.id)}
                  className="mt-2 inline-flex items-center gap-1 text-xs text-arini hover:text-gold-dark font-semibold"
                >
                  <Check size={12} /> Marcar como resolvida
                </button>
              )}
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
