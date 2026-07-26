"use client";

import { useEffect, useRef, useState } from "react";
import { AlarmClock, Check } from "lucide-react";

// Adiar (snooze): tira a conversa da caixa até a hora escolhida. O banco
// tem a função fn_despertar_conversas_adiadas() que devolve a conversa
// para "aberta" no prazo; a UI também trata o vencimento ao carregar.

type Opcao = { label: string; calcular: () => Date | null };

function proximaHora(h: number, addDias = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() + addDias);
  d.setHours(h, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setDate(d.getDate() + 1);
  return d;
}

const OPCOES: Opcao[] = [
  { label: "1 hora", calcular: () => new Date(Date.now() + 60 * 60 * 1000) },
  { label: "3 horas", calcular: () => new Date(Date.now() + 3 * 60 * 60 * 1000) },
  { label: "Amanhã de manhã (9h)", calcular: () => proximaHora(9, 1) },
  { label: "Depois de amanhã", calcular: () => proximaHora(9, 2) },
  {
    label: "Próxima semana",
    calcular: () => {
      const d = new Date();
      d.setDate(d.getDate() + 7);
      d.setHours(9, 0, 0, 0);
      return d;
    },
  },
  { label: "Até a próxima resposta do cliente", calcular: () => null },
];

export function SnoozeMenu({
  onAdiar,
  compacto = false,
}: {
  /** `ate = null` significa "até o cliente responder" (sem prazo). */
  onAdiar: (ate: Date | null) => void;
  compacto?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Adiar conversa"
        className={
          compacto
            ? "p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            : "inline-flex items-center gap-1.5 h-9 px-3 rounded-md border text-sm hover:bg-muted"
        }
      >
        <AlarmClock size={compacto ? 15 : 14} />
        {!compacto && "Adiar"}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-40 w-60 rounded-lg border bg-popover shadow-xl overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
            Adiar até
          </div>
          {OPCOES.map((o) => (
            <button
              key={o.label}
              type="button"
              onClick={() => { onAdiar(o.calcular()); setOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm hover:bg-muted"
            >
              {o.label}
            </button>
          ))}
          <div className="border-t p-2 flex items-center gap-1.5">
            <input
              type="datetime-local"
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="flex-1 min-w-0 rounded-md border bg-background px-2 py-1 text-xs"
            />
            <button
              type="button"
              disabled={!custom}
              onClick={() => { onAdiar(new Date(custom)); setOpen(false); setCustom(""); }}
              className="p-1.5 rounded-md text-arini dark:text-gold hover:bg-muted disabled:opacity-40"
              title="Adiar até esta data"
            >
              <Check size={15} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
