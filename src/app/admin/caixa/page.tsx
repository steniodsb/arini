import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL } from "@/lib/utils";
import type { BankAccountBalance } from "@/lib/types";
import { NewAccountDialog } from "./NewAccountDialog";

const TIPO_LABELS: Record<string, string> = {
  conta_corrente: "Conta corrente",
  poupanca: "Poupança",
  caixa: "Caixa",
  investimento: "Investimento",
};

export default async function CaixaPage() {
  const { profile } = await requireSector(["financeiro", "administrativo", "admin_central"]);
  const podeCriar = isDiretoria(profile);
  const supabase = createSupabaseServer();
  const { data: balances } = await supabase.from("bank_account_balances").select("*").order("nome");
  const list = (balances ?? []) as BankAccountBalance[];
  const totalCaixa = list.reduce((s, b) => s + Number(b.saldo_atual), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Contas / Caixa</h1>
          <p className="text-muted-foreground mt-1">Saldo por conta bancária e caixa geral da empresa.</p>
        </div>
        {podeCriar && <NewAccountDialog />}
      </div>

      <Card><CardContent className="pt-6">
        <div className="text-xs uppercase text-muted-foreground">Saldo total em caixa</div>
        <div className="text-3xl text-gold-gradient font-semibold">{formatCurrencyBRL(totalCaixa)}</div>
      </CardContent></Card>

      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {list.map((b) => (
          <Card key={b.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{b.nome}</span>
                <Badge variant="outline">{TIPO_LABELS[b.tipo] ?? b.tipo}</Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1 text-sm">
              {b.banco && <div className="text-muted-foreground">{b.banco}</div>}
              <div className="text-xs text-muted-foreground">Saldo inicial: {formatCurrencyBRL(b.saldo_inicial)}</div>
              <div className="text-2xl text-arini font-semibold pt-1">{formatCurrencyBRL(b.saldo_atual)}</div>
              {!b.ativo && <Badge variant="muted">Inativa</Badge>}
            </CardContent>
          </Card>
        ))}
        {list.length === 0 && (
          <p className="text-sm text-muted-foreground">Nenhuma conta cadastrada.{podeCriar ? " Crie a primeira no botão acima." : ""}</p>
        )}
      </div>
    </div>
  );
}
