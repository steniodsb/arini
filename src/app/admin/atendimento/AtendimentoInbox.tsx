"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CHANNEL_LABELS, type Conversation, type Message } from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import { Send, RefreshCw, ExternalLink, Inbox } from "lucide-react";

const CHANNEL_DOT: Record<string, string> = {
  whatsapp: "bg-green-500",
  instagram: "bg-pink-500",
  facebook: "bg-blue-600",
  messenger: "bg-sky-500",
};

function contactName(c: Conversation) {
  return c.contato_nome || c.contato_telefone || "Contato";
}

export function AtendimentoInbox({
  initialConversations,
}: {
  initialConversations: Conversation[];
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [texto, setTexto] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  const loadMessages = useCallback(async (convId: string) => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
  }, []);

  const refreshConversations = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200);
    if (data) setConversations(data as Conversation[]);
  }, []);

  // Ao selecionar uma conversa: carrega as mensagens e zera o não-lidas.
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMsgs(true);
    loadMessages(selectedId).finally(() => setLoadingMsgs(false));
    const supabase = createSupabaseBrowser();
    void supabase
      .from("conversations")
      .update({ unread_count: 0 })
      .eq("id", selectedId)
      .then(() => {
        setConversations((prev) =>
          prev.map((c) => (c.id === selectedId ? { ...c, unread_count: 0 } : c)),
        );
      });
  }, [selectedId, loadMessages]);

  // Polling leve: mantém a lista e a conversa aberta atualizadas (~12s).
  useEffect(() => {
    const t = setInterval(() => {
      void refreshConversations();
      if (selectedId) void loadMessages(selectedId);
    }, 12000);
    return () => clearInterval(t);
  }, [selectedId, loadMessages, refreshConversations]);

  // Rola pro fim quando chegam/carregam mensagens.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = texto.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const res = await fetch("/api/atendimento/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, texto: body }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error ?? "Falha ao enviar.");
      } else {
        setTexto("");
        if (json.message) setMessages((prev) => [...prev, json.message as Message]);
        if (json.delivered === false) {
          setNotice(
            `Mensagem registrada, mas NÃO enviada ao cliente (${json.reason}). Conecte o WhatsApp em Integrações.`,
          );
        }
        void refreshConversations();
      }
    } catch {
      setNotice("Erro de rede ao enviar.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex h-full border-t">
      {/* Lista de conversas */}
      <aside className="w-80 shrink-0 border-r bg-card flex flex-col">
        <div className="p-3 border-b flex items-center justify-between">
          <h2 className="font-semibold text-sm">Conversas</h2>
          <button
            type="button"
            onClick={() => void refreshConversations()}
            className="text-muted-foreground hover:text-arini"
            title="Atualizar"
          >
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {conversations.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Inbox size={28} className="opacity-40" />
              Nenhuma conversa ainda. Elas aparecem aqui quando um cliente escreve no WhatsApp ou Instagram.
            </div>
          )}
          {conversations.map((c) => {
            const active = c.id === selectedId;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b flex flex-col gap-1 ${
                  active ? "bg-arini/5 border-l-2 border-l-arini" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${CHANNEL_DOT[c.canal] ?? "bg-gray-400"}`} />
                  <span className="font-medium text-sm truncate flex-1">{contactName(c)}</span>
                  {c.unread_count > 0 && (
                    <span className="bg-arini text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">
                      {c.unread_count}
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span className="truncate flex-1">{c.last_message_preview ?? "—"}</span>
                </div>
                <div className="text-[10px] text-muted-foreground/70">
                  {CHANNEL_LABELS[c.canal]} · {formatDateTimeBR(c.last_message_at)}
                </div>
              </button>
            );
          })}
        </div>
      </aside>

      {/* Thread */}
      <section className="flex-1 min-w-0 flex flex-col bg-muted/20">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">
            Selecione uma conversa à esquerda.
          </div>
        ) : (
          <>
            <header className="p-3 border-b bg-card flex items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{contactName(selected)}</div>
                <div className="text-xs text-muted-foreground">
                  {CHANNEL_LABELS[selected.canal]}
                  {selected.contato_telefone ? ` · ${selected.contato_telefone}` : ""}
                </div>
              </div>
              {selected.lead_id && (
                <Link
                  href={`/admin/leads/${selected.lead_id}`}
                  className="inline-flex items-center gap-1 text-xs text-arini hover:text-gold-dark font-medium shrink-0"
                >
                  Ver lead <ExternalLink size={12} />
                </Link>
              )}
            </header>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMsgs && messages.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">Carregando…</p>
              )}
              {!loadingMsgs && messages.length === 0 && (
                <p className="text-center text-xs text-muted-foreground">Sem mensagens nesta conversa.</p>
              )}
              {messages.map((m) => {
                const out = m.direcao === "out";
                return (
                  <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${
                        out ? "bg-arini text-white rounded-br-sm" : "bg-card border rounded-bl-sm"
                      }`}
                    >
                      {m.conteudo ? (
                        <div className="whitespace-pre-line break-words">{m.conteudo}</div>
                      ) : (
                        <div className="italic opacity-70">[{m.tipo}]</div>
                      )}
                      <div className={`mt-1 text-[10px] ${out ? "text-white/60" : "text-muted-foreground"}`}>
                        {formatDateTimeBR(m.created_at)}
                        {out && m.status === "falha" && " · falhou"}
                        {out && m.status === "enviada" && " · enviada"}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {notice && (
              <div className="px-4 py-2 text-xs bg-amber-50 text-amber-800 border-t border-amber-200">
                {notice}
              </div>
            )}

            <div className="p-3 border-t bg-card flex items-end gap-2">
              <Textarea
                rows={1}
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                placeholder="Escreva uma resposta…  (Enter envia, Shift+Enter quebra linha)"
                className="resize-none min-h-[42px] max-h-32"
              />
              <Button
                type="button"
                variant="gold"
                onClick={() => void send()}
                disabled={sending || !texto.trim()}
              >
                <Send size={15} /> {sending ? "…" : "Enviar"}
              </Button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
