"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Send } from "lucide-react";

/**
 * Reenvia o imóvel para aprovação da captação após uma correção solicitada.
 * Cria uma nova approval pendente e volta o status para aguardando aprovação.
 */
export function ResubmitApprovalButton({ propertyId, userId }: { propertyId: string; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function resubmit() {
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("properties")
      .update({ status: "aguardando_aprovacao_captacao" })
      .eq("id", propertyId);
    if (!error) {
      await supabase.from("approvals").insert({
        entity_table: "properties",
        entity_id: propertyId,
        stage: "captacao",
        status: "pendente",
        solicitado_por: userId,
      });
      await supabase.from("notifications").insert({
        sector: "administrativo",
        tipo: "aprovacao",
        titulo: "Reenvio para aprovação (captação)",
        mensagem: "Um imóvel foi corrigido e reenviado para aprovação.",
        link: `/admin/aprovacoes`,
      });
      router.refresh();
    } else {
      alert(error.message);
    }
    setBusy(false);
  }

  return (
    <Button variant="gold" size="sm" onClick={resubmit} disabled={busy}>
      <Send size={14} /> {busy ? "Reenviando…" : "Reenviar para aprovação"}
    </Button>
  );
}
