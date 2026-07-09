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
import type { LinkedUser } from "./CorretoresTable";

export function NewCorretorDialog({
  users,
  linkedUserIds,
}: {
  users: LinkedUser[];
  linkedUserIds: string[];
}) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const supabase = createSupabaseBrowser();

  // Só oferece para vincular usuários que ainda não são corretores.
  const linked = new Set(linkedUserIds);
  const available = users.filter((u) => !linked.has(u.id));

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase.from("corretores").insert({
      nome: fd.get("nome"),
      cpf_cnpj: fd.get("cpf_cnpj") || null,
      creci: fd.get("creci") || null,
      telefone: fd.get("telefone") || null,
      email: fd.get("email") || null,
      observacoes: fd.get("observacoes") || null,
      user_id: fd.get("user_id") || null,
      created_by: user?.id,
    });
    setLoading(false);
    if (error) { alert(error.message); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><Plus size={16} /> Novo corretor</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Novo corretor</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Nome*</Label><Input name="nome" required /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>CRECI</Label><Input name="creci" /></div>
                <div><Label>CPF/CNPJ</Label><Input name="cpf_cnpj" /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>Telefone</Label><Input name="telefone" /></div>
                <div><Label>E-mail</Label><Input name="email" type="email" /></div>
              </div>
              <div>
                <Label>Vincular a um usuário do sistema (opcional)</Label>
                <Select name="user_id" defaultValue="">
                  <option value="">— Sem login (parceiro) —</option>
                  {available.map((u) => (
                    <option key={u.id} value={u.id}>{u.nome} ({u.email})</option>
                  ))}
                </Select>
                <p className="text-xs text-muted-foreground mt-1">
                  Use quando o corretor também tem acesso ao sistema.
                </p>
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
