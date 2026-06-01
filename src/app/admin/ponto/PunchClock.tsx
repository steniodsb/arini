"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { TIME_ENTRY_LABELS, type TimeEntryType } from "@/lib/types";

// Próximo registro sugerido a partir do último tipo batido.
const NEXT: Record<string, TimeEntryType> = {
  entrada: "intervalo_inicio",
  intervalo_inicio: "intervalo_fim",
  intervalo_fim: "saida",
  saida: "entrada",
};

const ALL: TimeEntryType[] = ["entrada", "intervalo_inicio", "intervalo_fim", "saida"];

export function PunchClock({ userId, lastType }: { userId: string; lastType?: TimeEntryType }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const suggested = lastType ? NEXT[lastType] : "entrada";

  async function punch(tipo: TimeEntryType) {
    setBusy(true);
    setMsg(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("time_entries").insert({ user_id: userId, tipo, origem: "web" });
    setBusy(false);
    if (error) { setMsg(`Erro: ${error.message}`); return; }
    setMsg(`${TIME_ENTRY_LABELS[tipo]} registrada às ${new Date().toLocaleTimeString("pt-BR")}.`);
    router.refresh();
  }

  return (
    <Card>
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-center gap-3">
          <Clock className="text-gold-dark" />
          <div>
            <div className="text-sm text-muted-foreground">Próximo registro sugerido</div>
            <div className="text-xl text-arini font-semibold">{TIME_ENTRY_LABELS[suggested]}</div>
          </div>
        </div>
        <Button variant="gold" size="lg" disabled={busy} onClick={() => punch(suggested)}>
          {busy ? "Registrando…" : `Bater ponto — ${TIME_ENTRY_LABELS[suggested]}`}
        </Button>
        <div className="flex flex-wrap gap-2 pt-2 border-t">
          <span className="text-xs text-muted-foreground w-full">Ou registre manualmente:</span>
          {ALL.map((t) => (
            <Button key={t} type="button" size="sm" variant="outline" disabled={busy} onClick={() => punch(t)}>
              {TIME_ENTRY_LABELS[t]}
            </Button>
          ))}
        </div>
        {msg && <p className="text-sm text-emerald-700">{msg}</p>}
      </CardContent>
    </Card>
  );
}
