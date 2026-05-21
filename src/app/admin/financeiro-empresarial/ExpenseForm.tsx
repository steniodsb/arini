"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export function ExpenseForm({ categories }: { categories: { id: string; nome: string }[] }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

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
      recorrencia: fd.get("recorrencia") || "none",
      criado_por: user?.id,
    });
    setLoading(false);
    (e.currentTarget as HTMLFormElement).reset();
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="grid md:grid-cols-3 gap-3">
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
