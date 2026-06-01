"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Plus, X } from "lucide-react";
import { CLIENT_TYPES, CLIENT_TYPE_LABELS } from "@/lib/types";

export function NewClientDialog() {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("clients").insert({
      nome: fd.get("nome"),
      tipo: fd.get("tipo"),
      cpf_cnpj: fd.get("cpf_cnpj") || null,
      telefone: fd.get("telefone") || null,
      whatsapp: fd.get("whatsapp") || null,
      email: fd.get("email") || null,
      endereco: fd.get("endereco") || null,
      cidade: fd.get("cidade") || null,
      uf: fd.get("uf") || null,
      observacoes: fd.get("observacoes") || null,
      created_by: user?.id,
    });
    setLoading(false);
    if (error) { alert(error.message); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><Plus size={16} /> Novo cliente</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Novo cliente</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Nome*</Label><Input name="nome" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo de cliente*</Label>
                  <Select name="tipo" defaultValue="comprador" required>
                    {CLIENT_TYPES.map((t) => <option key={t} value={t}>{CLIENT_TYPE_LABELS[t]}</option>)}
                  </Select>
                </div>
                <div><Label>CPF/CNPJ</Label><Input name="cpf_cnpj" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Telefone</Label><Input name="telefone" /></div>
                <div><Label>WhatsApp</Label><Input name="whatsapp" /></div>
              </div>
              <div><Label>E-mail</Label><Input name="email" type="email" /></div>
              <div><Label>Endereço</Label><Input name="endereco" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Cidade</Label><Input name="cidade" /></div>
                <div><Label>UF</Label><Input name="uf" maxLength={2} /></div>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={3} /></div>
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
