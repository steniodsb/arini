"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export function NewContractDialog({ properties }: { properties: { id: string; codigo: string; titulo: string | null }[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("contracts").insert({
      property_id: fd.get("property_id"),
      tipo: fd.get("tipo"),
      valor: fd.get("valor") ? Number(fd.get("valor")) : null,
      status_assinatura: "pendente",
      criado_por: user?.id,
    });
    setLoading(false); setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><Plus size={16} /> Novo contrato</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Novo contrato</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Imóvel</Label>
                <Select name="property_id" required>
                  <option value="">Selecione…</option>
                  {properties.map((p) => <option key={p.id} value={p.id}>{p.codigo} — {p.titulo ?? ""}</option>)}
                </Select>
              </div>
              <div>
                <Label>Tipo</Label>
                <Select name="tipo" defaultValue="venda">
                  <option value="captacao">Captação</option>
                  <option value="exclusividade">Exclusividade</option>
                  <option value="venda">Venda</option>
                  <option value="locacao">Locação</option>
                  <option value="parceria">Parceria</option>
                  <option value="permuta">Permuta</option>
                </Select>
              </div>
              <div><Label>Valor (R$)</Label><Input name="valor" type="number" step="0.01" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando..." : "Criar contrato"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
