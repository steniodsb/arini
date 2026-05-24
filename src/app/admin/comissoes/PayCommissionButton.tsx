"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Check } from "lucide-react";

export function PayCommissionButton({ id }: { id: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function pay() {
    if (!confirm("Marcar comissão como paga?")) return;
    setLoading(true);
    const supabase = createSupabaseBrowser();
    await supabase
      .from("commissions")
      .update({ status: "pago", pago_em: new Date().toISOString().slice(0, 10) })
      .eq("id", id);
    setLoading(false);
    router.refresh();
  }
  return (
    <Button size="sm" variant="gold" onClick={pay} disabled={loading}>
      <Check size={12} /> {loading ? "..." : "Pagar"}
    </Button>
  );
}
