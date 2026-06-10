"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { SECTOR_LABELS, type Sector } from "@/lib/types";
import { errMessage } from "@/lib/utils";
import { Plus, X } from "lucide-react";

const TIPOS = [
  ["reuniao", "Reunião"], ["visita", "Visita"], ["gravacao", "Gravação"],
  ["ligacao", "Ligação"], ["retorno", "Retorno"], ["assinatura", "Assinatura"], ["outro", "Outro"],
] as const;

const SECTORS: Sector[] = [
  "captacao", "marketing", "administrativo", "juridico", "financeiro", "recepcao", "admin_central",
];

export function NewEventDialog({ userId, sector }: { userId: string; sector: Sector }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("agenda_events").insert({
      titulo: fd.get("titulo"),
      tipo: fd.get("tipo"),
      data_hora: new Date(fd.get("data_hora") as string).toISOString(),
      setor_destino: (fd.get("setor_destino") as string) || null,
      observacoes: fd.get("observacoes") || null,
      criado_por: userId,
      criado_por_sector: sector,
    });
    setLoading(false);
    if (error) { alert(errMessage(error)); return; }
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><Plus size={16} /> Novo compromisso</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Novo compromisso</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div><Label>Título*</Label><Input name="titulo" required placeholder="Ex.: Gravação de imóvel com o administrativo" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Tipo*</Label>
                  <Select name="tipo" defaultValue="reuniao" required>
                    {TIPOS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                  </Select>
                </div>
                <div><Label>Data e hora*</Label><Input name="data_hora" type="datetime-local" required /></div>
              </div>
              <div>
                <Label>Delegar para o setor (opcional)</Label>
                <Select name="setor_destino" defaultValue="">
                  <option value="">— Somente minha agenda</option>
                  {SECTORS.map((s) => <option key={s} value={s}>{SECTOR_LABELS[s]}</option>)}
                </Select>
                <p className="text-xs text-muted-foreground mt-1">O setor escolhido recebe uma notificação e vê o compromisso na agenda dele.</p>
              </div>
              <div><Label>Observações</Label><Textarea name="observacoes" rows={2} /></div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando..." : "Agendar"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
