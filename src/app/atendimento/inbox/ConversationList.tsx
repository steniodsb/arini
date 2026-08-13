"use client";

import { useMemo } from "react";
import { CHANNEL_LABELS, type Conversation } from "@/lib/types";
import {
  BotChip, EtiquetaChip, PrioridadeChip, SlaChip, StatusChip,
} from "@/components/atendimento/Chips";
import { formatDateTimeBR } from "@/lib/utils";
import { formatarEspera, minutosEsperando, esperaCritica, LIMITE_ESPERA_MIN } from "./espera";
import { Inbox, Paperclip, Hourglass } from "lucide-react";

const CHANNEL_DOT: Record<string, string> = {
  whatsapp: "bg-green-500",
  instagram: "bg-pink-500",
  facebook: "bg-blue-600",
  messenger: "bg-sky-500",
  telegram: "bg-cyan-500",
  email: "bg-violet-500",
  sms: "bg-orange-500",
  site: "bg-amber-500",
  api: "bg-slate-500",
};

function contactName(c: Conversation) {
  return c.contato_nome || c.contato_telefone || "Contato";
}

/** "há 3 min", "há 2 h", "ontem" — mais legível que data cheia numa lista. */
export function tempoRelativo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h`;
  const d = Math.floor(h / 24);
  if (d === 1) return "ontem";
  if (d < 7) return `${d} d`;
  return formatDateTimeBR(iso).slice(0, 5);
}

/**
 * Quanto tempo a conversa está parada esperando triagem. Vermelho acima
 * de LIMITE_ESPERA_MIN: na caixa central o atraso é o problema, e um
 * número cinza no canto não faz ninguém correr.
 */
function EsperaBadge({ conversa }: { conversa: Conversation }) {
  const min = minutosEsperando(conversa);
  const critico = esperaCritica(min);
  return (
    <span
      title={
        critico
          ? `Esperando triagem há mais de ${LIMITE_ESPERA_MIN} minutos`
          : "Tempo esperando triagem"
      }
      className={`ml-auto inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 font-medium ${
        critico
          ? "bg-red-500/15 text-red-600 dark:text-red-300"
          : "bg-muted text-muted-foreground"
      }`}
    >
      <Hourglass size={9} />
      {formatarEspera(min)}
    </span>
  );
}

export function ConversationList({
  conversas,
  selecionadaId,
  onSelecionar,
  agentName,
  labelColors,
  // Seleção múltipla (ações em massa)
  modoSelecao,
  selecionadas,
  onAlternarSelecao,
  // Caixa central (0040)
  modoCaixaCentral = false,
  vazio: vazioCustom,
  nomePorConexao,
}: {
  conversas: Conversation[];
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  agentName: Map<string, string>;
  labelColors: Map<string, string>;
  modoSelecao: boolean;
  selecionadas: Set<string>;
  onAlternarSelecao: (id: string) => void;
  /**
   * Na caixa central a linha troca o chip do responsável (que por
   * definição não existe) pelo TEMPO ESPERANDO TRIAGEM — a única métrica
   * que a recepção precisa ver para decidir o que pegar primeiro.
   */
  modoCaixaCentral?: boolean;
  /** Estado vazio próprio da vista; sem ele, o genérico. */
  vazio?: React.ReactNode;
  /**
   * Nome da conexão por `channel_id`. Só é passado quando há MAIS DE UMA
   * conexão: com um número só, repetir "WhatsApp Comercial" em toda linha
   * gasta espaço sem informar nada.
   */
  nomePorConexao?: Record<string, string>;
}) {
  const vazio = conversas.length === 0;

  const corDaEtiqueta = useMemo(
    () => (t: string) => labelColors.get(t) ?? null,
    [labelColors],
  );

  if (vazio) {
    if (vazioCustom) return <>{vazioCustom}</>;
    return (
      <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Inbox size={30} className="opacity-40" />
        Nenhuma conversa neste filtro.
      </div>
    );
  }

  return (
    <>
      {conversas.map((c) => {
        const ativa = c.id === selecionadaId;
        const marcada = selecionadas.has(c.id);
        const resp = c.responsavel_id ? agentName.get(c.responsavel_id) : null;
        return (
          <div
            key={c.id}
            className={`w-full border-b flex items-stretch ${
              ativa ? "bg-acao/10" : marcada ? "bg-muted/60" : "hover:bg-muted/40"
            }`}
          >
            {modoSelecao && (
              <label className="pl-3 flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => onAlternarSelecao(c.id)}
                  className="h-3.5 w-3.5 accent-current text-acao"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => onSelecionar(c.id)}
              className={`flex-1 min-w-0 text-left px-3 py-2.5 flex flex-col gap-1 ${
                ativa ? "border-l-2 border-l-acao -ml-0.5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${CHANNEL_DOT[c.canal] ?? "bg-gray-400"}`} />
                <span className="font-medium text-sm truncate flex-1">{contactName(c)}</span>
                {/* Exceções primeiro: é o que o olho precisa achar antes
                    de ler qualquer nome. */}
                {c.sla_violado && <SlaChip />}
                {c.bot_status === "ativo" && <BotChip />}
                {c.unread_count > 0 && (
                  <span className="bg-acao text-acao-foreground text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {c.unread_count}
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                {c.last_message_preview?.startsWith("[") && <Paperclip size={10} className="shrink-0" />}
                {c.last_message_preview ?? "—"}
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                {c.prioridade && <PrioridadeChip prioridade={c.prioridade} />}
                {/* "Aberta" é o estado normal: mostrar chip em toda linha
                    seria ruído. Os outros três são desvio e aparecem. */}
                {c.status !== "aberta" && <StatusChip status={c.status} />}
                {/* Com vários números, o rótulo da CONEXÃO diz mais do que
                    o tipo de canal: "WhatsApp" todas são. */}
                <span className="truncate max-w-[110px]">
                  {(c.channel_id && nomePorConexao?.[c.channel_id]) || CHANNEL_LABELS[c.canal]}
                </span>
                <span>·</span>
                <span>{tempoRelativo(c.last_message_at)}</span>
                {modoCaixaCentral ? (
                  <EsperaBadge conversa={c} />
                ) : (
                  resp && (
                    <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 truncate max-w-[72px]">
                      {resp.split(" ")[0]}
                    </span>
                  )
                )}
              </div>

              {c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.tags.slice(0, 3).map((t) => (
                    <EtiquetaChip key={t} nome={t} cor={corDaEtiqueta(t)} />
                  ))}
                  {c.tags.length > 3 && (
                    <span className="text-[9px] text-muted-foreground">+{c.tags.length - 3}</span>
                  )}
                </div>
              )}
            </button>
          </div>
        );
      })}
    </>
  );
}
