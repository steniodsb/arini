"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Megaphone } from "lucide-react";

/**
 * Gate da etapa de captação → marketing. O marketing só "recebe" o imóvel
 * quando o captador (ou administrativo) clica aqui. Marca a flag, move o
 * status para em_marketing e notifica o setor de marketing.
 */
export function SendToMarketingButton({ propertyId, userId }: { propertyId: string; userId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function send() {
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("properties")
      .update({
        enviado_para_marketing: true,
        enviado_marketing_em: new Date().toISOString(),
        enviado_marketing_por: userId,
        status: "em_marketing",
      })
      .eq("id", propertyId);
    if (!error) {
      await supabase.from("notifications").insert({
        sector: "marketing",
        tipo: "marketing",
        titulo: "Novo imóvel para divulgação",
        mensagem: "Um imóvel foi enviado pela captação para o marketing.",
        link: `/admin/marketing/${propertyId}`,
      });
      setDone(true);
      router.refresh();
    } else {
      alert(error.message);
    }
    setBusy(false);
  }

  if (done) return <span className="text-xs text-emerald-700 font-semibold">Enviado ao marketing ✓</span>;

  return (
    <Button variant="gold" size="sm" onClick={send} disabled={busy}>
      <Megaphone size={14} /> {busy ? "Enviando…" : "Enviar para Marketing"}
    </Button>
  );
}
