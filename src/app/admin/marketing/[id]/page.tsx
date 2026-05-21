import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { MarketingForm } from "./MarketingForm";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { PROPERTY_TYPE_LABELS, CATEGORY_LABELS, type Property } from "@/lib/types";
import { formatCurrencyBRL } from "@/lib/utils";

export default async function MarketingDetailPage({ params }: { params: { id: string } }) {
  await requireSector(["marketing", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: property } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!property) notFound();
  const p = property as Property;
  const { data: campaign } = await supabase.from("marketing_campaigns").select("*").eq("property_id", p.id).maybeSingle();

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
      </div>

      <Card>
        <CardHeader><CardTitle>Configuração de divulgação</CardTitle></CardHeader>
        <CardContent>
          <MarketingForm propertyId={p.id} initial={campaign} />
        </CardContent>
      </Card>
    </div>
  );
}
