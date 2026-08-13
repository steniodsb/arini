"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "./ThemeProvider";

// =====================================================================
// Interruptor claro/escuro — um clique, sem menu.
//
// O `ThemeToggle` (menu com Claro/Escuro/Automático) continua existindo
// para quem quer "seguir o sistema"; ele é a tela de preferência. Este
// aqui é o gesto do dia a dia: às 18h alguém quer o escuro AGORA, e
// abrir menu para escolher entre três coisas é uma a mais do que a
// necessária.
//
// Detalhe que evita um bug bobo: o knob é posicionado pelo tema
// RESOLVIDO (`resolved`), não pela preferência. Em "automático" a
// preferência é "sistema" — que não é nem esquerda nem direita — e o
// interruptor ficaria mentindo sobre o que está na tela.
// =====================================================================

export function ThemeSwitch({
  tom = "padrao",
  /** Rótulo ao lado do interruptor (usado nas telas de configuração). */
  comRotulo = false,
}: {
  tom?: "padrao" | "sidebar";
  comRotulo?: boolean;
}) {
  const { resolved, toggle } = useTheme();
  const escuro = resolved === "escuro";
  const naSidebar = tom === "sidebar";

  return (
    <div className="flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={escuro}
        aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
        title={escuro ? "Tema escuro — clique para o claro" : "Tema claro — clique para o escuro"}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 ${
          naSidebar
            ? escuro ? "bg-white/25" : "bg-white/15"
            : escuro ? "bg-acao" : "bg-muted-foreground/30"
        }`}
      >
        {/* Os dois ícones ficam SEMPRE visíveis, atrás do knob: o usuário
            vê para onde vai, não só onde está. */}
        <Sun
          size={11}
          className={`absolute left-1.5 transition-opacity ${
            escuro ? "opacity-40" : "opacity-0"
          } ${naSidebar ? "text-white" : "text-foreground"}`}
        />
        <Moon
          size={11}
          className={`absolute right-1.5 transition-opacity ${
            escuro ? "opacity-0" : "opacity-40"
          } ${naSidebar ? "text-white" : "text-foreground"}`}
        />
        <span
          className={`inline-flex h-5 w-5 items-center justify-center rounded-full bg-white shadow transition-transform ${
            escuro ? "translate-x-[22px]" : "translate-x-0.5"
          }`}
        >
          {escuro
            ? <Moon size={11} className="text-slate-800" />
            : <Sun size={11} className="text-amber-500" />}
        </span>
      </button>
      {comRotulo && (
        <span className="text-xs text-muted-foreground">
          {escuro ? "Escuro" : "Claro"}
        </span>
      )}
    </div>
  );
}
