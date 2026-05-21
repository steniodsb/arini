import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Building2, Users, FileCheck2, AlertTriangle, TrendingUp, Banknote } from "lucide-react";
import { formatCurrencyBRL } from "@/lib/utils";
import { SECTOR_LABELS } from "@/lib/types";
import Link from "next/link";

export default async function AdminDashboard({ searchParams }: { searchParams: { error?: string } }) {
  const { profile } = await requireUser();
  if (!profile) return null;
  const supabase = createSupabaseServer();

  const [
    { count: propsCount },
    { count: leadsCount },
    { count: pendingApprovals },
    { count: overdueExpenses },
    { data: pipelineFinancials },
  ] = await Promise.all([
    supabase.from("properties").select("*", { count: "exact", head: true }),
    supabase.from("leads").select("*", { count: "exact", head: true }).neq("stage", "perdido"),
    supabase.from("approvals").select("*", { count: "exact", head: true }).eq("status", "pendente"),
    supabase.from("expenses").select("*", { count: "exact", head: true }).eq("status", "vencido"),
    supabase.from("property_financials").select("valor_fechado").gte("data_fechamento", new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()),
  ]);

  const receitaMes = (pipelineFinancials ?? []).reduce(
    (s, r: { valor_fechado: number }) => s + Number(r.valor_fechado || 0),
    0,
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl text-arini">Dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Olá, {profile.nome}. Setor:{" "}
          <span className="text-gold-dark font-medium">
            {profile.is_admin_central ? "Administração Central" : SECTOR_LABELS[profile.sector]}
          </span>
        </p>
      </div>

      {searchParams.error === "forbidden" && (
        <div className="rounded-md border border-amber-300 bg-amber-50 p-4 text-amber-900 text-sm">
          Você não tem permissão para acessar essa área.
        </div>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Stat icon={<Building2 />} label="Imóveis cadastrados" value={String(propsCount ?? 0)} href="/admin/captacao" />
        <Stat icon={<Users />} label="Leads ativos" value={String(leadsCount ?? 0)} href="/admin/leads" />
        <Stat icon={<FileCheck2 />} label="Aprovações pendentes" value={String(pendingApprovals ?? 0)} href="/admin/aprovacoes" />
        <Stat icon={<AlertTriangle />} label="Contas vencidas" value={String(overdueExpenses ?? 0)} href="/admin/financeiro-empresarial" />
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><TrendingUp size={18} /> Fechamentos este mês</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-semibold text-gold-gradient">{formatCurrencyBRL(receitaMes)}</div>
            <p className="text-sm text-muted-foreground mt-1">Soma dos valores fechados no mês corrente.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Banknote size={18} /> Atalhos</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Link href="/admin/captacao/novo" className="block text-sm text-arini hover:text-gold-dark">→ Nova captação</Link>
            <Link href="/admin/leads" className="block text-sm text-arini hover:text-gold-dark">→ Funil de leads</Link>
            <Link href="/admin/aprovacoes" className="block text-sm text-arini hover:text-gold-dark">→ Inbox de aprovações</Link>
            <Link href="/admin/financeiro-empresarial" className="block text-sm text-arini hover:text-gold-dark">→ Financeiro empresarial</Link>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Stat({ icon, label, value, href }: { icon: React.ReactNode; label: string; value: string; href: string }) {
  return (
    <Link href={href} className="block rounded-lg border bg-card p-5 hover:shadow-md transition-all">
      <div className="text-gold-dark mb-3">{icon}</div>
      <div className="text-3xl font-display text-arini">{value}</div>
      <div className="text-xs uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
    </Link>
  );
}
