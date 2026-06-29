import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { EditPropertyForm } from "./EditPropertyForm";
import { PropertyMediaManager } from "@/components/crm/PropertyMediaManager";
import type { Property, PropertyMedia } from "@/lib/types";

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  await requireSector(["captacao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!data) notFound();
  const [{ data: owners }, { data: media }] = await Promise.all([
    supabase.from("owners").select("id, nome").order("nome"),
    supabase.from("property_media").select("*").eq("property_id", params.id).order("ordem"),
  ]);

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-3xl text-arini">Editar imóvel</h1>
      <p className="text-muted-foreground mt-1">Código: <span className="font-mono">{(data as Property).codigo}</span></p>
      <div className="mt-6 space-y-6">
        <EditPropertyForm property={data as Property} owners={(owners ?? []) as { id: string; nome: string }[]} />
        <PropertyMediaManager propertyId={params.id} initial={(media ?? []) as PropertyMedia[]} />
      </div>
    </div>
  );
}
