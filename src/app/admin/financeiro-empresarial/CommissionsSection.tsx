import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { PayCommissionButton } from "../comissoes/PayCommissionButton";
import { NewGeneralCommissionDialog } from "../comissoes/NewGeneralCommissionDialog";
import { TransactionActions } from "@/components/crm/TransactionActions";

const COMMISSION_STATUS_OPTS = [
  { value: "pendente", label: "Pendente" },
  { value: "parcial", label: "Parcial" },
  { value: "pago", label: "Pago" },
];

/**
 * Seção de comissões embutida no Financeiro da Empresa (imóveis + gerais),
 * com distribuição percentual e pagamento refletindo no caixa.
 */
export async function CommissionsSection({ canManage, podeLancar }: { canManage: boolean; podeLancar: boolean }) {
  const supabase = createSupabaseServer();
  const [{ data }, { data: accounts }] = await Promise.all([
    supabase
      .from("commissions")
      .select("*, property_financials(property_id, valor_fechado, properties(codigo, titulo))")
      .order("created_at", { ascending: false })
      .limit(200),
    supabase.from("bank_accounts").select("id, nome").eq("ativo", true).order("nome"),
  ]);
  const list = data ?? [];

  const totals = {
    pendente: list.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.valor), 0),
    pago: list.filter((c) => c.status === "pago").reduce((s, c) => s + Number(c.valor), 0),
  };

  return (
    <Card id="comissoes">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Comissões</span>
          {podeLancar && <NewGeneralCommissionDialog accounts={(accounts ?? []) as { id: string; nome: string }[]} />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Comissões de imóveis e gerais. Pendentes: {formatCurrencyBRL(totals.pendente)} · Pagas: {formatCurrencyBRL(totals.pago)}
        </p>
      </CardHeader>
      <CardContent>
        <table className="w-full text-sm">
          <thead className="text-left text-xs uppercase text-muted-foreground">
            <tr>
              <th className="py-2">Origem</th>
              <th>Beneficiário</th>
              <th>Divisão</th>
              <th>Valor</th>
              <th>Período</th>
              <th>Status</th>
              <th className="text-right">Ações</th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma comissão registrada.</td></tr>}
            {list.map((c) => {
              const divisao = (c.divisao ?? null) as { empresa?: number; terceiros?: number } | null;
              return (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    {c.property_financials?.properties ? (
                      <>
                        <div className="font-mono text-xs">{c.property_financials.properties.codigo}</div>
                        <div className="text-arini text-xs">{c.property_financials.properties.titulo ?? ""}</div>
                      </>
                    ) : (
                      <Badge variant="outline">Geral</Badge>
                    )}
                    {c.descricao && <div className="text-xs text-muted-foreground">{c.descricao}</div>}
                  </td>
                  <td>
                    <div className="text-arini">{c.beneficiario_nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.beneficiario_tipo ?? ""}</div>
                  </td>
                  <td className="text-xs">
                    {divisao
                      ? `${divisao.empresa ?? 0}% empresa · ${divisao.terceiros ?? 0}% terceiros`
                      : c.percentual ? `${c.percentual}%` : "—"}
                  </td>
                  <td className="font-medium">{formatCurrencyBRL(c.valor)}</td>
                  <td className="text-xs text-muted-foreground">
                    {c.data_inicio ? formatDateBR(c.data_inicio) : "—"} → {c.data_fechamento ? formatDateBR(c.data_fechamento) : "—"}
                  </td>
                  <td>
                    <Badge variant={c.status === "pago" ? "success" : c.status === "parcial" ? "default" : "warning"}>{c.status}</Badge>
                    {c.pago_em && <div className="text-[10px] text-muted-foreground">{formatDateBR(c.pago_em)}</div>}
                  </td>
                  <td>
                    <div className="flex items-center gap-1 justify-end">
                      {c.status !== "pago" && (
                        <PayCommissionButton
                          id={c.id}
                          contaId={c.conta_id ?? null}
                          valor={Number(c.valor)}
                          beneficiario={c.beneficiario_nome ?? null}
                        />
                      )}
                      <TransactionActions
                        table="commissions"
                        id={c.id}
                        title="Editar comissão"
                        canManage={canManage}
                        fields={[
                          { name: "beneficiario_nome", label: "Beneficiário", type: "text", value: c.beneficiario_nome },
                          { name: "valor", label: "Valor (R$)", type: "number", step: "0.01", value: c.valor },
                          { name: "percentual", label: "Percentual (%)", type: "number", step: "0.01", value: c.percentual },
                          { name: "status", label: "Status", type: "select", value: c.status, options: COMMISSION_STATUS_OPTS },
                          { name: "data_inicio", label: "Data início", type: "date", value: c.data_inicio ?? null },
                          { name: "data_fechamento", label: "Data fechamento", type: "date", value: c.data_fechamento ?? null },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}
