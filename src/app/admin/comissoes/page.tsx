import { requireSector, canCreateMoney } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { PayCommissionButton } from "./PayCommissionButton";
import { NewGeneralCommissionDialog } from "./NewGeneralCommissionDialog";

export default async function ComissoesPage({ searchParams }: { searchParams: { status?: string } }) {
  const { profile } = await requireSector(["financeiro", "administrativo", "admin_central"]);
  const podeLancar = canCreateMoney(profile);
  const supabase = createSupabaseServer();
  const { data: accounts } = await supabase.from("bank_accounts").select("id, nome").eq("ativo", true).order("nome");
  let q = supabase
    .from("commissions")
    .select("*, property_financials(property_id, valor_fechado, data_fechamento, operation_type, properties(codigo, titulo))")
    .order("created_at", { ascending: false });
  if (searchParams.status) q = q.eq("status", searchParams.status);
  const { data } = await q.limit(200);
  const list = data ?? [];

  const totals = {
    pendente: list.filter((c) => c.status === "pendente").reduce((s, c) => s + Number(c.valor), 0),
    parcial: list.filter((c) => c.status === "parcial").reduce((s, c) => s + Number(c.valor), 0),
    pago: list.filter((c) => c.status === "pago").reduce((s, c) => s + Number(c.valor), 0),
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Comissões</h1>
          <p className="text-muted-foreground mt-1">Comissões de imóveis e comissões gerais (parcerias, indicações, etc.).</p>
        </div>
        {podeLancar && <NewGeneralCommissionDialog accounts={(accounts ?? []) as { id: string; nome: string }[]} />}
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Pendente</div>
          <div className="text-2xl text-amber-600 font-semibold">{formatCurrencyBRL(totals.pendente)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Parcial</div>
          <div className="text-2xl text-blue-600 font-semibold">{formatCurrencyBRL(totals.parcial)}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Pago</div>
          <div className="text-2xl text-emerald-600 font-semibold">{formatCurrencyBRL(totals.pago)}</div>
        </CardContent></Card>
      </div>

      <div className="flex gap-2">
        {["", "pendente", "parcial", "pago"].map((s) => (
          <a
            key={s}
            href={s ? `/admin/comissoes?status=${s}` : "/admin/comissoes"}
            className={`px-3 py-1.5 rounded-md text-sm border ${
              (searchParams.status ?? "") === s ? "bg-arini text-white border-arini" : "bg-white hover:bg-muted"
            }`}
          >
            {s ? s.charAt(0).toUpperCase() + s.slice(1) : "Todos"}
          </a>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Comissões registradas</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Imóvel</th>
                <th>Beneficiário</th>
                <th>%</th>
                <th>Valor</th>
                <th>Status</th>
                <th>Pago em</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {list.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhuma comissão registrada.</td></tr>}
              {list.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    {c.property_financials?.properties ? (
                      <>
                        <div className="font-mono text-xs">{c.property_financials.properties.codigo}</div>
                        <div className="text-arini">{c.property_financials.properties.titulo ?? "—"}</div>
                      </>
                    ) : "—"}
                  </td>
                  <td>
                    <div className="text-arini">{c.beneficiario_nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{c.beneficiario_tipo ?? ""}</div>
                  </td>
                  <td>{c.percentual ? `${c.percentual}%` : "—"}</td>
                  <td className="font-medium">{formatCurrencyBRL(c.valor)}</td>
                  <td>
                    <Badge variant={c.status === "pago" ? "success" : c.status === "parcial" ? "default" : "warning"}>
                      {c.status}
                    </Badge>
                  </td>
                  <td>{c.pago_em ? formatDateBR(c.pago_em) : "—"}</td>
                  <td>
                    {c.status !== "pago" && <PayCommissionButton id={c.id} />}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
