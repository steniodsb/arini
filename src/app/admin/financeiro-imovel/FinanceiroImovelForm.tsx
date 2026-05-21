"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

interface Props {
  properties: { id: string; codigo: string; titulo: string | null }[];
}

export function FinanceiroImovelForm({ properties }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const valor_fechado = Number(fd.get("valor"));
    const comissao_pct = fd.get("comissao_pct") ? Number(fd.get("comissao_pct")) : null;
    const comissao_valor = comissao_pct ? (valor_fechado * comissao_pct) / 100 : (fd.get("comissao_valor") ? Number(fd.get("comissao_valor")) : null);

    const { error } = await supabase.from("property_financials").insert({
      property_id: fd.get("property_id"),
      operation_type: fd.get("operation_type"),
      valor_fechado,
      data_fechamento: fd.get("data_fechamento") || new Date().toISOString().slice(0, 10),
      forma_pagamento: fd.get("forma_pagamento"),
      comissao_pct,
      comissao_valor,
      criado_por: user?.id,
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    (e.currentTarget as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid md:grid-cols-3 gap-4">
      <div className="md:col-span-2">
        <Label>Imóvel</Label>
        <Select name="property_id" required>
          <option value="">Selecione…</option>
          {properties.map((p) => (
            <option key={p.id} value={p.id}>{p.codigo} — {p.titulo ?? ""}</option>
          ))}
        </Select>
      </div>
      <div>
        <Label>Operação</Label>
        <Select name="operation_type" defaultValue="venda">
          <option value="venda">Venda</option>
          <option value="locacao">Locação</option>
          <option value="permuta">Permuta</option>
          <option value="parceria">Parceria</option>
        </Select>
      </div>
      <div><Label>Valor fechado (R$)</Label><Input name="valor" type="number" step="0.01" required /></div>
      <div><Label>Data</Label><Input name="data_fechamento" type="date" /></div>
      <div>
        <Label>Forma pagamento</Label>
        <Select name="forma_pagamento" defaultValue="a_vista">
          <option value="a_vista">À vista</option>
          <option value="financiamento">Financiamento</option>
          <option value="parcelado">Parcelado</option>
          <option value="permuta">Permuta</option>
        </Select>
      </div>
      <div><Label>Comissão %</Label><Input name="comissao_pct" type="number" step="0.01" /></div>
      <div><Label>Comissão R$ (se fixa)</Label><Input name="comissao_valor" type="number" step="0.01" /></div>
      <div className="md:col-span-3 flex justify-end">
        {error && <span className="text-sm text-red-600 mr-3 self-center">{error}</span>}
        <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando…" : "Registrar fechamento"}</Button>
      </div>
    </form>
  );
}
