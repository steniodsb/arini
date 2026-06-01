"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function ExpenseForm({
  categories,
  accounts = [],
  properties = [],
  clients = [],
}: {
  categories: { id: string; nome: string }[];
  accounts?: { id: string; nome: string }[];
  properties?: { id: string; codigo: string; titulo: string | null }[];
  clients?: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [tipoGasto, setTipoGasto] = useState<"empresa" | "imovel" | "cliente">("empresa");

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("expenses").insert({
      categoria_id: fd.get("categoria_id"),
      fornecedor: fd.get("fornecedor"),
      descricao: fd.get("descricao"),
      valor: Number(fd.get("valor")),
      vencimento: fd.get("vencimento"),
      data_inicio: fd.get("data_inicio") || null,
      data_fechamento: fd.get("data_fechamento") || null,
      recorrencia: fd.get("recorrencia") || "none",
      tipo_gasto: tipoGasto,
      property_id: tipoGasto === "imovel" ? (fd.get("property_id") || null) : null,
      client_id: tipoGasto === "cliente" ? (fd.get("client_id") || null) : null,
      conta_id: fd.get("conta_id") || null,
      criado_por: user?.id,
    });
    setLoading(false);
    (e.currentTarget as HTMLFormElement).reset();
    setTipoGasto("empresa");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
      <div>
        <Label>Tipo de gasto</Label>
        <Select value={tipoGasto} onChange={(e) => setTipoGasto(e.target.value as typeof tipoGasto)}>
          <option value="empresa">Empresa</option>
          <option value="imovel">Imóvel</option>
          <option value="cliente">Cliente</option>
        </Select>
      </div>
      {tipoGasto === "imovel" && (
        <div>
          <Label>Imóvel</Label>
          <Select name="property_id">
            <option value="">Selecione…</option>
            {properties.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.titulo ?? ""}</option>)}
          </Select>
        </div>
      )}
      {tipoGasto === "cliente" && (
        <div>
          <Label>Cliente</Label>
          <Select name="client_id">
            <option value="">Selecione…</option>
            {clients.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </div>
      )}
      <div>
        <Label>Categoria</Label>
        <Select name="categoria_id" required>
          <option value="">Selecione…</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </Select>
      </div>
      <div><Label>Fornecedor</Label><Input name="fornecedor" /></div>
      <div><Label>Valor (R$)</Label><Input name="valor" type="number" step="0.01" required /></div>
      <div><Label>Vencimento</Label><Input name="vencimento" type="date" required /></div>
      <div><Label>Data início</Label><Input name="data_inicio" type="date" /></div>
      <div><Label>Data fechamento</Label><Input name="data_fechamento" type="date" /></div>
      <div>
        <Label>Conta / Caixa</Label>
        <Select name="conta_id" defaultValue="">
          <option value="">— (opcional)</option>
          {accounts.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
        </Select>
      </div>
      <div>
        <Label>Recorrência</Label>
        <Select name="recorrencia" defaultValue="none">
          <option value="none">Não recorrente</option>
          <option value="mensal">Mensal</option>
          <option value="quinzenal">Quinzenal</option>
          <option value="anual">Anual</option>
        </Select>
      </div>
      <div><Label>Descrição</Label><Input name="descricao" /></div>
      <div className="md:col-span-3 flex justify-end">
        <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando…" : "Cadastrar despesa"}</Button>
      </div>
    </form>
  );
}
