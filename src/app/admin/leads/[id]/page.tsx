import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR, formatCurrencyBRL } from "@/lib/utils";
import { LEAD_STAGES, type Lead } from "@/lib/types";
import { LeadInteractions } from "./LeadInteractions";
import Link from "next/link";

export default async function LeadDetailPage({ params }: { params: { id: string } }) {
  await requireSector(["recepcao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("leads").select("*").eq("id", params.id).single();
  if (!data) notFound();
  const lead = data as Lead;

  const [{ data: interactions }, { data: appointments }, { data: prop }] = await Promise.all([
    supabase.from("lead_interactions").select("*").eq("lead_id", lead.id).order("created_at", { ascending: false }),
    supabase.from("lead_appointments").select("*").eq("lead_id", lead.id).order("data_hora", { ascending: false }),
    lead.imovel_interesse_id
      ? supabase.from("properties").select("id, codigo, titulo, cidade, valor").eq("id", lead.imovel_interesse_id).maybeSingle()
      : Promise.resolve({ data: null }),
  ]);

  const stageObj = LEAD_STAGES.find((s) => s.key === lead.stage);

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">{lead.nome}</h1>
          <div className="mt-2 flex gap-2 items-center">
            <Badge variant="gold">{stageObj?.label}</Badge>
            <Badge variant="outline">Origem: {lead.origem}</Badge>
          </div>
        </div>
        <div className="text-right text-sm text-muted-foreground">
          <div>Criado em {formatDateTimeBR(lead.created_at)}</div>
          <div>Última interação {formatDateTimeBR(lead.ultima_interacao_em)}</div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Contato</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div>WhatsApp: {lead.whatsapp ?? "—"}</div>
            <div>Telefone: {lead.telefone ?? "—"}</div>
            <div>E-mail: {lead.email ?? "—"}</div>
            <div>Perfil: {lead.perfil ?? "—"}</div>
            <div>Urgência: {lead.urgencia ?? "—"}</div>
            <div>Faixa: {formatCurrencyBRL(lead.faixa_valor_min)} – {formatCurrencyBRL(lead.faixa_valor_max)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Imóvel de interesse</CardTitle></CardHeader>
          <CardContent className="text-sm">
            {prop ? (
              <Link href={`/admin/captacao/${prop.id}`} className="text-arini hover:text-gold-dark">
                {prop.codigo} — {prop.titulo ?? prop.cidade}
                <div className="text-muted-foreground text-xs">{formatCurrencyBRL(prop.valor)}</div>
              </Link>
            ) : <span className="text-muted-foreground">Nenhum vinculado</span>}
            {lead.observacoes && (
              <div className="mt-3 p-3 rounded-md bg-muted text-muted-foreground whitespace-pre-line text-xs">
                {lead.observacoes}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <LeadInteractions leadId={lead.id} interactions={interactions ?? []} appointments={appointments ?? []} />
    </div>
  );
}
