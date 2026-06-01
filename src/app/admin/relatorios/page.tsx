import { requireDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyBRL } from "@/lib/utils";
import { DateRangeForm } from "./DateRangeForm";

function defaultRange() {
  const now = new Date();
  const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  return { from, to };
}

export default async function RelatoriosPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  await requireDiretoria();
  const supabase = createSupabaseServer();
  const def = defaultRange();
  const from = searchParams.from || def.from;
  const to = searchParams.to || def.to;

  const [{ data: incomes }, { data: expenses }, { data: financials }, { data: commissions }] = await Promise.all([
    supabase.from("incomes").select("valor, data").gte("data", from).lte("data", to),
    supabase.from("expenses").select("valor, vencimento, status, tipo_gasto").gte("vencimento", from).lte("vencimento", to),
    supabase.from("property_financials").select("valor_fechado, data_fechamento, operation_type").gte("data_fechamento", from).lte("data_fechamento", to),
    supabase.from("commissions").select("valor, status, created_at").gte("created_at", from).lte("created_at", `${to}T23:59:59`),
  ]);

  const totalEntradas = (incomes ?? []).reduce((s, r: { valor: number }) => s + Number(r.valor), 0);
  const totalSaidas = (expenses ?? []).filter((e: { status: string }) => e.status === "pago").reduce((s, r: { valor: number }) => s + Number(r.valor), 0);
  const totalSaidasPrev = (expenses ?? []).reduce((s, r: { valor: number }) => s + Number(r.valor), 0);
  const totalFechamentos = (financials ?? []).reduce((s, r: { valor_fechado: number }) => s + Number(r.valor_fechado), 0);
  const totalComissoes = (commissions ?? []).reduce((s, r: { valor: number }) => s + Number(r.valor), 0);
  const comissoesPagas = (commissions ?? []).filter((c: { status: string }) => c.status === "pago").reduce((s, r: { valor: number }) => s + Number(r.valor), 0);

  const gastoPorTipo: Record<string, number> = {};
  for (const e of (expenses ?? []) as { valor: number; tipo_gasto?: string }[]) {
    const k = e.tipo_gasto ?? "empresa";
    gastoPorTipo[k] = (gastoPorTipo[k] ?? 0) + Number(e.valor);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Relatórios</h1>
        <p className="text-muted-foreground mt-1">Exclusivo da diretoria. Selecione o período desejado.</p>
      </div>

      <Card>
        <CardHeader><CardTitle>Período</CardTitle></CardHeader>
        <CardContent><DateRangeForm from={from} to={to} /></CardContent>
      </Card>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Entradas</div><div className="text-2xl text-emerald-700 font-semibold">{formatCurrencyBRL(totalEntradas)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Saídas (pagas)</div><div className="text-2xl text-red-600 font-semibold">{formatCurrencyBRL(totalSaidas)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Saldo do período</div><div className="text-2xl text-arini font-semibold">{formatCurrencyBRL(totalEntradas - totalSaidas)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Despesas previstas</div><div className="text-2xl text-amber-600 font-semibold">{formatCurrencyBRL(totalSaidasPrev)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Fechamentos (imóveis)</div><div className="text-2xl text-gold-gradient font-semibold">{formatCurrencyBRL(totalFechamentos)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Comissões ({formatCurrencyBRL(comissoesPagas)} pagas)</div><div className="text-2xl text-arini font-semibold">{formatCurrencyBRL(totalComissoes)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Gastos por tipo</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Tipo</th><th>Total</th></tr></thead>
            <tbody>
              {Object.entries(gastoPorTipo).map(([k, v]) => (
                <tr key={k} className="border-t"><td className="py-2 capitalize">{k}</td><td>{formatCurrencyBRL(v)}</td></tr>
              ))}
              {Object.keys(gastoPorTipo).length === 0 && <tr><td colSpan={2} className="py-6 text-center text-muted-foreground">Sem despesas no período.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
