"use client";

import { useCallback } from "react";
import { ThemeProvider } from "@/components/theme/ThemeProvider";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import type { ThemePreference } from "@/lib/types";

/**
 * ThemeProvider do atendimento: além do localStorage, grava a escolha em
 * profiles.atendimento_tema para o agente reencontrar o tema em outro
 * computador. A gravação é "melhor esforço" — falhou, o local continua valendo.
 */
export function AtendimentoThemeProvider({
  initial,
  children,
}: {
  initial: ThemePreference;
  children: React.ReactNode;
}) {
  const persist = useCallback((tema: ThemePreference) => {
    const supabase = createSupabaseBrowser();
    void supabase.auth.getUser().then(({ data }) => {
      if (!data.user) return;
      void supabase.from("profiles").update({ atendimento_tema: tema }).eq("id", data.user.id);
    });
  }, []);

  return (
    <ThemeProvider initial={initial} onPersist={persist}>
      {children}
    </ThemeProvider>
  );
}
