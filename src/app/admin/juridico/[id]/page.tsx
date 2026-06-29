import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { JuridicoForm } from "./JuridicoForm";
import { PropertyDocuments } from "./PropertyDocuments";
import { PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

export default async function JuridicoDetailPage({ params }: { params: { id: string } }) {
  await requireSector(["juridico", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: property } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!property) notFound();
  const p = property as Property;
  const { data: legal } = await supabase.from("legal_records").select("*").eq("property_id", p.id).maybeSingle();
  const { data: contracts } = await supabase.from("contracts").select("*").eq("property_id", p.id).order("criado_em", { ascending: false });
  const { data: docs } = await supabase.from("property_documents").select("*").eq("property_id", p.id).order("created_at", { ascending: false });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl text-arini">Análise jurídica</h1>
        <p className="text-muted-foreground mt-1">{p.codigo} — {p.titulo || PROPERTY_TYPE_LABELS[p.type]}</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Validação documental</CardTitle></CardHeader>
        <CardContent><JuridicoForm propertyId={p.id} initial={legal} /></CardContent>
      </Card>

      <PropertyDocuments
        propertyId={p.id}
        initial={(docs ?? []) as { id: string; tipo: string; nome: string | null; url: string; storage_path: string | null; created_at: string }[]}
      />
      <Card>
        <CardHeader><CardTitle>Contratos</CardTitle></CardHeader>
        <CardContent>
          {(contracts ?? []).length === 0 && <p className="text-sm text-muted-foreground">Nenhum contrato gerado.</p>}
          <ul className="space-y-2 text-sm">
            {(contracts ?? []).map((c) => (
              <li key={c.id} className="border-b pb-2 flex justify-between">
                <span>{c.tipo} — {c.status_assinatura}</span>
                {c.arquivo_url && <a className="text-arini hover:text-gold-dark" href={c.arquivo_url} target="_blank">Abrir</a>}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
