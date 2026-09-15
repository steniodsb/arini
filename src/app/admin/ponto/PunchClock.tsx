"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock } from "lucide-react";
import { TIME_ENTRY_LABELS, type TimeEntryType } from "@/lib/types";
import { fmtHoraBR } from "@/lib/fuso";

// Próximo registro sugerido a partir do último tipo batido.
const NEXT: Record<string, TimeEntryType> = {
  entrada: "intervalo_inicio",
  intervalo_inicio: "intervalo_fim",
  intervalo_fim: "saida",
  saida: "entrada",
};

const ALL: TimeEntryType[] = ["entrada", "intervalo_inicio", "intervalo_fim", "saida"];

export function PunchClock({
  userId,
  lastType,
  colaboradorId = null,
}: {
  userId: string;
  lastType?: TimeEntryType;
  /**
   * O colaborador ligado a este login, quando existe. Sem ele o registro
   * fica só com `user_id` e NÃO aparece no relatório individual — que
   * agrupa por colaborador. É o que liga o ponto batido aqui ao mesmo
   * histórico do ponto batido no terminal.
   */
  colaboradorId?: string | null;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const suggested = lastType ? NEXT[lastType] : "entrada";

  async function punch(tipo: TimeEntryType) {
    setBusy(true);
    setMsg(null);
    const supabase = createSupabaseBrowser();
    // Devolve `registrado_em` para confirmar a hora QUE FOI GRAVADA (o
    // `now()` do banco), e não a do relógio deste aparelho — num tablet com
    // hora errada as duas não batem, e é a do banco que vale no relatório.
    const { data, error } = await supabase
      .from("time_entries")
      .insert({ user_id: userId, colaborador_id: colaboradorId, tipo, origem: "web" })
      .select("registrado_em")
      .single();
    setBusy(false);
    if (error) { setMsg(`Erro: ${error.message}`); return; }
    setMsg(`${TIME_ENTRY_LABELS[tipo]} registrada às ${fmtHoraBR(data?.registrado_em ?? new Date())}.`);
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
