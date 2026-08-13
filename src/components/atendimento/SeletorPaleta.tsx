"use client";

import { Check } from "lucide-react";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  PALETAS, nomeDaPaleta,
  type AmostraPaleta, type EscolhaAgente, type PaletaAtendimento,
} from "@/lib/atendimento/cores";

// =====================================================================
// Escolha de paleta, com prévia de conversa de verdade.
//
// Bolinha de cor não resolve aqui: o que a pessoa quer saber é como a
// TELA vai ficar — bolha enviada, bolha recebida e fundo juntos. Duas
// paletas podem ter o mesmo verde e mesmo assim parecer telas diferentes.
//
// A prévia segue o tema em uso: mostrar a amostra clara para quem está
// no escuro seria mostrar o que a pessoa não vai ver.
// =====================================================================

function Previa({ a }: { a: AmostraPaleta }) {
  return (
    <div
      className="rounded-md p-2 space-y-1.5 border border-black/5 dark:border-white/10"
      style={{ background: a.fundo }}
      aria-hidden
    >
      <div className="flex">
        <span
          className="h-3.5 w-16 rounded-md rounded-bl-sm border border-black/5"
          style={{ background: a.recebida }}
        />
      </div>
      <div className="flex justify-end">
        <span
          className="h-3.5 w-20 rounded-md rounded-br-sm"
          style={{ background: a.bolha }}
        />
      </div>
      <div className="flex justify-end pt-0.5">
        <span className="h-3 w-10 rounded-full" style={{ background: a.acao }} />
      </div>
    </div>
  );
}

export function SeletorPaleta({
  valor,
  onEscolher,
  /** Cartão "Seguir o padrão da conta" — só faz sentido na tela do agente. */
  corDaConta,
}: {
  valor: EscolhaAgente;
  onEscolher: (escolha: EscolhaAgente) => void;
  corDaConta?: PaletaAtendimento;
}) {
  const { resolved } = useTheme();
  const escuro = resolved === "escuro";

  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
      {corDaConta && (
        <Cartao
          ativo={valor === "auto"}
          onClick={() => onEscolher("auto")}
          nome="Seguir o padrão da conta"
          descricao={`Hoje: ${nomeDaPaleta(corDaConta)}. Muda sozinho se a diretoria trocar.`}
          amostra={
            escuro
              ? PALETAS.find((p) => p.chave === corDaConta)!.escuro
              : PALETAS.find((p) => p.chave === corDaConta)!.claro
          }
        />
      )}

      {PALETAS.map((p) => (
        <Cartao
          key={p.chave}
          ativo={valor === p.chave}
          onClick={() => onEscolher(p.chave)}
          nome={p.nome}
          descricao={p.descricao}
          amostra={escuro ? p.escuro : p.claro}
        />
      ))}
    </div>
  );
}

function Cartao({
  ativo,
  onClick,
  nome,
  descricao,
  amostra,
}: {
  ativo: boolean;
  onClick: () => void;
  nome: string;
  descricao: string;
  amostra: AmostraPaleta;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ativo}
      className={`text-left rounded-lg border p-2.5 space-y-2 transition-colors ${
        ativo ? "border-acao ring-1 ring-acao bg-muted/40" : "hover:bg-muted/60"
      }`}
    >
      <Previa a={amostra} />
      <div className="flex items-start gap-1.5">
        <div className="min-w-0 flex-1">
          <div className="text-xs font-medium truncate">{nome}</div>
          <div className="text-[11px] text-muted-foreground leading-snug">{descricao}</div>
        </div>
        {ativo && <Check size={14} className="text-acao shrink-0 mt-0.5" />}
      </div>
    </button>
  );
}
