"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

export function NewGeneralCommissionDialog({ accounts }: { accounts: { id: string; nome: string }[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("commissions").insert({
      property_financial_id: null,
      tipo: "geral",
      descricao: fd.get("descricao") || null,
      beneficiario_nome: fd.get("beneficiario_nome") || null,
      beneficiario_tipo: fd.get("beneficiario_tipo") || null,
      percentual: fd.get("percentual") ? Number(fd.get("percentual")) : null,
      valor: Number(fd.get("valor") || 0),
      data_inicio: fd.get("data_inicio") || null,
      data_fechamento: fd.get("data_fechamento") || null,
      conta_id: fd.get("conta_id") || null,
      status: "pendente",
      criado_por: user?.id,
    });
    setLoading(false);
    if (error) { alert(error.message); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><Plus size={16} /> Nova comissão geral</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Nova comissão geral</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Descrição</Label><Input name="descricao" placeholder="Ex.: Parceria, indicação, serviço…" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Beneficiário</Label><Input name="beneficiario_nome" /></div>
                <div>
                  <Label>Tipo</Label>
                  <Select name="beneficiario_tipo" defaultValue="parceiro">
                    <option value="captador">Captador</option>
                    <option value="corretor">Corretor</option>
                    <option value="parceiro">Parceiro</option>
                    <option value="imobiliaria">Imobiliária</option>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Valor (R$)*</Label><Input name="valor" type="number" step="0.01" required /></div>
                <div><Label>Percentual (%)</Label><Input name="percentual" type="number" step="0.01" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Data início</Label><Input name="data_inicio" type="date" /></div>
                <div><Label>Data fechamento</Label><Input name="data_fechamento" type="date" /></div>
              </div>
              <div>
                <Label>Conta / Caixa</Label>
                <Select name="conta_id" defaultValue="">
                  <option value="">— (opcional)</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </Select>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando..." : "Lançar comissão"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
