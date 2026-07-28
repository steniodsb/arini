"use client";

import { useMemo } from "react";
import {
  CHANNEL_LABELS, PRIORITY_CLASSES, PRIORITY_LABELS,
  type Conversation,
} from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import { Check, Inbox, AlarmClock, Paperclip, AlertTriangle, Clock } from "lucide-react";

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
}: {
  conversas: Conversation[];
  selecionadaId: string | null;
  onSelecionar: (id: string) => void;
  agentName: Map<string, string>;
  labelColors: Map<string, string>;
  modoSelecao: boolean;
  selecionadas: Set<string>;
  onAlternarSelecao: (id: string) => void;
}) {
  const vazio = conversas.length === 0;

  const corDaEtiqueta = useMemo(
    () => (t: string) => labelColors.get(t) ?? null,
    [labelColors],
  );

  if (vazio) {
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
        const adiada = c.status === "adiada";
        return (
          <div
            key={c.id}
            className={`w-full border-b flex items-stretch ${
              ativa ? "bg-arini/5 dark:bg-gold/10" : marcada ? "bg-muted/60" : "hover:bg-muted/40"
            }`}
          >
            {modoSelecao && (
              <label className="pl-3 flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={marcada}
                  onChange={() => onAlternarSelecao(c.id)}
                  className="h-3.5 w-3.5 accent-current text-arini dark:text-gold"
                />
              </label>
            )}
            <button
              type="button"
              onClick={() => onSelecionar(c.id)}
              className={`flex-1 min-w-0 text-left px-3 py-2.5 flex flex-col gap-1 ${
                ativa ? "border-l-2 border-l-arini dark:border-l-gold -ml-0.5" : ""
              }`}
            >
              <div className="flex items-center gap-2">
                <span className={`h-2 w-2 rounded-full shrink-0 ${CHANNEL_DOT[c.canal] ?? "bg-gray-400"}`} />
                <span className="font-medium text-sm truncate flex-1">{contactName(c)}</span>
                {c.sla_violado && (
                  <AlertTriangle size={12} className="text-red-500 shrink-0" aria-label="SLA violado" />
                )}
                {adiada && <AlarmClock size={12} className="text-amber-500 shrink-0" />}
                {c.status === "resolvida" && <Check size={13} className="text-emerald-500 shrink-0" />}
                {c.status === "pendente" && <Clock size={12} className="text-sky-500 shrink-0" />}
                {c.unread_count > 0 && (
                  <span className="bg-arini text-white dark:bg-gold dark:text-arini text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                    {c.unread_count}
                  </span>
                )}
              </div>

              <div className="text-xs text-muted-foreground truncate flex items-center gap-1">
                {c.last_message_preview?.startsWith("[") && <Paperclip size={10} className="shrink-0" />}
                {c.last_message_preview ?? "—"}
              </div>

              <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                {c.prioridade && (
                  <span className={`rounded border px-1 py-px font-medium ${PRIORITY_CLASSES[c.prioridade]}`}>
                    {PRIORITY_LABELS[c.prioridade]}
                  </span>
                )}
                <span>{CHANNEL_LABELS[c.canal]}</span>
                <span>·</span>
                <span>{tempoRelativo(c.last_message_at)}</span>
                {resp && (
                  <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5 truncate max-w-[72px]">
                    {resp.split(" ")[0]}
                  </span>
                )}
              </div>

              {c.tags.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {c.tags.slice(0, 3).map((t) => {
                    const cor = corDaEtiqueta(t);
                    return (
                      <span
                        key={t}
                        className="rounded-full text-[9px] px-1.5 py-0.5"
                        style={
                          cor
                            ? { backgroundColor: `${cor}22`, color: cor }
                            : undefined
                        }
                      >
                        {!cor ? <span className="text-arini dark:text-gold">{t}</span> : t}
                      </span>
                    );
                  })}
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
