import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { EditPropertyForm } from "./EditPropertyForm";
import { PropertyMediaBlock } from "@/components/crm/PropertyMediaBlock";
import type { MarketingMedia, Property, PropertyMedia } from "@/lib/types";

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  await requireSector(["captacao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!data) notFound();
  const [{ data: owners }, { data: media }, { data: edited }, { data: campaign }] = await Promise.all([
    supabase.from("owners").select("id, nome").order("nome"),
    supabase.from("property_media").select("*").eq("property_id", params.id).order("ordem"),
    supabase.from("marketing_media").select("*").eq("property_id", params.id).eq("fase", "editada").order("created_at", { ascending: false }),
    supabase.from("marketing_campaigns").select("id").eq("property_id", params.id).maybeSingle(),
  ]);
  const p = data as Property;

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-3xl text-arini">Editar imóvel</h1>
      <p className="text-muted-foreground mt-1">Código: <span className="font-mono">{p.codigo}</span></p>
      <div className="mt-6 space-y-6">
        <EditPropertyForm property={p} owners={(owners ?? []) as { id: string; nome: string }[]} />
        <PropertyMediaBlock
          propertyId={params.id}
          coverUrl={p.foto_principal_url}
          coverPath={p.foto_principal_path}
          campaignId={(campaign?.id as string | undefined) ?? null}
          rawMedia={(media ?? []) as PropertyMedia[]}
          editedMedia={(edited ?? []) as MarketingMedia[]}
        />
      </div>
    </div>
  );
}
