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
  type PropertyCategory,
  type PropertyType,
} from "@/lib/types";

export function NovaCaptacaoForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;

    try {
      const type = fd.get("type") as PropertyType;
      const category = fd.get("category") as PropertyCategory;

      // Gerar código via RPC
      const { data: codigo, error: codErr } = await supabase.rpc("fn_generate_property_code", {
        p_type: type,
        p_category: category,
      });
      if (codErr) throw codErr;

      // Criar propriedade
      const propertyPayload = {
        codigo,
        type,
        category,
        status: "aguardando_aprovacao_captacao",
        titulo: (fd.get("titulo") as string) || null,
        descricao: (fd.get("descricao") as string) || null,
        endereco: (fd.get("endereco") as string) || null,
        bairro: (fd.get("bairro") as string) || null,
        cidade: (fd.get("cidade") as string) || null,
        uf: (fd.get("uf") as string) || null,
        cep: (fd.get("cep") as string) || null,
        lat: fd.get("lat") ? Number(fd.get("lat")) : null,
        lng: fd.get("lng") ? Number(fd.get("lng")) : null,
        valor: fd.get("valor") ? Number(fd.get("valor")) : null,
        area_total: fd.get("area_total") ? Number(fd.get("area_total")) : null,
        area_construida: fd.get("area_construida") ? Number(fd.get("area_construida")) : null,
        dormitorios: fd.get("dormitorios") ? Number(fd.get("dormitorios")) : null,
        banheiros: fd.get("banheiros") ? Number(fd.get("banheiros")) : null,
        vagas: fd.get("vagas") ? Number(fd.get("vagas")) : null,
        captador_id: userId,
        placa_status: (fd.get("placa") === "on" ? "colocada" : "nao_colocada"),
        slug_publico: codigo?.toLowerCase(),
      };

      const { data: property, error: insErr } = await supabase
        .from("properties")
        .insert(propertyPayload)
        .select()
        .single();
      if (insErr) throw insErr;

      // Capture info
      const materiais = {
        foto: fd.get("mat_foto") === "on",
        video: fd.get("mat_video") === "on",
        reels: fd.get("mat_reels") === "on",
        tour: fd.get("mat_tour") === "on",
        drone: fd.get("mat_drone") === "on",
      };
      await supabase.from("property_capture_info").insert({
        property_id: property.id,
        utilizou_camera: fd.get("eq_camera") === "on",
        utilizou_drone: fd.get("eq_drone") === "on",
        utilizou_gimbal: fd.get("eq_gimbal") === "on",
        utilizou_celular: fd.get("eq_celular") === "on",
        materiais,
        relatorio_texto: (fd.get("relatorio") as string) || null,
        placa_colocada: fd.get("placa") === "on",
      });

      // Upload de mídia
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const ext = file.name.split(".").pop();
        const path = `${property.id}/${Date.now()}-${i}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("property-media")
          .upload(path, file, { upsert: false });
        if (upErr) continue;
        const { data: urlData } = supabase.storage.from("property-media").getPublicUrl(path);
        const tipo = file.type.startsWith("video/") ? "video" : "imagem";
        await supabase.from("property_media").insert({
          property_id: property.id,
          tipo,
          url: urlData.publicUrl,
          storage_path: path,
          ordem: i,
          capa: i === 0,
          tamanho: file.size,
        });
      }

      // Cria approval
      await supabase.from("approvals").insert({
        entity_table: "properties",
        entity_id: property.id,
        stage: "captacao",
        status: "pendente",
        solicitado_por: userId,
        payload: { codigo, type, category },
      });

      router.push(`/admin/captacao/${property.id}`);
      router.refresh();
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader><CardTitle>Dados básicos</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-4">
          <div>
            <Label>Tipo*</Label>
            <Select name="type" required defaultValue="casa">
              {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div>
            <Label>Categoria*</Label>
            <Select name="category" required defaultValue="venda">
              {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </Select>
          </div>
          <div className="md:col-span-2">
            <Label>Título (opcional)</Label>
            <Input name="titulo" placeholder="Ex.: Casa térrea no Jardim das Acácias" />
          </div>
          <div className="md:col-span-2">
            <Label>Descrição</Label>
            <Textarea name="descricao" rows={4} placeholder="Descreva o imóvel…" />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Localização</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div className="md:col-span-2"><Label>Endereço</Label><Input name="endereco" /></div>
          <div><Label>CEP</Label><Input name="cep" /></div>
          <div><Label>Bairro</Label><Input name="bairro" /></div>
          <div><Label>Cidade</Label><Input name="cidade" /></div>
          <div><Label>UF</Label><Input name="uf" maxLength={2} /></div>
          <div><Label>Latitude</Label><Input name="lat" type="number" step="any" /></div>
          <div><Label>Longitude</Label><Input name="lng" type="number" step="any" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Características e valor</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-3 gap-4">
          <div><Label>Valor (R$)*</Label><Input name="valor" type="number" step="0.01" required /></div>
          <div><Label>Área total (m²)</Label><Input name="area_total" type="number" step="0.01" /></div>
          <div><Label>Área construída (m²)</Label><Input name="area_construida" type="number" step="0.01" /></div>
          <div><Label>Dormitórios</Label><Input name="dormitorios" type="number" /></div>
          <div><Label>Banheiros</Label><Input name="banheiros" type="number" /></div>
          <div><Label>Vagas</Label><Input name="vagas" type="number" /></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Mídia (fotos e vídeos)</CardTitle></CardHeader>
        <CardContent>
          <input
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
            className="block w-full text-sm file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-arini file:text-white hover:file:bg-arini-light"
          />
          {files.length > 0 && (
            <p className="text-sm text-muted-foreground mt-2">{files.length} arquivo(s) selecionado(s). A primeira imagem será a capa.</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Informações da captação</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label className="mb-2 block">Equipamentos utilizados</Label>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {[
                ["eq_camera", "Câmera"],
                ["eq_drone", "Drone"],
                ["eq_gimbal", "Gimbal"],
                ["eq_celular", "Celular"],
              ].map(([n, l]) => (
                <label key={n} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={n} className="accent-arini" /> {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <Label className="mb-2 block">Material produzido</Label>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
              {[
                ["mat_foto", "Fotos"],
                ["mat_video", "Vídeo"],
                ["mat_reels", "Reels"],
                ["mat_tour", "Tour 360"],
                ["mat_drone", "Drone"],
              ].map(([n, l]) => (
                <label key={n} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name={n} className="accent-arini" /> {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="placa" className="accent-arini" /> Placa colocada no imóvel
            </label>
          </div>
          <div>
            <Label>Relatório / observações</Label>
            <Textarea name="relatorio" rows={3} />
          </div>
        </CardContent>
      </Card>

      {error && <div className="text-sm text-red-600 p-3 rounded-md bg-red-50 border border-red-200">{error}</div>}

      <div className="flex justify-end gap-3">
        <Button type="submit" variant="gold" disabled={loading} size="lg">
          {loading ? "Salvando…" : "Enviar para aprovação"}
        </Button>
      </div>
    </form>
  );
}
