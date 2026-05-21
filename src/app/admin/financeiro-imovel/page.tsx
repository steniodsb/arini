import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { FinanceiroImovelForm } from "./FinanceiroImovelForm";

export default async function FinanceiroImovelPage() {
  await requireSector(["financeiro", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const [{ data: financials }, { data: properties }] = await Promise.all([
    supabase.from("property_financials").select("*").order("data_fechamento", { ascending: false }).limit(100),
    supabase.from("properties").select("id, codigo, titulo").order("codigo"),
  ]);

  const totalReceita = (financials ?? []).reduce((s, f: { valor_fechado: number }) => s + Number(f.valor_fechado || 0), 0);
  const totalComissao = (financials ?? []).reduce((s, f: { comissao_valor: number | null }) => s + Number(f.comissao_valor || 0), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Financeiro do imóvel</h1>
        <p className="text-muted-foreground mt-1">Fechamentos, comissões e receitas por operação.</p>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Receita</div><div className="text-2xl text-gold-gradient font-semibold">{formatCurrencyBRL(totalReceita)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Comissão gerada</div><div className="text-2xl text-arini font-semibold">{formatCurrencyBRL(totalComissao)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Operações</div><div className="text-2xl text-arini font-semibold">{(financials ?? []).length}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Registrar fechamento</CardTitle></CardHeader>
        <CardContent>
          <FinanceiroImovelForm properties={(properties ?? []) as { id: string; codigo: string; titulo: string | null }[]} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Operações recentes</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Data</th><th>Tipo</th><th>Valor</th><th>Comissão</th><th>Status</th></tr>
            </thead>
            <tbody>
              {(financials ?? []).map((f) => (
                <tr key={f.id} className="border-t">
                  <td className="py-2">{formatDateBR(f.data_fechamento)}</td>
                  <td>{f.operation_type}</td>
                  <td>{formatCurrencyBRL(f.valor_fechado)}</td>
                  <td>{formatCurrencyBRL(f.comissao_valor)}</td>
                  <td>{f.status_comissao}</td>
                </tr>
              ))}
              {(financials ?? []).length === 0 && <tr><td colSpan={5} className="py-6 text-center text-muted-foreground">Sem operações.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
