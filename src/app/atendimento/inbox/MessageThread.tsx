"use client";

import { forwardRef, useMemo } from "react";
import { StickyNote, CornerUpLeft, Bot, Settings2, AlertCircle, Check, CheckCheck, Trash2 } from "lucide-react";
import { formatDateTimeBR } from "@/lib/utils";
import { MediaBubble } from "./MediaBubble";
import type { Message, MessageStatus } from "@/lib/types";

function diaDaMensagem(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, ontem)) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

/** Ícone de entrega das mensagens de saída (estilo WhatsApp). */
function StatusIcon({ status }: { status: MessageStatus }) {
  if (status === "falha") return <AlertCircle size={11} className="text-red-300" />;
  if (status === "lida") return <CheckCheck size={12} className="text-sky-300" />;
  if (status === "entregue") return <CheckCheck size={12} />;
  if (status === "enviada") return <Check size={12} />;
  return null;
}

/**
 * Quebra o texto nos trechos que casam com o termo buscado, para destacar
 * sem usar innerHTML (o conteúdo vem do cliente — nunca injetar como HTML).
 */
function destacar(texto: string, termo: string): React.ReactNode {
  const t = termo.trim();
  if (!t) return texto;
  const partes: React.ReactNode[] = [];
  const alvo = texto.toLowerCase();
  const busca = t.toLowerCase();
  let i = 0;
  let achou = alvo.indexOf(busca);
  let chave = 0;
  while (achou !== -1) {
    if (achou > i) partes.push(texto.slice(i, achou));
    partes.push(
      <mark key={chave++} className="bg-amber-400/40 text-inherit rounded-sm px-0.5">
        {texto.slice(achou, achou + t.length)}
      </mark>,
    );
    i = achou + t.length;
    achou = alvo.indexOf(busca, i);
  }
  if (i < texto.length) partes.push(texto.slice(i));
  return partes;
}

export const MessageThread = forwardRef<
  HTMLDivElement,
  {
    mensagens: Message[];
    carregando: boolean;
    autorNome: Map<string, string>;
    onResponder: (m: Message) => void;
    /** Termo da busca na thread — destaca os trechos encontrados. */
    termoBusca?: string;
    /** Apagar é soft delete; só faz sentido no que a equipe escreveu. */
    onApagar?: (m: Message) => void;
  }
>(function MessageThread(
  { mensagens, carregando, autorNome, onResponder, termoBusca = "", onApagar },
  ref,
) {
  const porId = useMemo(() => {
    const m = new Map<string, Message>();
    for (const msg of mensagens) m.set(msg.id, msg);
    return m;
  }, [mensagens]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-4 space-y-1.5 min-h-0">
      {carregando && mensagens.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-6">Carregando…</p>
      )}
      {!carregando && mensagens.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-6">Sem mensagens nesta conversa.</p>
      )}

      {mensagens.map((m, i) => {
        const anterior = mensagens[i - 1];
        const novoDia = !anterior || diaDaMensagem(anterior.created_at) !== diaDaMensagem(m.created_at);
        const citada = m.reply_to_id ? porId.get(m.reply_to_id) : null;
        const autor = m.autor_id ? autorNome.get(m.autor_id) : null;

        return (
          <div key={m.id}>
            {novoDia && (
              <div className="flex justify-center my-3">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  {diaDaMensagem(m.created_at)}
                </span>
              </div>
            )}

            {/* Nota interna — centralizada, cor de alerta, nunca vai ao cliente */}
            {m.interna ? (
              <div className="flex justify-center group">
                <div className="max-w-[80%] rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 px-3 py-2 text-sm">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400 mb-0.5">
                    <StickyNote size={11} /> Nota interna{autor ? ` · ${autor}` : ""}
                  </div>
                  <div className="whitespace-pre-line break-words">
                    {destacar(m.conteudo ?? "", termoBusca)}
                  </div>
                  {m.media_url && <div className="mt-1.5"><MediaBubble m={m} saida={false} /></div>}
                  <div className="mt-1 text-[10px] opacity-70">{formatDateTimeBR(m.created_at)}</div>
                </div>
              </div>
            ) : m.remetente === "sistema" ? (
              <div className="flex justify-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  <Settings2 size={10} /> {m.conteudo}
                </span>
              </div>
            ) : (
              (() => {
                const saida = m.direcao === "out";
                return (
                  <div className={`flex group ${saida ? "justify-end" : "justify-start"}`}>
                    {/* Responder aparece no hover, do lado de fora do balão */}
                    {saida && (
                      <span className="self-center flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {onApagar && !m.apagada_em && (
                          <button
                            type="button"
                            onClick={() => onApagar(m)}
                            title="Apagar mensagem"
                            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <BotaoResponder onClick={() => onResponder(m)} lado="esquerda" />
                      </span>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        saida
                          ? "bg-arini text-white dark:bg-gold dark:text-arini rounded-br-sm"
                          : "bg-card border rounded-bl-sm"
                      }`}
                    >
                      {citada && (
                        <div
                          className={`mb-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] ${
                            saida ? "border-white/40 bg-white/10" : "border-arini/40 bg-muted/60"
                          }`}
                        >
                          <div className="opacity-70 truncate">
                            {citada.conteudo || `[${citada.tipo}]`}
                          </div>
                        </div>
                      )}

                      {m.apagada_em ? (
                        <div className="italic opacity-60 text-xs inline-flex items-center gap-1">
                          <Trash2 size={11} /> mensagem apagada
                        </div>
                      ) : (
                        <>
                          {m.media_url && (
                            <div className={m.conteudo ? "mb-1.5" : ""}>
                              <MediaBubble m={m} saida={saida} />
                            </div>
                          )}

                          {m.conteudo ? (
                            <div className="whitespace-pre-line break-words">
                              {destacar(m.conteudo, termoBusca)}
                            </div>
                          ) : !m.media_url ? (
                            <div className="italic opacity-70">[{m.tipo}]</div>
                          ) : null}
                        </>
                      )}

                      <div
                        className={`mt-1 flex items-center gap-1 text-[10px] ${
                          saida ? "opacity-70 justify-end" : "text-muted-foreground"
                        }`}
                      >
                        {m.remetente === "ia" && <Bot size={10} />}
                        {saida && autor && <span className="truncate max-w-[90px]">{autor}</span>}
                        <span>{formatDateTimeBR(m.created_at)}</span>
                        {saida && <StatusIcon status={m.status} />}
                        {saida && m.status === "falha" && <span className="text-red-300">falhou</span>}
                      </div>
                    </div>
                    {!saida && <BotaoResponder onClick={() => onResponder(m)} lado="direita" />}
                  </div>
                );
              })()
            )}
          </div>
        );
      })}
    </div>
  );
});

function BotaoResponder({ onClick, lado }: { onClick: () => void; lado: "esquerda" | "direita" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Responder esta mensagem"
      className={`self-center p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity ${
        lado === "esquerda" ? "mr-1" : "ml-1"
      }`}
    >
      <CornerUpLeft size={13} />
    </button>
  );
}
