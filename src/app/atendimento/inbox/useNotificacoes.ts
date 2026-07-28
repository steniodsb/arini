"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// =====================================================================
// Aviso de mensagem nova: som + notificação do sistema.
//
// Por que não um arquivo .mp3: exigiria hospedar um asset e um request a
// mais só para um "blim". A Web Audio API sintetiza o som em duas notas,
// custa zero byte e toca igual em todo navegador moderno.
//
// O navegador bloqueia áudio até o usuário interagir com a página — por
// isso o AudioContext só é criado no primeiro clique/tecla, não na carga.
// =====================================================================

type Prefs = {
  som: boolean;
  desktop: boolean;
};

const CHAVE = "arini-atendimento-notificacoes";

function lerPrefs(): Prefs {
  if (typeof window === "undefined") return { som: true, desktop: false };
  try {
    const bruto = window.localStorage.getItem(CHAVE);
    if (!bruto) return { som: true, desktop: false };
    const p = JSON.parse(bruto) as Partial<Prefs>;
    return { som: p.som !== false, desktop: p.desktop === true };
  } catch {
    return { som: true, desktop: false };
  }
}

export function useNotificacoes() {
  const [prefs, setPrefs] = useState<Prefs>({ som: true, desktop: false });
  const [permissao, setPermissao] = useState<NotificationPermission>("default");
  const ctxRef = useRef<AudioContext | null>(null);
  const liberadoRef = useRef(false);

  useEffect(() => {
    setPrefs(lerPrefs());
    if (typeof Notification !== "undefined") setPermissao(Notification.permission);
  }, []);

  // O contexto de áudio só pode nascer depois de um gesto do usuário.
  useEffect(() => {
    function liberar() {
      if (liberadoRef.current) return;
      liberadoRef.current = true;
      try {
        const Ctor = window.AudioContext
          ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor) ctxRef.current = new Ctor();
      } catch {
        // Sem áudio disponível — segue sem som, não é erro fatal.
      }
    }
    window.addEventListener("pointerdown", liberar, { once: true });
    window.addEventListener("keydown", liberar, { once: true });
    return () => {
      window.removeEventListener("pointerdown", liberar);
      window.removeEventListener("keydown", liberar);
    };
  }, []);

  const salvar = useCallback((p: Prefs) => {
    setPrefs(p);
    window.localStorage.setItem(CHAVE, JSON.stringify(p));
  }, []);

  const tocar = useCallback(() => {
    const ctx = ctxRef.current;
    if (!ctx) return;
    // Duas notas curtas ascendentes — audível sem ser irritante.
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const inicio = ctx.currentTime + i * 0.11;
      gain.gain.setValueAtTime(0.0001, inicio);
      gain.gain.exponentialRampToValueAtTime(0.12, inicio + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.1);
      osc.connect(gain).connect(ctx.destination);
      osc.start(inicio);
      osc.stop(inicio + 0.12);
    });
  }, []);

  const pedirPermissaoDesktop = useCallback(async () => {
    if (typeof Notification === "undefined") return false;
    const r = await Notification.requestPermission();
    setPermissao(r);
    if (r === "granted") salvar({ ...lerPrefs(), desktop: true });
    return r === "granted";
  }, [salvar]);

  /**
   * Avisa sobre uma mensagem nova. Só notifica no desktop quando a aba
   * está em segundo plano — notificação de sistema com a tela aberta na
   * frente é ruído puro.
   */
  const avisar = useCallback(
    (titulo: string, corpo: string, aoClicar?: () => void) => {
      const p = lerPrefs();
      if (p.som) tocar();
      if (
        p.desktop &&
        typeof Notification !== "undefined" &&
        Notification.permission === "granted" &&
        document.visibilityState === "hidden"
      ) {
        const n = new Notification(titulo, { body: corpo, tag: "arini-atendimento" });
        if (aoClicar) {
          n.onclick = () => { window.focus(); aoClicar(); n.close(); };
        }
      }
    },
    [tocar],
  );

  return {
    prefs,
    permissao,
    setSom: (v: boolean) => salvar({ ...lerPrefs(), som: v }),
    setDesktop: (v: boolean) => salvar({ ...lerPrefs(), desktop: v }),
    pedirPermissaoDesktop,
    avisar,
    testarSom: tocar,
  };
}
