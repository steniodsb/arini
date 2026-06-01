"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export function NewAccountDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("bank_accounts").insert({
      nome: fd.get("nome"),
      banco: fd.get("banco") || null,
      agencia: fd.get("agencia") || null,
      conta: fd.get("conta") || null,
      tipo: fd.get("tipo"),
      saldo_inicial: Number(fd.get("saldo_inicial") || 0),
      created_by: user?.id,
    });
    setLoading(false);
    if (error) { alert(error.message); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><Plus size={16} /> Nova conta</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Nova conta / caixa</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Nome*</Label><Input name="nome" required placeholder="Ex.: Caixa, Banco do Brasil C/C" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo*</Label>
                  <Select name="tipo" defaultValue="conta_corrente" required>
                    <option value="conta_corrente">Conta corrente</option>
                    <option value="poupanca">Poupança</option>
                    <option value="caixa">Caixa</option>
                    <option value="investimento">Investimento</option>
                  </Select>
                </div>
                <div><Label>Banco</Label><Input name="banco" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Agência</Label><Input name="agencia" /></div>
                <div><Label>Conta</Label><Input name="conta" /></div>
              </div>
              <div><Label>Saldo inicial (R$)</Label><Input name="saldo_inicial" type="number" step="0.01" defaultValue="0" /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando..." : "Cadastrar"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
