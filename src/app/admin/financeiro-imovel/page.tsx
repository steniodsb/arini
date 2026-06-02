import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { FinanceiroImovelForm } from "./FinanceiroImovelForm";
import { ExpenseForm } from "../financeiro-empresarial/ExpenseForm";
import { ImovelDateFilter } from "./ImovelDateFilter";
import { TransactionActions } from "@/components/crm/TransactionActions";

const EXPENSE_STATUS_OPTS = [
  { value: "pendente", label: "Pendente" },
  { value: "pago", label: "Pago" },
  { value: "vencido", label: "Vencido" },
  { value: "renegociado", label: "Renegociado" },
];
const COMMISSION_STATUS_OPTS = [
  { value: "pendente", label: "Pendente" },
  { value: "parcial", label: "Parcial" },
  { value: "pago", label: "Pago" },
];

export default async function FinanceiroImovelPage({ searchParams }: { searchParams: { from?: string; to?: string } }) {
  const { profile } = await requireSector(["financeiro", "administrativo", "admin_central"]);
  const canManage = isDiretoria(profile);
  const supabase = createSupabaseServer();
  const { from, to } = searchParams;

  let finQuery = supabase.from("property_financials").select("*").order("data_fechamento", { ascending: false }).limit(200);
  if (from) finQuery = finQuery.gte("data_fechamento", from);
  if (to) finQuery = finQuery.lte("data_fechamento", to);

  // Despesas de imóvel/cliente (tipo_gasto) com filtro de período por vencimento.
  let expQuery = supabase
    .from("expenses")
    .select("*, expense_categories(nome), properties(codigo), clients(nome)")
    .in("tipo_gasto", ["imovel", "cliente"])
    .order("vencimento", { ascending: false })
    .limit(200);
  if (from) expQuery = expQuery.gte("vencimento", from);
  if (to) expQuery = expQuery.lte("vencimento", to);

  const [{ data: financials }, { data: expenses }, { data: properties }, { data: clients }, { data: categories }, { data: accounts }] = await Promise.all([
    finQuery,
    expQuery,
    supabase.from("properties").select("id, codigo, titulo").order("codigo"),
    supabase.from("clients").select("id, nome").order("nome"),
    supabase.from("expense_categories").select("*").eq("ativo", true),
    supabase.from("bank_accounts").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const totalReceita = (financials ?? []).reduce((s, f: { valor_fechado: number }) => s + Number(f.valor_fechado || 0), 0);
  const totalComissao = (financials ?? []).reduce((s, f: { comissao_valor: number | null }) => s + Number(f.comissao_valor || 0), 0);
  const totalDespesas = (expenses ?? []).reduce((s, e: { valor: number }) => s + Number(e.valor || 0), 0);
  const periodoLabel = from || to ? `${from ? formatDateBR(from) : "início"} → ${to ? formatDateBR(to) : "hoje"}` : "todos os períodos";

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Financeiro do imóvel</h1>
        <p className="text-muted-foreground mt-1">Fechamentos, comissões, despesas de imóvel/cliente e relatório por período.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Relatório por período</CardTitle>
          <ImovelDateFilter from={from ?? ""} to={to ?? ""} />
        </CardHeader>
        <CardContent className="grid md:grid-cols-4 gap-4">
          <div><div className="text-xs uppercase text-muted-foreground">Período</div><div className="text-sm font-medium text-arini">{periodoLabel}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Receita (fechamentos)</div><div className="text-2xl text-gold-gradient font-semibold">{formatCurrencyBRL(totalReceita)}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Comissão gerada</div><div className="text-2xl text-arini font-semibold">{formatCurrencyBRL(totalComissao)}</div></div>
          <div><div className="text-xs uppercase text-muted-foreground">Despesas (imóvel/cliente)</div><div className="text-2xl text-red-600 font-semibold">{formatCurrencyBRL(totalDespesas)}</div></div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Registrar fechamento</CardTitle></CardHeader>
        <CardContent>
          <FinanceiroImovelForm properties={(properties ?? []) as { id: string; codigo: string; titulo: string | null }[]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Nova despesa de imóvel / cliente</CardTitle></CardHeader>
        <CardContent>
          <ExpenseForm
            defaultTipo="imovel"
            categories={(categories ?? []) as { id: string; nome: string }[]}
            accounts={(accounts ?? []) as { id: string; nome: string }[]}
            properties={(properties ?? []) as { id: string; codigo: string; titulo: string | null }[]}
            clients={(clients ?? []) as { id: string; nome: string }[]}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Despesas de imóvel / cliente</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Vencimento</th><th>Tipo</th><th>Vínculo</th><th>Categoria</th><th>Valor</th><th>Status</th>{canManage && <th className="text-right">Ações</th>}</tr>
            </thead>
            <tbody>
              {(expenses ?? []).map((e: { id: string; vencimento: string; tipo_gasto: string; valor: number; status: string; descricao?: string | null; fornecedor?: string | null; expense_categories?: { nome: string }; properties?: { codigo: string }; clients?: { nome: string } }) => (
                <tr key={e.id} className="border-t">
                  <td className="py-2">{formatDateBR(e.vencimento)}</td>
                  <td className="capitalize text-xs">{e.tipo_gasto}</td>
                  <td>{e.properties?.codigo ?? e.clients?.nome ?? "—"}</td>
                  <td>{e.expense_categories?.nome ?? "—"}</td>
                  <td>{formatCurrencyBRL(e.valor)}</td>
                  <td><Badge variant={e.status === "pago" ? "success" : e.status === "vencido" ? "danger" : "warning"}>{e.status}</Badge></td>
                  {canManage && (
                    <td>
                      <TransactionActions
                        table="expenses"
                        id={e.id}
                        title="Editar despesa"
                        canManage={canManage}
                        fields={[
                          { name: "fornecedor", label: "Fornecedor", type: "text", value: e.fornecedor ?? null },
                          { name: "descricao", label: "Descrição", type: "text", value: e.descricao ?? null },
                          { name: "valor", label: "Valor (R$)", type: "number", step: "0.01", value: e.valor },
                          { name: "vencimento", label: "Vencimento", type: "date", value: e.vencimento },
                          { name: "status", label: "Status", type: "select", value: e.status, options: EXPENSE_STATUS_OPTS },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
              {(expenses ?? []).length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="py-6 text-center text-muted-foreground">Nenhuma despesa de imóvel/cliente no período.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Operações (fechamentos)</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Data</th><th>Tipo</th><th>Valor</th><th>Comissão</th><th>Status</th>{canManage && <th className="text-right">Ações</th>}</tr>
            </thead>
            <tbody>
              {(financials ?? []).map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="py-2">{formatDateBR(f.data_fechamento)}</td>
                  <td>{f.operation_type}</td>
                  <td>{formatCurrencyBRL(f.valor_fechado)}</td>
                  <td>{formatCurrencyBRL(f.comissao_valor)}</td>
                  <td>{f.status_comissao}</td>
                  {canManage && (
                    <td>
                      <TransactionActions
                        table="property_financials"
                        id={f.id}
                        title="Editar fechamento"
                        canManage={canManage}
                        fields={[
                          { name: "valor_fechado", label: "Valor fechado (R$)", type: "number", step: "0.01", value: f.valor_fechado },
                          { name: "data_fechamento", label: "Data de fechamento", type: "date", value: f.data_fechamento },
                          { name: "comissao_valor", label: "Comissão (R$)", type: "number", step: "0.01", value: f.comissao_valor },
                          { name: "status_comissao", label: "Status da comissão", type: "select", value: f.status_comissao, options: COMMISSION_STATUS_OPTS },
                        ]}
                      />
                    </td>
                  )}
                </tr>
              ))}
              {(financials ?? []).length === 0 && <tr><td colSpan={canManage ? 6 : 5} className="py-6 text-center text-muted-foreground">Sem operações no período.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
