import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PROPERTY_TYPE_LABELS, type LegalStatus, type Property } from "@/lib/types";

const STATUS_BADGE: Record<LegalStatus, "muted" | "warning" | "success" | "danger"> = {
  nao_iniciado: "muted",
  em_analise: "warning",
  pendente: "warning",
  aprovado: "success",
  reprovado: "danger",
};

export default async function JuridicoPage() {
  await requireSector(["juridico", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: properties } = await supabase.from("properties").select("*").limit(200);
  const ids = (properties ?? []).map((p) => p.id);
  const recordsById: Record<string, { status: LegalStatus; data_analise: string | null }> = {};
  if (ids.length) {
    const { data: legal } = await supabase.from("legal_records").select("*").in("property_id", ids);
    for (const l of legal ?? []) recordsById[l.property_id] = l;
  }
  const list = (properties ?? []) as Property[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Jurídico</h1>
        <p className="text-muted-foreground mt-1">Análise documental, contratos e validações jurídicas.</p>
      </div>
      <div className="grid lg:grid-cols-2 gap-4">
        {list.map((p) => {
          const rec = recordsById[p.id];
          const status = rec?.status ?? "nao_iniciado";
          return (
            <Card key={p.id}>
              <CardHeader>
                <CardTitle className="flex items-center justify-between">
                  <span className="text-base">{p.codigo} — {p.titulo || PROPERTY_TYPE_LABELS[p.type]}</span>
                  <Badge variant={STATUS_BADGE[status]}>{status}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">{p.cidade}{p.uf && `/${p.uf}`}</p>
                <Link href={`/admin/juridico/${p.id}`} className="text-sm text-arini hover:text-gold-dark mt-2 inline-block">Abrir análise →</Link>
              </CardContent>
            </Card>
          );
        })}
        {list.length === 0 && (
          <Card><CardContent className="py-10 text-center text-muted-foreground">Sem imóveis cadastrados.</CardContent></Card>
        )}
      </div>
    </div>
  );
}
