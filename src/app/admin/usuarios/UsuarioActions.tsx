"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { SECTOR_LABELS, type Profile, type Sector } from "@/lib/types";
import { errMessage } from "@/lib/utils";
import { Pencil, Trash2, X } from "lucide-react";

export function UsuarioActions({ user, currentUserId }: { user: Profile; currentUserId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nome, setNome] = useState(user.nome);
  const [sector, setSector] = useState<Sector>(user.sector);
  const [adminCentral, setAdminCentral] = useState(user.is_admin_central);
  const [ativo, setAtivo] = useState(user.ativo);

  async function save() {
    setBusy(true); setError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("profiles")
      .update({ nome, sector, is_admin_central: adminCentral, ativo })
      .eq("id", user.id);
    setBusy(false);
    if (error) { setError(errMessage(error)); return; }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (user.id === currentUserId) { alert("Você não pode excluir o próprio usuário."); return; }
    if (!confirm(`Excluir o usuário ${user.email}? A conta de acesso será removida.`)) return;
    setBusy(true);
    const res = await fetch("/api/usuarios/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: user.id }),
    });
    setBusy(false);
    if (!res.ok) { const j = await res.json().catch(() => ({})); alert(j.error || "Erro ao excluir"); return; }
    router.refresh();
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Editar"><Pencil size={14} /></Button>
      <Button size="sm" variant="ghost" onClick={remove} disabled={busy} title="Excluir" className="text-red-600 hover:text-red-700"><Trash2 size={14} /></Button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Editar usuário</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              <div><Label>Nome</Label><Input value={nome} onChange={(e) => setNome(e.target.value)} /></div>
              <div><Label>E-mail</Label><Input value={user.email} disabled /></div>
              <div>
                <Label>Setor</Label>
                <Select value={sector} onChange={(e) => setSector(e.target.value as Sector)}>
                  {Object.entries(SECTOR_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={adminCentral} onChange={(e) => setAdminCentral(e.target.checked)} className="accent-arini" />
                Admin Central (Diretoria — acesso total)
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} className="accent-arini" />
                Ativo
              </label>
              {error && <p className="text-xs text-red-600">{error}</p>}
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="button" variant="gold" onClick={save} disabled={busy}>{busy ? "Salvando…" : "Salvar"}</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
