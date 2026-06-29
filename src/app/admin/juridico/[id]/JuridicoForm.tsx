"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Initial {
  id?: string;
  status?: string;
  matricula_atualizada?: boolean | null;
  tem_onus?: boolean | null;
  apto_juridicamente?: boolean | null;
  observacoes?: string | null;
}

export function JuridicoForm({ propertyId, initial }: { propertyId: string; initial: Initial | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      property_id: propertyId,
      status: fd.get("status"),
      matricula_atualizada: fd.get("mat") === "on",
      tem_onus: fd.get("onus") === "on",
      apto_juridicamente: fd.get("apto") === "on",
      observacoes: fd.get("obs"),
      responsavel_id: user?.id,
      data_analise: new Date().toISOString().slice(0, 10),
    };
    if (initial?.id) await supabase.from("legal_records").update(payload).eq("id", initial.id);
    else await supabase.from("legal_records").insert(payload);
    setLoading(false);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      <div>
        <Label>Status</Label>
        <Select name="status" defaultValue={initial?.status ?? "em_analise"}>
          <option value="nao_iniciado">Não iniciado</option>
          <option value="em_analise">Em análise</option>
          <option value="pendente">Pendente</option>
          <option value="aprovado">Aprovado</option>
          <option value="reprovado">Reprovado</option>
        </Select>
      </div>
      <div className="grid grid-cols-3 gap-2 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" name="mat" defaultChecked={!!initial?.matricula_atualizada} className="accent-arini" />Matrícula atualizada</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="onus" defaultChecked={!!initial?.tem_onus} className="accent-arini" />Possui ônus</label>
        <label className="flex items-center gap-2"><input type="checkbox" name="apto" defaultChecked={!!initial?.apto_juridicamente} className="accent-arini" />Apto juridicamente</label>
      </div>
      <div>
        <Label>Observações</Label>
        <Textarea name="obs" rows={4} defaultValue={initial?.observacoes ?? ""} />
      </div>
      <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando…" : "Salvar análise"}</Button>
    </form>
  );
}
