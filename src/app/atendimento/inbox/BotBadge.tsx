"use client";

import { useState } from "react";
import { Bot, UserCheck } from "lucide-react";
import { Spinner } from "@/components/atendimento/ui";
import { BOT_STATUS_LABELS, type Conversation } from "@/lib/types";

// =====================================================================
// Selo do estado do Agent Bot NA CONVERSA.
//
// PARA QUE SERVE: sem ele, o atendente abre a conversa, vê respostas que
// ninguém do time escreveu e não entende de onde vêm. Pior: pode começar
// a responder por cima do bot, e o cliente recebe duas vozes.
//
// Aparece só quando `bot_status !== 'sem_bot'` — na esmagadora maioria
// das conversas o componente não renderiza nada e some do caminho.
//
// Componente ISOLADO de propósito: quem liga isto no inbox é outra
// pessoa, e o contrato é só `{ conversation }`.
// =====================================================================

export function BotBadge({
  conversation,
  /** Chamado depois de assumir, para a tela reconciliar o estado local. */
  onAssumida,
}: {
  conversation: Pick<Conversation, "id" | "bot_status" | "bot_transferida_em">;
  onAssumida?: (conversationId: string) => void;
}) {
  const [assumindo, setAssumindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  // Estado otimista: o selo muda para "transferida" na hora do clique.
  // Sem isso o atendente clica, espera a rede e acha que não funcionou.
  const [status, setStatus] = useState(conversation.bot_status);

  if (status === "sem_bot") return null;

  const conduzindo = status === "ativo";

  async function assumir() {
    setAssumindo(true);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/bots/transferir", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversation.id }),
      });
      const json = (await r.json()) as { error?: string };
      if (!r.ok) {
        setErro(json.error ?? "não foi possível assumir");
        return;
      }
      setStatus("transferida");
      onAssumida?.(conversation.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha de rede");
    } finally {
      setAssumindo(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={
          "inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[11px] leading-tight " +
          (conduzindo
            ? "bg-violet-500/12 text-violet-700 dark:text-violet-300"
            : "bg-muted text-muted-foreground")
        }
        title={
          conduzindo
            ? "Um bot externo está respondendo esta conversa. Assuma para ele parar."
            : conversation.bot_transferida_em
              ? `O bot deixou esta conversa com a equipe em ${new Date(conversation.bot_transferida_em).toLocaleString("pt-BR")}.`
              : "O bot deixou esta conversa com a equipe."
        }
      >
        {conduzindo ? <Bot size={12} /> : <UserCheck size={12} />}
        {BOT_STATUS_LABELS[status]}
      </span>

      {conduzindo && (
        <button
          type="button"
          onClick={() => void assumir()}
          disabled={assumindo}
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-[11px] leading-tight text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
          // O texto explica a consequência: o botão não "chama alguém",
          // ele DESLIGA o bot desta conversa.
          title="O bot para de responder e a conversa fica com você"
        >
          {assumindo ? <Spinner size={11} /> : <UserCheck size={12} />} Assumir conversa
        </button>
      )}

      {erro && <span className="text-[11px] text-red-600 dark:text-red-400">{erro}</span>}
    </div>
  );
}

export default BotBadge;
