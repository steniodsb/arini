"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { LEAD_ORIGINS } from "@/lib/types";

export function NovoLeadForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const interesse = {
      compra: fd.get("i_compra") === "on",
      locacao: fd.get("i_locacao") === "on",
      rural: fd.get("i_rural") === "on",
      urbano: fd.get("i_urbano") === "on",
      investimento: fd.get("i_invest") === "on",
    };
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("leads").insert({
      nome: fd.get("nome"),
      telefone: fd.get("telefone") || null,
      whatsapp: fd.get("whatsapp") || null,
      email: fd.get("email") || null,
      origem: fd.get("origem") || "outros",
      interesse,
      perfil: fd.get("perfil") || null,
      urgencia: fd.get("urgencia") || null,
      faixa_valor_min: fd.get("min") ? Number(fd.get("min")) : null,
      faixa_valor_max: fd.get("max") ? Number(fd.get("max")) : null,
      observacoes: fd.get("obs") || null,
      stage: "novo",
    });
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push("/admin/leads");
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6">
        <form onSubmit={submit} className="space-y-4">
          <div className="grid md:grid-cols-2 gap-4">
            <div><Label>Nome*</Label><Input name="nome" required /></div>
            <div><Label>Origem*</Label>
              <Select name="origem" defaultValue="indicacao">
                {LEAD_ORIGINS.map((o) => <option key={o} value={o}>{o}</option>)}
              </Select>
            </div>
            <div><Label>Telefone</Label><Input name="telefone" /></div>
            <div><Label>WhatsApp</Label><Input name="whatsapp" /></div>
            <div className="md:col-span-2"><Label>E-mail</Label><Input name="email" type="email" /></div>
          </div>
          <div>
            <Label className="block mb-2">Interesse</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-sm">
              <label><input type="checkbox" name="i_compra" className="mr-1 accent-arini" />Compra</label>
              <label><input type="checkbox" name="i_locacao" className="mr-1 accent-arini" />Locação</label>
              <label><input type="checkbox" name="i_rural" className="mr-1 accent-arini" />Rural</label>
              <label><input type="checkbox" name="i_urbano" className="mr-1 accent-arini" />Urbano</label>
              <label><input type="checkbox" name="i_invest" className="mr-1 accent-arini" />Investimento</label>
            </div>
          </div>
          <div className="grid md:grid-cols-3 gap-4">
            <div><Label>Faixa min (R$)</Label><Input name="min" type="number" /></div>
            <div><Label>Faixa max (R$)</Label><Input name="max" type="number" /></div>
            <div><Label>Urgência</Label>
              <Select name="urgencia">
                <option value="">—</option>
                <option value="baixa">Baixa</option>
                <option value="media">Média</option>
                <option value="alta">Alta</option>
                <option value="imediata">Imediata</option>
              </Select>
            </div>
          </div>
          <div><Label>Perfil</Label><Input name="perfil" placeholder="Família, investidor…" /></div>
          <div><Label>Observações</Label><Textarea name="obs" rows={3} /></div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex justify-end">
            <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando..." : "Cadastrar lead"}</Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
