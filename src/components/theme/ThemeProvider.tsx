"use client";

import {
  createContext, useCallback, useContext, useEffect, useMemo, useState,
} from "react";
import type { ThemePreference } from "@/lib/types";

// =====================================================================
// Tema claro / escuro do Atendimento.
//
// A preferência mora em duas camadas:
//   1. localStorage — aplica na hora, sem esperar rede (e é lida pelo
//      script inline do <head> para não piscar branco antes da hidratação).
//   2. profiles.atendimento_tema — segue o agente entre navegadores.
//
// "sistema" acompanha o prefers-color-scheme do SO.
// =====================================================================

export const THEME_STORAGE_KEY = "arini-atendimento-tema";

type ThemeCtx = {
  /** O que o usuário escolheu ("sistema" inclusive). */
  preference: ThemePreference;
  /** O que está de fato aplicado agora ("claro" | "escuro"). */
  resolved: "claro" | "escuro";
  setPreference: (t: ThemePreference) => void;
  /** Alterna direto entre claro e escuro (ignora "sistema"). */
  toggle: () => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

function systemTheme(): "claro" | "escuro" {
  if (typeof window === "undefined") return "claro";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "escuro" : "claro";
}

function applyToDocument(resolved: "claro" | "escuro") {
  const root = document.documentElement;
  root.classList.toggle("dark", resolved === "escuro");
  root.style.colorScheme = resolved === "escuro" ? "dark" : "light";
}

export function ThemeProvider({
  children,
  initial = "sistema",
  /** Persiste a escolha no perfil do agente (opcional). */
  onPersist,
}: {
  children: React.ReactNode;
  initial?: ThemePreference;
  onPersist?: (t: ThemePreference) => void;
}) {
  const [preference, setPref] = useState<ThemePreference>(initial);
  const [resolved, setResolved] = useState<"claro" | "escuro">("claro");

  // Na montagem, o localStorage manda (foi ele que o script inline já usou).
  useEffect(() => {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY) as ThemePreference | null;
    const pref = stored ?? initial;
    setPref(pref);
    const r = pref === "sistema" ? systemTheme() : pref;
    setResolved(r);
    applyToDocument(r);
  }, [initial]);

  // Em "sistema", segue o SO em tempo real.
  useEffect(() => {
    if (preference !== "sistema") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handler = () => {
      const r = systemTheme();
      setResolved(r);
      applyToDocument(r);
    };
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [preference]);

  const setPreference = useCallback(
    (t: ThemePreference) => {
      setPref(t);
      window.localStorage.setItem(THEME_STORAGE_KEY, t);
      const r = t === "sistema" ? systemTheme() : t;
      setResolved(r);
      applyToDocument(r);
      onPersist?.(t);
    },
    [onPersist],
  );

  const toggle = useCallback(() => {
    setPreference(resolved === "escuro" ? "claro" : "escuro");
  }, [resolved, setPreference]);

  const value = useMemo(
    () => ({ preference, resolved, setPreference, toggle }),
    [preference, resolved, setPreference, toggle],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useTheme(): ThemeCtx {
  const ctx = useContext(Ctx);
  if (!ctx) {
    // Fora do provider (ex.: tela de login) — degrada para um no-op seguro.
    return {
      preference: "sistema",
      resolved: "claro",
      setPreference: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}
