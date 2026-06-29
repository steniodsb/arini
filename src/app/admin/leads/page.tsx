import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { LeadsKanban } from "./LeadsKanban";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { LeadFunnelChart } from "@/components/crm/LeadFunnelChart";
import Link from "next/link";
import { Plus } from "lucide-react";
import { LEAD_STAGES, LEAD_ORIGINS, type Lead } from "@/lib/types";

export default async function LeadsPage({ searchParams }: { searchParams: { origem?: string } }) {
  await requireSector(["recepcao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const origem = searchParams.origem ?? "";
  let q = supabase.from("leads").select("*").order("ultima_interacao_em", { ascending: false }).limit(500);
  if (origem) q = q.eq("origem", origem);
  const { data } = await q;
  const leads = (data ?? []) as Lead[];

  // Stats
  const byStage = LEAD_STAGES.map((s) => ({
    name: s.label,
    value: leads.filter((l) => l.stage === s.key).length,
  })).filter((x) => x.value > 0);

  const origens: Record<string, number> = {};
  for (const l of leads) origens[l.origem] = (origens[l.origem] ?? 0) + 1;
  const byOrigem = Object.entries(origens).map(([name, value]) => ({ name, value }));

  const fechados = leads.filter((l) => l.stage === "fechado").length;
  const conversao = leads.length > 0 ? ((fechados / leads.length) * 100).toFixed(1) : "0";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Leads</h1>
          <p className="text-muted-foreground mt-1">Funil de atendimento e prospecção.</p>
        </div>
        <Button asChild variant="gold">
          <Link href="/admin/leads/novo"><Plus size={16} /> Novo lead</Link>
        </Button>
      </div>

      {/* Filtro por origem (Instagram, Facebook, TikTok, WhatsApp, site…) */}
      <div className="flex flex-wrap gap-2">
        <Link
          href="/admin/leads"
          className={`px-3 py-1.5 rounded-md text-sm border ${!origem ? "bg-arini text-white border-arini" : "bg-white hover:bg-muted"}`}
        >
          Todas as origens
        </Link>
        {LEAD_ORIGINS.map((o) => (
          <Link
            key={o}
            href={`/admin/leads?origem=${o}`}
            className={`px-3 py-1.5 rounded-md text-sm border capitalize ${origem === o ? "bg-arini text-white border-arini" : "bg-white hover:bg-muted"}`}
          >
            {o.replace("_", " ")}
          </Link>
        ))}
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Total leads</div>
          <div className="text-2xl text-arini font-semibold">{leads.length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Em atendimento</div>
          <div className="text-2xl text-blue-600 font-semibold">{leads.filter((l) => !["fechado","perdido","pos_venda"].includes(l.stage)).length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Fechados</div>
          <div className="text-2xl text-emerald-600 font-semibold">{fechados}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Conversão</div>
          <div className="text-2xl text-gold-gradient font-semibold">{conversao}%</div>
        </CardContent></Card>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Distribuição no funil</CardTitle></CardHeader>
          <CardContent>{byStage.length > 0 ? <LeadFunnelChart data={byStage} /> : <p className="text-sm text-muted-foreground text-center py-12">Sem dados.</p>}</CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Origem dos leads</CardTitle></CardHeader>
          <CardContent>{byOrigem.length > 0 ? <LeadFunnelChart data={byOrigem} /> : <p className="text-sm text-muted-foreground text-center py-12">Sem dados.</p>}</CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Kanban</CardTitle></CardHeader>
        <CardContent>
          <LeadsKanban initial={leads} />
        </CardContent>
      </Card>
    </div>
  );
}
