"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

interface Initial {
  id?: string;
  plataformas?: Record<string, boolean>;
  tipos_conteudo?: Record<string, boolean>;
  data_publicacao_prevista?: string | null;
  observacoes?: string | null;
  link_pasta_nuvem?: string | null;
}

const PLATAFORMAS = [
  ["instagram", "Instagram"],
  ["facebook", "Facebook"],
  ["site", "Site"],
  ["portal", "Portal"],
  ["whatsapp", "WhatsApp"],
] as const;

const CONTEUDOS = [
  ["feed", "Feed"],
  ["reels", "Reels"],
  ["story", "Story"],
  ["banner", "Banner"],
  ["video", "Vídeo"],
  ["tour_virtual", "Tour virtual"],
] as const;

export function MarketingForm({ propertyId, initial }: { propertyId: string; initial: Initial | null }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const plataformas = Object.fromEntries(PLATAFORMAS.map(([k]) => [k, fd.get(`pl_${k}`) === "on"]));
    const tipos_conteudo = Object.fromEntries(CONTEUDOS.map(([k]) => [k, fd.get(`ct_${k}`) === "on"]));
    const data_publicacao_prevista = (fd.get("data_pub") as string) || null;
    const observacoes = (fd.get("obs") as string) || null;
    const link_pasta_nuvem = (fd.get("link_pasta") as string) || null;

    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const payload = {
      property_id: propertyId,
      plataformas,
      tipos_conteudo,
      data_publicacao_prevista,
      observacoes,
      link_pasta_nuvem,
      responsavel_id: user?.id,
      status: "aguardando_aprovacao",
    };

    let result;
    if (initial?.id) {
      result = await supabase.from("marketing_campaigns").update(payload).eq("id", initial.id);
    } else {
      result = await supabase.from("marketing_campaigns").insert(payload);
    }
    if (result.error) { setError(result.error.message); setLoading(false); return; }

    await supabase.from("properties").update({ status: "aguardando_aprovacao_marketing" }).eq("id", propertyId);
    await supabase.from("approvals").insert({
      entity_table: "properties",
      entity_id: propertyId,
      stage: "marketing",
      status: "pendente",
      solicitado_por: user?.id,
      payload: { plataformas, tipos_conteudo },
    });

    setLoading(false);
    router.refresh();
    router.push("/admin/marketing");
  }

  return (
    <form onSubmit={submit} className="space-y-6">
      <div>
        <Label className="mb-2 block">Plataformas</Label>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
          {PLATAFORMAS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`pl_${k}`} className="accent-arini" defaultChecked={initial?.plataformas?.[k]} /> {l}
            </label>
          ))}
        </div>
      </div>
      <div>
        <Label className="mb-2 block">Tipo de conteúdo</Label>
        <div className="grid grid-cols-2 md:grid-cols-6 gap-2">
          {CONTEUDOS.map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name={`ct_${k}`} className="accent-arini" defaultChecked={initial?.tipos_conteudo?.[k]} /> {l}
            </label>
          ))}
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <Label>Data prevista de publicação</Label>
          <Input type="date" name="data_pub" defaultValue={initial?.data_publicacao_prevista ?? ""} />
        </div>
        <div>
          <Label>Link pasta na nuvem</Label>
          <Input name="link_pasta" defaultValue={initial?.link_pasta_nuvem ?? ""} />
        </div>
      </div>
      <div>
        <Label>Observações</Label>
        <Textarea name="obs" rows={4} defaultValue={initial?.observacoes ?? ""} />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex justify-end">
        <Button type="submit" variant="gold" disabled={loading}>
          {loading ? "Salvando..." : "Enviar para aprovação"}
        </Button>
      </div>
    </form>
  );
}
