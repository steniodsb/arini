"use client";

// =====================================================================
// FAIXA DE CHAMADA PARA O ASSISTENTE DE PRIMEIROS PASSOS
//
// ONDE ESTA FAIXA DEVE ENTRAR (ligação feita por você, Stenio — este
// arquivo não toca em layout nem no inbox de propósito):
//
//   `src/app/atendimento/layout.tsx`, dentro do container que envolve
//   o `{children}`, LOGO ACIMA dele e ABAIXO do `AtendimentoNav` —
//   assim a faixa aparece em qualquer tela do atendimento e empurra o
//   conteúdo para baixo em vez de flutuar por cima:
//
//     import { AvisoOnboarding } from "@/app/atendimento/comecar/AvisoOnboarding";
//     …
//     <main className="…">
//       <AvisoOnboarding />
//       {children}
//     </main>
//
//   Se preferir mostrar só na caixa de entrada, o outro ponto natural
//   é o topo do painel de conversas em `AtendimentoInbox.tsx`.
//
// A faixa é autossuficiente: busca o próprio estado em
// `GET /api/atendimento/onboarding`, some sozinha quando o onboarding
// está concluído ou dispensado e não recebe nenhuma prop.
// =====================================================================

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight, Rocket, X } from "lucide-react";
import type { ResumoOnboarding } from "./tipos";

/**
 * Fechar a faixa vale só para a aba atual (sessionStorage). O "some para
 * sempre" é o botão Dispensar dentro do assistente, que grava no banco —
 * um X numa barrinha não deveria ter esse poder.
 */
const CHAVE_SESSAO = "atendimento:aviso-onboarding-fechado";

export function AvisoOnboarding() {
  const [resumo, setResumo] = useState<ResumoOnboarding | null>(null);
  const [fechado, setFechado] = useState(true); // começa oculto: nada de piscar

  useEffect(() => {
    if (sessionStorage.getItem(CHAVE_SESSAO) === "1") return;
    setFechado(false);

    let vivo = true;
    void (async () => {
      try {
        const res = await fetch("/api/atendimento/onboarding");
        if (!res.ok) return;
        const dados = (await res.json()) as ResumoOnboarding;
        if (vivo) setResumo(dados);
      } catch {
        // Silêncio proposital: é um aviso auxiliar, não pode virar erro na tela.
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  if (fechado || !resumo) return null;
  if (resumo.concluido || resumo.dispensado || resumo.pendentes === 0) return null;

  function fechar() {
    sessionStorage.setItem(CHAVE_SESSAO, "1");
    setFechado(true);
  }

  return (
    <div className="flex items-center gap-3 border-b bg-arini/5 dark:bg-gold/10 px-4 py-2 text-xs">
      <Rocket size={14} className="shrink-0 text-arini dark:text-gold" />
      <p className="min-w-0 flex-1">
        <span className="font-medium">
          Falta{resumo.pendentes === 1 ? "" : "m"} {resumo.pendentes}{" "}
          passo{resumo.pendentes === 1 ? "" : "s"} para configurar o atendimento
        </span>
        <span className="text-muted-foreground"> — {resumo.feitos} de {resumo.total} prontos.</span>
      </p>
      <Link
        href="/atendimento/comecar"
        className="inline-flex items-center gap-1 font-medium text-arini dark:text-gold hover:underline shrink-0"
      >
        Continuar <ArrowRight size={13} />
      </Link>
      <button
        type="button"
        onClick={fechar}
        aria-label="Fechar aviso"
        className="p-1 rounded text-muted-foreground hover:bg-muted shrink-0"
      >
        <X size={13} />
      </button>
    </div>
  );
}
