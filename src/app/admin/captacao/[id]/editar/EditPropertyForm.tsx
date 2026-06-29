"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  CATEGORY_LABELS,
  PROPERTY_TYPE_LABELS,
  STATUS_LABELS,
  type Property,
  type PropertyCategory,
  type PropertyStatus,
  type PropertyType,
} from "@/lib/types";

export function EditPropertyForm({
  property,
  owners,
}: {
  property: Property;
  owners: { id: string; nome: string }[];
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const payload = {
      type: fd.get("type") as PropertyType,
      category: fd.get("category") as PropertyCategory,
      status: fd.get("status") as PropertyStatus,
      titulo: (fd.get("titulo") as string) || null,
      descricao: (fd.get("descricao") as string) || null,
      endereco: (fd.get("endereco") as string) || null,
      bairro: (fd.get("bairro") as string) || null,
      cidade: (fd.get("cidade") as string) || null,
      uf: (fd.get("uf") as string) || null,
      cep: (fd.get("cep") as string) || null,
      lat: fd.get("lat") ? Number(fd.get("lat")) : null,
      lng: fd.get("lng") ? Number(fd.get("lng")) : null,
      maps_url: (fd.get("maps_url") as string)?.trim() || null,
      valor: fd.get("valor") ? Number(fd.get("valor")) : null,
      valor_fechado: fd.get("valor_fechado") ? Number(fd.get("valor_fechado")) : null,
      area_total: fd.get("area_total") ? Number(fd.get("area_total")) : null,
      area_construida: fd.get("area_construida") ? Number(fd.get("area_construida")) : null,
      dormitorios: fd.get("dormitorios") ? Number(fd.get("dormitorios")) : null,
      suites: fd.get("suites") ? Number(fd.get("suites")) : null,
      banheiros: fd.get("banheiros") ? Number(fd.get("banheiros")) : null,
      vagas: fd.get("vagas") ? Number(fd.get("vagas")) : null,
      ano_construcao: fd.get("ano_construcao") ? Number(fd.get("ano_construcao")) : null,
      owner_id: (fd.get("owner_id") as string) || null,
      exclusividade: fd.get("exclusividade") === "on",
      destaque: fd.get("destaque") === "on",
      publicado_no_site: fd.get("publicado_no_site") === "on",
    };
    const { error } = await supabase.from("properties").update(payload).eq("id", property.id);
    setLoading(false);
    if (error) { setError(error.message); return; }
    router.push(`/admin/captacao/${property.id}`);
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Identificação e status</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div>
            <Label>Tipo</Label>
            <Select name="type" defaultValue={property.type}>
              {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div>
            <Label>Categoria</Label>
            <Select name="category" defaultValue={property.category}>
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div>
            <Label>Status</Label>
            <Select name="status" defaultValue={property.status}>
              {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </div>
          <div className="md:col-span-3"><Label>Título</Label><Input name="titulo" defaultValue={property.titulo ?? ""} /></div>
          <div className="md:col-span-3"><Label>Descrição</Label><Textarea name="descricao" rows={4} defaultValue={property.descricao ?? ""} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Localização</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2"><Label>Endereço</Label><Input name="endereco" defaultValue={property.endereco ?? ""} /></div>
          <div><Label>CEP</Label><Input name="cep" defaultValue={property.cep ?? ""} /></div>
          <div><Label>Bairro</Label><Input name="bairro" defaultValue={property.bairro ?? ""} /></div>
          <div><Label>Cidade</Label><Input name="cidade" defaultValue={property.cidade ?? ""} /></div>
          <div><Label>UF</Label><Input name="uf" maxLength={2} defaultValue={property.uf ?? ""} /></div>
          <div className="md:col-span-3">
            <Label>Link do Google Maps</Label>
            <Input name="maps_url" type="url" defaultValue={property.maps_url ?? ""} placeholder="https://maps.app.goo.gl/…" />
          </div>
          <div><Label>Latitude</Label><Input name="lat" type="number" step="any" defaultValue={property.lat ?? ""} /></div>
          <div><Label>Longitude</Label><Input name="lng" type="number" step="any" defaultValue={property.lng ?? ""} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Valores e características</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div><Label>Valor (R$)</Label><Input name="valor" type="number" step="0.01" defaultValue={property.valor ?? ""} /></div>
          <div><Label>Valor fechado (R$)</Label><Input name="valor_fechado" type="number" step="0.01" defaultValue={property.valor_fechado ?? ""} /></div>
          <div><Label>Ano construção</Label><Input name="ano_construcao" type="number" defaultValue={property.ano_construcao ?? ""} /></div>
          <div><Label>Área total (m²)</Label><Input name="area_total" type="number" step="0.01" defaultValue={property.area_total ?? ""} /></div>
          <div><Label>Área construída</Label><Input name="area_construida" type="number" step="0.01" defaultValue={property.area_construida ?? ""} /></div>
          <div><Label>Dormitórios</Label><Input name="dormitorios" type="number" defaultValue={property.dormitorios ?? ""} /></div>
          <div><Label>Suítes</Label><Input name="suites" type="number" defaultValue={property.suites ?? ""} /></div>
          <div><Label>Banheiros</Label><Input name="banheiros" type="number" defaultValue={property.banheiros ?? ""} /></div>
          <div><Label>Vagas</Label><Input name="vagas" type="number" defaultValue={property.vagas ?? ""} /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Proprietário e flags</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Proprietário</Label>
            <Select name="owner_id" defaultValue={property.owner_id ?? ""}>
              <option value="">— Nenhum vinculado —</option>
              {owners.map((o) => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </Select>
          </div>
          <div className="flex flex-wrap gap-4 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="exclusividade" defaultChecked={property.exclusividade} className="accent-arini" /> Exclusividade</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="destaque" defaultChecked={property.destaque} className="accent-arini" /> Destaque na home</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="publicado_no_site" defaultChecked={property.publicado_no_site} className="accent-arini" /> Publicado no site</label>
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-red-600 p-3 rounded-md bg-red-50 border border-red-200">{error}</div>}

      <div className="flex justify-end gap-3">
        <Button type="button" variant="ghost" onClick={() => router.back()}>Cancelar</Button>
        <Button type="submit" variant="gold" disabled={loading} size="lg">
          {loading ? "Salvando…" : "Salvar alterações"}
        </Button>
      </div>
    </form>
  );
}
