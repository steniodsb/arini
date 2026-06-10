import { requireSector, isDiretoria, canCreateMoney } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { ExpenseForm } from "./ExpenseForm";
import { CashFlowChart } from "@/components/crm/CashFlowChart";
import { ExpenseDateFilter } from "./ExpenseDateFilter";
import { TransactionActions } from "@/components/crm/TransactionActions";
import { MarkPaidButton } from "@/components/crm/MarkPaidButton";
import { WalletSection } from "@/components/crm/WalletSection";
import { CommissionsSection } from "./CommissionsSection";

const EXPENSE_STATUS_OPTS = [
  { value: "pendente", label: "Pendente" },
  { value: "pago", label: "Pago" },
  { value: "vencido", label: "Vencido" },
  { value: "renegociado", label: "Renegociado" },
];

export default async function FinanceiroEmpresarialPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const { profile } = await requireSector(["financeiro", "administrativo", "admin_central"]);
  const canManage = isDiretoria(profile);
  const podeLancar = canCreateMoney(profile);
  const supabase = createSupabaseServer();

  let expQuery = supabase.from("expenses").select("*, expense_categories(nome)").order("vencimento", { ascending: true }).limit(300);
  if (searchParams.from) expQuery = expQuery.gte("vencimento", searchParams.from);
  if (searchParams.to) expQuery = expQuery.lte("vencimento", searchParams.to);

  const [{ data: expenses }, { data: categories }, { data: incomesAll }, { data: expensesAll }, { data: accounts }, { data: properties }, { data: clients }] = await Promise.all([
    expQuery,
    supabase.from("expense_categories").select("*").eq("ativo", true),
    supabase.from("incomes").select("valor, data").gte("data", new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().slice(0, 10)),
    supabase.from("expenses").select("valor, vencimento, status").gte("vencimento", new Date(new Date().getFullYear(), new Date().getMonth() - 5, 1).toISOString().slice(0, 10)),
    supabase.from("bank_accounts").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("properties").select("id, codigo, titulo").order("codigo"),
    supabase.from("clients").select("id, nome").order("nome"),
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

      <WalletSection canManage={canManage} />

      <Card>
        <CardHeader><CardTitle>Fluxo de caixa — últimos 6 meses</CardTitle></CardHeader>
        <CardContent>
          <CashFlowChart data={chart} />
        </CardContent>
      </Card>

      <CommissionsSection canManage={canManage} podeLancar={podeLancar} />

      <Card>
        <CardHeader><CardTitle>Nova despesa</CardTitle></CardHeader>
        <CardContent>
          <ExpenseForm
            categories={(categories ?? []) as { id: string; nome: string }[]}
            accounts={(accounts ?? []) as { id: string; nome: string }[]}
            properties={(properties ?? []) as { id: string; codigo: string; titulo: string | null }[]}
            clients={(clients ?? []) as { id: string; nome: string }[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Despesas</CardTitle>
          <ExpenseDateFilter from={searchParams.from ?? ""} to={searchParams.to ?? ""} />
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Vencimento</th><th>Tipo</th><th>Categoria</th><th>Fornecedor</th><th>Valor</th><th>Status</th><th>Recorrência</th>{canManage && <th className="text-right">Ações</th>}</tr>
            </thead>
            <tbody>
              {(expenses ?? []).map((e) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2">{formatDateBR(e.vencimento)}</td>
                  <td className="capitalize text-xs">{e.tipo_gasto ?? "empresa"}</td>
                  <td>{e.expense_categories?.nome ?? "—"}</td>
                  <td>{e.fornecedor ?? "—"}</td>
                  <td>{formatCurrencyBRL(e.valor)}</td>
                  <td><Badge variant={e.status === "pago" ? "success" : e.status === "vencido" ? "danger" : "warning"}>{e.status}</Badge></td>
                  <td className="text-xs">{e.recorrencia}</td>
                  {canManage && (
                    <td>
                      <div className="flex items-center gap-1 justify-end">
                        <MarkPaidButton id={e.id} paid={e.status === "pago"} />
                        <TransactionActions
                          table="expenses"
                          id={e.id}
                          title="Editar despesa"
                          canManage={canManage}
                          fields={[
                            { name: "fornecedor", label: "Fornecedor", type: "text", value: e.fornecedor },
                            { name: "descricao", label: "Descrição", type: "text", value: e.descricao },
                            { name: "valor", label: "Valor (R$)", type: "number", step: "0.01", value: e.valor },
                            { name: "vencimento", label: "Vencimento", type: "date", value: e.vencimento },
                            { name: "status", label: "Status", type: "select", value: e.status, options: EXPENSE_STATUS_OPTS },
                          ]}
                        />
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {(expenses ?? []).length === 0 && <tr><td colSpan={canManage ? 8 : 7} className="py-6 text-center text-muted-foreground">Nenhuma despesa cadastrada.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
