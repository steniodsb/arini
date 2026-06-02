"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { errMessage } from "@/lib/utils";
import { Pencil, Trash2, X } from "lucide-react";

export type TxField = {
  name: string;
  label: string;
  type: "text" | "number" | "date" | "select";
  value: string | number | null;
  options?: { value: string; label: string }[];
  step?: string;
};

/**
 * Ações de Editar/Excluir um lançamento financeiro. Só renderiza quando
 * `canManage` é true (diretoria). O administrativo/financeiro só lança —
 * não vê estes botões. A trava real também existe na RLS (migration 0006).
 */
export function TransactionActions({
  table,
  id,
  title,
  fields,
  canManage,
  redirectTo,
  editLabel,
}: {
  table: string;
  id: string;
  title: string;
  fields: TxField[];
  canManage: boolean;
  redirectTo?: string;
  editLabel?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.name, f.value == null ? "" : String(f.value)])),
  );

  if (!canManage) return null;

  async function save() {
    setBusy(true);
    setError(null);
    const payload: Record<string, unknown> = {};
    for (const f of fields) {
      const raw = values[f.name];
      if (f.type === "number") payload[f.name] = raw === "" ? null : Number(raw);
      else payload[f.name] = raw === "" ? null : raw;
    }
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from(table).update(payload).eq("id", id);
    setBusy(false);
    if (error) { setError(errMessage(error)); return; }
    setOpen(false);
    router.refresh();
  }

  async function remove() {
    if (!confirm("Excluir este lançamento? Esta ação não pode ser desfeita.")) return;
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from(table).delete().eq("id", id);
    setBusy(false);
    if (error) { alert(errMessage(error)); return; }
    if (redirectTo) router.push(redirectTo);
    else router.refresh();
  }

  return (
    <div className="flex items-center gap-1 justify-end">
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)} title="Editar">
        <Pencil size={14} />{editLabel ? <span className="ml-1">{editLabel}</span> : null}
      </Button>
      <Button size="sm" variant="ghost" onClick={remove} disabled={busy} title="Excluir" className="text-red-600 hover:text-red-700"><Trash2 size={14} /></Button>

      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6 max-h-[90vh] overflow-y-auto text-left" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">{title}</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <div className="space-y-3">
              {fields.map((f) => (
                <div key={f.name}>
                  <Label>{f.label}</Label>
                  {f.type === "select" ? (
                    <Select value={values[f.name]} onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}>
                      {(f.options ?? []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </Select>
                  ) : (
                    <Input
                      type={f.type === "number" ? "number" : f.type === "date" ? "date" : "text"}
                      step={f.step}
                      value={values[f.name]}
                      onChange={(e) => setValues((v) => ({ ...v, [f.name]: e.target.value }))}
                    />
                  )}
                </div>
              ))}
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
