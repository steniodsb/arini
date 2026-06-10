import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL } from "@/lib/utils";
import { Wallet } from "lucide-react";
import type { BankAccountBalance } from "@/lib/types";
import { NewAccountDialog } from "@/app/admin/caixa/NewAccountDialog";

const TIPO_LABELS: Record<string, string> = {
  conta_corrente: "Conta corrente",
  poupanca: "Poupança",
  caixa: "Caixa",
  investimento: "Investimento",
};

/**
 * Carteira: contas/caixas com saldo inicial e saldo atual (entradas − saídas
 * pagas). Embutida no Financeiro da Empresa e no Financeiro de Imóveis.
 */
export async function WalletSection({ canManage }: { canManage: boolean }) {
  const supabase = createSupabaseServer();
  const { data: balances } = await supabase.from("bank_account_balances").select("*").order("nome");
  const list = (balances ?? []) as BankAccountBalance[];
  const total = list.filter((b) => b.ativo).reduce((s, b) => s + Number(b.saldo_atual), 0);

  return (
    <Card id="carteira">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span className="flex items-center gap-2"><Wallet size={18} /> Carteira</span>
          {canManage && <NewAccountDialog />}
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Saldo por conta — atualiza conforme despesas pagas e receitas lançadas.
        </p>
      </CardHeader>
      <CardContent>
        <div className="mb-4">
          <div className="text-xs uppercase text-muted-foreground">Saldo total</div>
          <div className="text-2xl text-gold-gradient font-semibold">{formatCurrencyBRL(total)}</div>
        </div>
        {list.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma conta cadastrada.{canManage ? " Crie a primeira no botão acima." : ""}
          </p>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {list.map((b) => (
              <div key={b.id} className="rounded-lg border p-4">
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-arini">{b.nome}</span>
                  <Badge variant="outline">{TIPO_LABELS[b.tipo] ?? b.tipo}</Badge>
                </div>
                {b.banco && <div className="text-xs text-muted-foreground">{b.banco}</div>}
                <div className="text-xs text-muted-foreground">Inicial: {formatCurrencyBRL(b.saldo_inicial)}</div>
                <div className="text-xl text-arini font-semibold mt-1">{formatCurrencyBRL(b.saldo_atual)}</div>
                {!b.ativo && <Badge variant="muted">Inativa</Badge>}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
