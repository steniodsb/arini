"use client";

import { useState, useRef, useEffect } from "react";
import { Sun, Moon, Monitor, Check } from "lucide-react";
import { useTheme } from "./ThemeProvider";
import type { ThemePreference } from "@/lib/types";

const OPTIONS: { key: ThemePreference; label: string; icon: typeof Sun }[] = [
  { key: "claro", label: "Claro", icon: Sun },
  { key: "escuro", label: "Escuro", icon: Moon },
  { key: "sistema", label: "Automático (segue o sistema)", icon: Monitor },
];

/**
 * Botão de tema com menu (Claro · Escuro · Automático).
 *
 * `tom="sidebar"` troca só as cores do GATILHO: dentro da sidebar verde,
 * `text-muted-foreground` (que segue o tema) sumiria no tema claro. O
 * menu que abre continua neutro — ele flutua sobre o conteúdo, não sobre
 * o verde.
 */
export function ThemeToggle({
  compact = false,
  tom = "padrao",
}: {
  compact?: boolean;
  tom?: "padrao" | "sidebar";
}) {
  const { preference, resolved, setPreference, toggle } = useTheme();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const classeGatilho =
    tom === "sidebar"
      ? "p-1.5 rounded-md text-sidebar-muted hover:text-sidebar-foreground hover:bg-sidebar-hover transition-colors"
      : "p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors";

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  // Modo compacto: um clique só, sem menu (usado na barra do inbox).
  if (compact) {
    return (
      <button
        type="button"
        onClick={toggle}
        title={resolved === "escuro" ? "Mudar para tema claro" : "Mudar para tema escuro"}
        className={classeGatilho}
      >
        {resolved === "escuro" ? <Sun size={16} /> : <Moon size={16} />}
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        title="Tema"
        className={classeGatilho}
      >
        {resolved === "escuro" ? <Moon size={16} /> : <Sun size={16} />}
      </button>
      {open && (
        <div className="absolute right-0 top-9 z-50 w-56 rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden">
          <div className="px-3 py-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground border-b">
            Aparência
          </div>
          {OPTIONS.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              type="button"
              onClick={() => { setPreference(key); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
            >
              <Icon size={14} className="text-muted-foreground shrink-0" />
              <span className="flex-1 truncate">{label}</span>
              {preference === key && <Check size={14} className="text-arini dark:text-gold shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
