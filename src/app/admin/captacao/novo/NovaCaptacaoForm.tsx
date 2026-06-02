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
import { MediaUploader } from "@/components/crm/MediaUploader";
import { uploadPropertyMedia } from "@/lib/upload";
import { errMessage } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  PROPERTY_TYPE_LABELS,
  SECTOR_LABELS,
  type PropertyCategory,
  type PropertyType,
  type Sector,
} from "@/lib/types";

// Setores que podem receber a observação da captação.
const TARGET_SECTORS: Sector[] = [
  "marketing", "administrativo", "juridico", "financeiro", "recepcao", "admin_central",
];

export function NovaCaptacaoForm() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploadMsg, setUploadMsg] = useState<string | null>(null);
  const [obsSector, setObsSector] = useState<Sector>("marketing");

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: userData } = await supabase.auth.getUser();
    const userId = userData.user?.id;
    let autorSector: Sector | null = null;
    if (userId) {
      const { data: prof } = await supabase.from("profiles").select("sector").eq("id", userId).single();
      autorSector = (prof?.sector as Sector) ?? null;
    }

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
        maps_url: (fd.get("maps_url") as string)?.trim() || null,
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
      const relatorioText = (fd.get("relatorio") as string)?.trim() || null;
      const { error: capErr } = await supabase.from("property_capture_info").insert({
        property_id: property.id,
        utilizou_camera: fd.get("eq_camera") === "on",
        utilizou_drone: fd.get("eq_drone") === "on",
        utilizou_gimbal: fd.get("eq_gimbal") === "on",
        utilizou_celular: fd.get("eq_celular") === "on",
        materiais,
        relatorio_texto: relatorioText,
        placa_colocada: fd.get("placa") === "on",
      });
      if (capErr) throw capErr;

      // Observação direcionada: o relatório também vira uma observação para o
      // setor escolhido (cai como notificação nele, via trigger).
      if (relatorioText) {
        const { error: obsErr } = await supabase.from("sector_observations").insert({
          entity_table: "properties",
          entity_id: property.id,
          target_sector: obsSector,
          autor_id: userId,
          autor_sector: autorSector,
          texto: relatorioText,
        });
        if (obsErr) console.warn("Falha ao registrar observação direcionada:", obsErr.message);
      }

      // Upload de mídia (robusto: retry + continua mesmo se algum falhar)
      let uploadFailures = 0;
      if (files.length > 0) {
        const result = await uploadPropertyMedia(supabase, property.id, files, {
          onProgress: (done, total, name) =>
            setUploadMsg(
              done < total ? `Enviando mídia ${done + 1}/${total}: ${name}` : "Mídia enviada.",
            ),
        });
        uploadFailures = result.failed.length;
        if (uploadFailures > 0) {
          setError(
            `Imóvel criado, mas ${uploadFailures} arquivo(s) falharam no upload: ${result.failed
              .map((f) => f.name)
              .join(", ")}. Abra a edição do imóvel para reenviá-los.`,
          );
        }
      }

      // Cria approval
      const { error: apprErr } = await supabase.from("approvals").insert({
        entity_table: "properties",
        entity_id: property.id,
        stage: "captacao",
        status: "pendente",
        solicitado_por: userId,
        payload: { codigo, type, category },
      });
      if (apprErr) throw apprErr;

      // Só navega automaticamente se tudo subiu; senão deixa a msg visível.
      if (uploadFailures === 0) {
        router.push(`/admin/captacao/${property.id}`);
        router.refresh();
      } else {
        setLoading(false);
      }
    } catch (e) {
      console.error("Erro ao salvar captação:", e);
      setError(errMessage(e));
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
          <div className="md:col-span-3">
            <Label>Link do Google Maps</Label>
            <Input name="maps_url" type="url" placeholder="Cole aqui o link compartilhado do Google Maps (https://maps.app.goo.gl/…)" />
            <p className="text-xs text-muted-foreground mt-1">Opcional. Se preenchido, é usado no botão “Ver no Maps” do CRM e do site.</p>
          </div>
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
        <CardHeader><CardTitle>Mídia (fotos, vídeos e mídia bruta)</CardTitle></CardHeader>
        <CardContent>
          <MediaUploader onChange={setFiles} />
          {uploadMsg && <p className="text-sm text-muted-foreground mt-3">{uploadMsg}</p>}
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
            <Textarea name="relatorio" rows={3} placeholder="Escreva o relatório/observação da captação…" />
            <div className="flex flex-wrap items-center gap-2 mt-2">
              <span className="text-xs text-muted-foreground">Enviar esta observação para o setor:</span>
              <Select
                value={obsSector}
                onChange={(e) => setObsSector(e.target.value as Sector)}
                className="w-auto min-w-[200px]"
              >
                {TARGET_SECTORS.map((s) => (
                  <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
                ))}
              </Select>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              O setor escolhido recebe uma notificação com esta observação.
            </p>
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
