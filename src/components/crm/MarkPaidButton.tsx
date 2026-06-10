"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Check, Undo2 } from "lucide-react";
import { errMessage } from "@/lib/utils";

/**
 * Marca/desmarca uma despesa como paga (admin central). Pagar alimenta o
 * caixa: a carteira desconta apenas despesas com status 'pago'.
 */
export function MarkPaidButton({ id, paid }: { id: string; paid: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle() {
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("expenses")
      .update(
        paid
          ? { status: "pendente", pago_em: null }
          : { status: "pago", pago_em: new Date().toISOString().slice(0, 10) },
      )
      .eq("id", id);
    setBusy(false);
    if (error) { alert(errMessage(error)); return; }
    router.refresh();
  }

  return paid ? (
    <Button size="sm" variant="ghost" onClick={toggle} disabled={busy} title="Voltar para pendente">
      <Undo2 size={12} /> {busy ? "..." : "Desfazer"}
    </Button>
  ) : (
    <Button size="sm" variant="gold" onClick={toggle} disabled={busy}>
      <Check size={12} /> {busy ? "..." : "Pago"}
    </Button>
  );
}
