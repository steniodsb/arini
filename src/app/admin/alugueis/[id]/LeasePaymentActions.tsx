"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";

interface Props {
  id: string;
  status: string;
  repasseStatus: string;
}

// Controle do recebível: marcar o pagamento do inquilino e, depois, o repasse
// ao proprietário. Datas usam o dia corrente.
export function LeasePaymentActions({ id, status, repasseStatus }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function update(fields: Record<string, unknown>) {
    setLoading(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("lease_payments").update(fields).eq("id", id);
    setLoading(false);
    if (error) { alert(error.message); return; }
    router.refresh();
  }

  const hoje = new Date().toISOString().slice(0, 10);

  return (
    <div className="flex items-center gap-1 justify-end">
      {status !== "pago" ? (
        <Button size="sm" variant="gold" disabled={loading} onClick={() => update({ status: "pago", pago_em: hoje })}>
          Marcar pago
        </Button>
      ) : repasseStatus !== "repassado" ? (
        <Button size="sm" variant="outline" disabled={loading} onClick={() => update({ repasse_status: "repassado", repasse_em: hoje })}>
          Marcar repassado
        </Button>
      ) : (
        <span className="text-xs text-muted-foreground">✓ Concluído</span>
      )}
    </div>
  );
}
