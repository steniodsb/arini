"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Plus, Trash2 } from "lucide-react";
import {
  CLIENT_TYPES,
  CLIENT_TYPE_LABELS,
  PROPERTY_TYPE_LABELS,
  type ClientType,
  type PropertyType,
} from "@/lib/types";

export interface LinkedProperty {
  id: string; // id do vínculo (property_clients)
  property_id: string;
  codigo: string;
  titulo: string | null;
  type: PropertyType;
  cidade: string | null;
  papel: ClientType;
  observacao: string | null;
}

export interface PropertyOption {
  id: string;
  codigo: string;
  titulo: string | null;
  type: PropertyType;
  cidade: string | null;
}

/**
 * Vincula IMÓVEIS a este cliente (lado do cliente). É o espelho do
 * PropertyClientsPanel: a mesma tabela property_clients, mas partindo do
 * cadastro do cliente. Restrito a administrativo/jurídico/diretoria (a RLS de
 * property_clients reforça isso no banco).
 */
export function ClientPropertiesPanel({
  clientId,
  defaultPapel,
  initial,
  properties,
}: {
  clientId: string;
  defaultPapel: ClientType;
  initial: LinkedProperty[];
  properties: PropertyOption[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<LinkedProperty[]>(initial);
  const [busca, setBusca] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [papel, setPapel] = useState<ClientType>(defaultPapel);
  const [obs, setObs] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Ids já vinculados (qualquer papel) para não oferecer duplicado na lista.
  const linkedIds = useMemo(() => new Set(items.map((i) => i.property_id)), [items]);

  const filtered = useMemo(() => {
    const term = busca.trim().toLowerCase();
    return properties.filter((p) => {
      if (linkedIds.has(p.id)) return false;
      if (!term) return true;
      return (
        p.codigo.toLowerCase().includes(term) ||
        (p.titulo ?? "").toLowerCase().includes(term) ||
        (p.cidade ?? "").toLowerCase().includes(term)
      );
    });
  }, [properties, busca, linkedIds]);

  async function refetch() {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("property_clients")
      .select("id, papel, observacao, property:properties(id, codigo, titulo, type, cidade)")
      .eq("client_id", clientId)
      .order("created_at", { ascending: false });
    const rows: LinkedProperty[] = (data ?? []).map((r) => {
      const prop = r.property as
        | { id: string; codigo: string; titulo: string | null; type: PropertyType; cidade: string | null }
        | { id: string; codigo: string; titulo: string | null; type: PropertyType; cidade: string | null }[]
        | null;
      const pr = Array.isArray(prop) ? prop[0] : prop;
      return {
        id: r.id as string,
        property_id: pr?.id ?? "",
        codigo: pr?.codigo ?? "—",
        titulo: pr?.titulo ?? null,
        type: (pr?.type ?? "outro") as PropertyType,
        cidade: pr?.cidade ?? null,
        papel: r.papel as ClientType,
        observacao: (r.observacao as string | null) ?? null,
      };
    });
    setItems(rows);
  }

  async function vincular() {
    if (!propertyId) { setError("Selecione um imóvel."); return; }
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("property_clients").insert({
      property_id: propertyId,
      client_id: clientId,
      papel,
      observacao: obs || null,
      created_by: user?.id,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    setPropertyId(""); setObs(""); setBusca("");
    await refetch();
    router.refresh();
  }

  async function remover(id: string) {
    if (!confirm("Remover este vínculo?")) return;
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("property_clients").delete().eq("id", id);
    if (error) { setError(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== id));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Imóveis vinculados</CardTitle>
        <p className="text-xs text-muted-foreground">
          Imóveis ligados a este cliente (origem / controle interno). Visível apenas para
          administrativo, jurídico e diretoria.
        </p>
      </CardHeader>
      <CardContent className="space-y-5">
        {/* Lista de vínculos */}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhum imóvel vinculado a este cliente.</p>
        ) : (
          <div className="space-y-2">
            {items.map((it) => (
              <div key={it.id} className="flex items-center justify-between gap-3 rounded-md border p-3 text-sm">
                <div className="min-w-0">
                  <Link href={`/admin/captacao/${it.property_id}`} className="font-medium text-arini hover:text-gold-dark">
                    <span className="font-mono text-xs text-muted-foreground mr-2">{it.codigo}</span>
                    {it.titulo || PROPERTY_TYPE_LABELS[it.type]}
                    {it.cidade && <span className="text-muted-foreground"> · {it.cidade}</span>}
                  </Link>
                  {it.observacao && <div className="text-xs text-muted-foreground italic mt-0.5">“{it.observacao}”</div>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <Badge variant="gold">{CLIENT_TYPE_LABELS[it.papel]}</Badge>
                  <button
                    type="button"
                    onClick={() => remover(it.id)}
                    className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 text-xs"
                  >
                    <Trash2 size={13} /> Remover
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Vincular um imóvel */}
        <div className="border-t pt-4 space-y-3">
          <Label className="text-sm">Vincular um imóvel</Label>
          <Input
            placeholder="Filtrar imóveis por código, título ou cidade…"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
          />
          <div className="grid md:grid-cols-[1fr_180px] gap-2">
            <Select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
              <option value="">— Selecione um imóvel —</option>
              {filtered.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.codigo} — {p.titulo || PROPERTY_TYPE_LABELS[p.type]}{p.cidade ? ` (${p.cidade})` : ""}
                </option>
              ))}
            </Select>
            <Select value={papel} onChange={(e) => setPapel(e.target.value as ClientType)}>
              {CLIENT_TYPES.map((t) => <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>)}
            </Select>
          </div>
          <Input
            placeholder="Observação (ex.: indicou este imóvel)"
            value={obs}
            onChange={(e) => setObs(e.target.value)}
          />
          <Button type="button" variant="gold" disabled={busy || !propertyId} onClick={vincular}>
            <Plus size={14} /> Vincular imóvel
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
