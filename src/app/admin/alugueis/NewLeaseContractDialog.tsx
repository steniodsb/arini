"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Plus, X } from "lucide-react";

interface PropertyOpt { id: string; codigo: string; titulo: string | null; owner_id: string | null; valor: number | null; category: string }
interface Opt { id: string; nome: string }

// Constrói uma data YYYY-MM-DD com segurança (clampando o dia ao último do mês).
function ymd(year: number, month0: number, day: number): string {
  const last = new Date(year, month0 + 1, 0).getDate();
  const d = Math.min(day, last);
  return `${year}-${String(month0 + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return ymd(dt.getFullYear(), dt.getMonth(), dt.getDate());
}

export function NewLeaseContractDialog({ properties, owners, clients }: { properties: PropertyOpt[]; owners: Opt[]; clients: Opt[] }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [propertyId, setPropertyId] = useState("");
  const router = useRouter();

  const selected = useMemo(() => properties.find((p) => p.id === propertyId) ?? null, [properties, propertyId]);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();

    const valor = Number(fd.get("valor_aluguel") || 0);
    const taxa = Number(fd.get("taxa_administracao") || 0);
    const diaVenc = Number(fd.get("dia_vencimento") || 10);
    const diasRepasse = Number(fd.get("dias_repasse") || 5);
    const dataInicio = String(fd.get("data_inicio"));
    const dataFim = (fd.get("data_fim") as string) || null;
    const clientId = (fd.get("client_id") as string) || null;
    const ownerId = (fd.get("owner_id") as string) || null;

    const { data: contract, error } = await supabase
      .from("lease_contracts")
      .insert({
        property_id: fd.get("property_id"),
        owner_id: ownerId,
        client_id: clientId,
        inquilino_nome: (fd.get("inquilino_nome") as string)?.trim() || null,
        inquilino_telefone: (fd.get("inquilino_telefone") as string)?.trim() || null,
        valor_aluguel: valor,
        taxa_administracao: taxa,
        dia_vencimento: diaVenc,
        dias_repasse: diasRepasse,
        data_inicio: dataInicio,
        data_fim: dataFim,
        contrato_url: (fd.get("contrato_url") as string)?.trim() || null,
        observacoes: (fd.get("observacoes") as string)?.trim() || null,
        created_by: user?.id,
      })
      .select("id")
      .single();

    if (error || !contract) { setLoading(false); alert(error?.message ?? "Erro ao salvar contrato"); return; }

    // Gera as parcelas mensais (recebíveis) do período do contrato.
    const [iy, im] = dataInicio.split("-").map(Number);
    let meses = 12;
    if (dataFim) {
      const [fy, fm] = dataFim.split("-").map(Number);
      meses = Math.max(1, (fy - iy) * 12 + (fm - im) + 1);
    }
    meses = Math.min(meses, 36); // trava de segurança
    const valorRepasse = Math.round(valor * (1 - taxa / 100) * 100) / 100;
    const rows = [];
    for (let k = 0; k < meses; k++) {
      const month0 = im - 1 + k;
      const year = iy + Math.floor(month0 / 12);
      const m0 = ((month0 % 12) + 12) % 12;
      const competencia = ymd(year, m0, 1);
      const vencimento = ymd(year, m0, diaVenc);
      rows.push({
        contract_id: contract.id,
        competencia,
        vencimento,
        valor,
        status: "pendente",
        repasse_vencimento: addDays(vencimento, diasRepasse),
        valor_repasse: valorRepasse,
        repasse_status: "pendente",
      });
    }
    if (rows.length) await supabase.from("lease_payments").insert(rows);

    // Marca o imóvel como locado (puxa o status no CRM).
    if (fd.get("marcar_locado")) {
      await supabase.from("properties").update({ status: "locado" }).eq("id", fd.get("property_id"));
    }

    setLoading(false);
    setOpen(false);
    router.refresh();
  }

  return (
    <>
      <Button variant="gold" onClick={() => setOpen(true)}><Plus size={16} /> Novo contrato</Button>
      {open && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4 overflow-y-auto" onClick={() => setOpen(false)}>
          <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full p-6 my-8" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-xl text-arini">Novo contrato de locação</h2>
              <button onClick={() => setOpen(false)} className="text-muted-foreground hover:text-arini"><X size={18} /></button>
            </div>
            <form onSubmit={submit} className="space-y-4">
              <div>
                <Label>Imóvel*</Label>
                <Select name="property_id" required value={propertyId} onChange={(e) => setPropertyId(e.target.value)}>
                  <option value="">Selecione o imóvel…</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>{p.codigo} — {p.titulo ?? "(sem título)"}</option>
                  ))}
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Inquilino (cadastrado)</Label>
                  <Select name="client_id" defaultValue="">
                    <option value="">— sem cadastro —</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                  </Select>
                </div>
                <div>
                  <Label>Proprietário (repasse)</Label>
                  <Select name="owner_id" key={selected?.owner_id ?? "none"} defaultValue={selected?.owner_id ?? ""}>
                    <option value="">— selecionar —</option>
                    {owners.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div><Label>Inquilino (nome avulso)</Label><Input name="inquilino_nome" placeholder="Se não houver cadastro" /></div>
                <div><Label>Telefone do inquilino</Label><Input name="inquilino_telefone" /></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><Label>Valor do aluguel (R$)*</Label><Input name="valor_aluguel" type="number" step="0.01" required key={selected?.id ?? "v"} defaultValue={selected?.valor ?? ""} /></div>
                <div><Label>Taxa adm. (%)</Label><Input name="taxa_administracao" type="number" step="0.01" defaultValue="0" /></div>
                <div><Label>Dia de vencimento*</Label><Input name="dia_vencimento" type="number" min="1" max="31" required defaultValue="10" /></div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div><Label>Dias p/ repasse</Label><Input name="dias_repasse" type="number" min="0" max="31" defaultValue="5" /></div>
                <div><Label>Início*</Label><Input name="data_inicio" type="date" required /></div>
                <div><Label>Fim (opcional)</Label><Input name="data_fim" type="date" /></div>
              </div>

              <div><Label>Contrato (link do arquivo/Drive)</Label><Input name="contrato_url" type="url" placeholder="https://…" /></div>
              <div><Label>Observações</Label><Input name="observacoes" /></div>

              <label className="flex items-center gap-2 text-sm text-muted-foreground">
                <input type="checkbox" name="marcar_locado" defaultChecked /> Marcar o imóvel como “Locado” no CRM
              </label>

              <p className="text-xs text-muted-foreground">
                Ao salvar, as parcelas mensais (recebíveis) são geradas automaticamente do início ao fim do contrato, com vencimento e data de repasse.
              </p>

              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
                <Button type="submit" variant="gold" disabled={loading}>{loading ? "Salvando…" : "Cadastrar contrato"}</Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
