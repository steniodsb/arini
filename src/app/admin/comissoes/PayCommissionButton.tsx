"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function PayCommissionButton({
  id,
  contaId = null,
  valor = 0,
  beneficiario = null,
}: {
  id: string;
  contaId?: string | null;
  valor?: number;
  beneficiario?: string | null;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function pay() {
    if (!confirm("Marcar comissão como paga?")) return;
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const hoje = new Date().toISOString().slice(0, 10);
    const { error } = await supabase
      .from("commissions")
      .update({ status: "pago", pago_em: hoje })
      .eq("id", id);

    // Se a comissão está vinculada a uma conta, lança a saída no caixa
    // (despesa paga) para a carteira refletir o pagamento.
    if (!error && contaId && valor > 0) {
      const { data: { user } } = await supabase.auth.getUser();
      await supabase.from("expenses").insert({
        descricao: `Comissão paga${beneficiario ? ` — ${beneficiario}` : ""}`,
        valor,
        vencimento: hoje,
        pago_em: hoje,
        status: "pago",
        tipo_gasto: "empresa",
        conta_id: contaId,
        centro_custo: "comissoes",
        criado_por: user?.id,
      });
    }
    setLoading(false);
    router.refresh();
  }
  return (
    <Button size="sm" variant="gold" onClick={pay} disabled={loading}>
      <Check size={12} /> {loading ? "..." : "Pagar"}
    </Button>
  );
}
