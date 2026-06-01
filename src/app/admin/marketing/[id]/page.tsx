import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { MarketingForm } from "./MarketingForm";
import { MarketingMediaPanel } from "./MarketingMediaPanel";
import { MarketingContents } from "./MarketingContents";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { SectorObservations } from "@/components/crm/SectorObservations";
import { PROPERTY_TYPE_LABELS, CATEGORY_LABELS, type Property, type PropertyMedia, type MarketingMedia, type MarketingContent, type SectorObservation } from "@/lib/types";
import { formatCurrencyBRL } from "@/lib/utils";

export default async function MarketingDetailPage({ params }: { params: { id: string } }) {
  const { user, profile } = await requireSector(["marketing", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: property } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!property) notFound();
  const p = property as Property;

  const [{ data: campaign }, { data: rawMedia }, { data: editedMedia }, { data: contents }, { data: observations }] = await Promise.all([
    supabase.from("marketing_campaigns").select("*").eq("property_id", p.id).maybeSingle(),
    supabase.from("property_media").select("*").eq("property_id", p.id).order("ordem"),
    supabase.from("marketing_media").select("*").eq("property_id", p.id).eq("fase", "editada").order("created_at", { ascending: false }),
    supabase.from("marketing_contents").select("*").eq("property_id", p.id).order("data_publicacao", { ascending: true }),
    supabase.from("sector_observations").select("*").eq("entity_table", "marketing_campaigns").eq("entity_id", p.id).order("created_at", { ascending: false }),
  ]);

  const campaignId = campaign?.id ?? null;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <div className="text-xs text-muted-foreground font-mono">{p.codigo}</div>
        <h1 className="font-display text-3xl text-arini">{p.titulo || PROPERTY_TYPE_LABELS[p.type]}</h1>
        <div className="mt-2 flex gap-2 items-center">
          <StatusBadge status={p.status} />
          <span className="text-sm text-muted-foreground">
            {PROPERTY_TYPE_LABELS[p.type]} · {CATEGORY_LABELS[p.category]} · {formatCurrencyBRL(p.valor)}
          </span>
        </div>
        <div className="text-sm text-muted-foreground mt-1">{[p.endereco, p.bairro, p.cidade, p.uf].filter(Boolean).join(", ") || "—"}</div>
      </div>

      <Card>
        <CardHeader><CardTitle>Configuração de divulgação</CardTitle></CardHeader>
        <CardContent>
          <MarketingForm propertyId={p.id} initial={campaign} />
        </CardContent>
      </Card>

      <MarketingMediaPanel
        propertyId={p.id}
        campaignId={campaignId}
        raw={(rawMedia ?? []) as PropertyMedia[]}
        edited={(editedMedia ?? []) as MarketingMedia[]}
      />

      <MarketingContents
        propertyId={p.id}
        campaignId={campaignId}
        initial={(contents ?? []) as MarketingContent[]}
      />

      {profile && (
        <SectorObservations
          entityTable="marketing_campaigns"
          entityId={p.id}
          currentUserId={user.id}
          currentSector={profile.sector}
          initial={(observations ?? []) as SectorObservation[]}
        />
      )}
    </div>
  );
}
