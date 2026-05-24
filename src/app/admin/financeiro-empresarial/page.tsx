import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { ExpenseForm } from "./ExpenseForm";
import { CashFlowChart } from "@/components/crm/CashFlowChart";

export default async function FinanceiroEmpresarialPage() {
  await requireSector(["financeiro", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const [{ data: expenses }, { data: categories }, { data: incomesAll }, { data: expensesAll }] = await Promise.all([
    supabase.from("expenses").select("*, expense_categories(nome)").order("vencimento", { ascending: true }).limit(200),
    supabase.from("expense_categories").select("*").eq("ativo", true),
    supabase.from("incomes").select("valor, data").gte("data", new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().slice(0, 10)),
    supabase.from("expenses").select("valor, vencimento, status").gte("vencimento", new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().slice(0, 10)),
  ]);

  // Monta dados do gráfico (últimos 6 meses)
  const chart = [] as { mes: string; entradas: number; saidas: number; saldo: number }[];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const ano = d.getFullYear();
    const mes = d.getMonth();
    const label = d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");
    const ent = (incomesAll ?? []).filter((r: { data: string }) => {
      const x = new Date(r.data); return x.getFullYear() === ano && x.getMonth() === mes;
    }).reduce((s, r: { valor: number }) => s + Number(r.valor), 0);
    const sai = (expensesAll ?? []).filter((r: { vencimento: string; status: string }) => {
      const x = new Date(r.vencimento); return x.getFullYear() === ano && x.getMonth() === mes && r.status === "pago";
    }).reduce((s, r: { valor: number }) => s + Number(r.valor), 0);
    chart.push({ mes: label, entradas: ent, saidas: sai, saldo: ent - sai });
  }
  const incomes = (incomesAll ?? []).filter((r: { data: string }) => {
    const x = new Date(r.data);
    return x.getFullYear() === new Date().getFullYear() && x.getMonth() === new Date().getMonth();
  });

  const totalDespesas = (expenses ?? []).reduce((s, e: { valor: number; status: string }) => e.status !== "pago" ? s + Number(e.valor) : s, 0);
  const totalReceitasMes = (incomes ?? []).reduce((s, i: { valor: number }) => s + Number(i.valor), 0);
  const vencidas = (expenses ?? []).filter((e: { status: string }) => e.status === "vencido");
  const aVencer = (expenses ?? []).filter((e: { status: string }) => e.status === "pendente");

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Financeiro empresarial</h1>
        <p className="text-muted-foreground mt-1">Despesas fixas, fluxo de caixa e dashboards da empresa.</p>
      </div>

      <div className="grid md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">A pagar</div><div className="text-2xl text-arini font-semibold">{formatCurrencyBRL(totalDespesas)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Vencidas</div><div className="text-2xl text-red-600 font-semibold">{vencidas.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">A vencer</div><div className="text-2xl text-amber-600 font-semibold">{aVencer.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Receitas (mês)</div><div className="text-2xl text-gold-gradient font-semibold">{formatCurrencyBRL(totalReceitasMes)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Fluxo de caixa — últimos 6 meses</CardTitle></CardHeader>
        <CardContent>
          <CashFlowChart data={chart} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Nova despesa</CardTitle></CardHeader>
        <CardContent>
          <ExpenseForm categories={(categories ?? []) as { id: string; nome: string }[]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Despesas</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Vencimento</th><th>Categoria</th><th>Fornecedor</th><th>Valor</th><th>Status</th><th>Recorrência</th></tr>
            </thead>
            <tbody>
              {(expenses ?? []).map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2">{formatDateBR(e.vencimento)}</td>
                  <td>{e.expense_categories?.nome ?? "—"}</td>
                  <td>{e.fornecedor ?? "—"}</td>
                  <td>{formatCurrencyBRL(e.valor)}</td>
                  <td><Badge variant={e.status === "pago" ? "success" : e.status === "vencido" ? "danger" : "warning"}>{e.status}</Badge></td>
                  <td className="text-xs">{e.recorrencia}</td>
                </tr>
              ))}
              {(expenses ?? []).length === 0 && <tr><td colSpan={6} className="py-6 text-center text-muted-foreground">Nenhuma despesa cadastrada.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
