"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CHANNEL_LABELS,
  type Conversation,
  type Message,
  type CannedResponse,
  type AgentOption,
  type ConversationStatus,
} from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import { ContactPanel } from "./ContactPanel";
import { Send, RefreshCw, Inbox, Check, StickyNote, Zap, X, RotateCcw, Clock, Search } from "lucide-react";

const CHANNEL_DOT: Record<string, string> = {
  whatsapp: "bg-green-500",
  instagram: "bg-pink-500",
  facebook: "bg-blue-600",
  messenger: "bg-sky-500",
};

type StatusFilter = "todas" | ConversationStatus;
type AssignFilter = "todas" | "minhas" | "nao_atribuidas";

function contactName(c: Conversation) {
  return c.contato_nome || c.contato_telefone || "Contato";
}
function initials(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

export function AtendimentoInbox({
  initialConversations,
  cannedResponses,
  agents,
  currentUserId,
}: {
  initialConversations: Conversation[];
  cannedResponses: CannedResponse[];
  agents: AgentOption[];
  currentUserId: string;
}) {
  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(initialConversations[0]?.id ?? null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [texto, setTexto] = useState("");
  const [mode, setMode] = useState<"resposta" | "nota">("resposta");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");
  const [assignFilter, setAssignFilter] = useState<AssignFilter>("todas");
  const [busca, setBusca] = useState("");
  const [showCanned, setShowCanned] = useState(false);
  const [novaTag, setNovaTag] = useState("");
  const scrollRef = useRef<HTMLDivElement>(null);

  const agentName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.nome);
    return m;
  }, [agents]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Escopo por status (as abas de atribuição contam dentro dele).
  const byStatus = useMemo(
    () => conversations.filter((c) => statusFilter === "todas" || c.status === statusFilter),
    [conversations, statusFilter],
  );
  const counts = useMemo(() => ({
    minhas: byStatus.filter((c) => c.responsavel_id === currentUserId).length,
    nao_atribuidas: byStatus.filter((c) => !c.responsavel_id).length,
    todas: byStatus.length,
  }), [byStatus, currentUserId]);

  const filtered = useMemo(() => {
    return byStatus.filter((c) => {
      if (assignFilter === "minhas" && c.responsavel_id !== currentUserId) return false;
      if (assignFilter === "nao_atribuidas" && c.responsavel_id) return false;
      if (busca.trim()) {
        const q = busca.toLowerCase();
        const hay = `${c.contato_nome ?? ""} ${c.contato_telefone ?? ""} ${c.last_message_preview ?? ""}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [byStatus, assignFilter, busca, currentUserId]);

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

  function patchLocal(id: string, patch: Partial<Conversation>) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // Ao selecionar: carrega mensagens e zera o não-lidas.
  useEffect(() => {
    if (!selectedId) return;
    setLoadingMsgs(true);
    loadMessages(selectedId).finally(() => setLoadingMsgs(false));
    const supabase = createSupabaseBrowser();
    void supabase.from("conversations").update({ unread_count: 0 }).eq("id", selectedId).then(() => {
      patchLocal(selectedId, { unread_count: 0 });
    });
  }, [selectedId, loadMessages]);

  // Tempo real: assina inserts de mensagens e mudanças de conversas
  // (a RLS filtra por atendente). Fallback lento por polling a cada 30s.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel("atendimento-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.conversation_id === selectedId) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
        void refreshConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void refreshConversations();
      })
      .subscribe();
    const t = setInterval(() => {
      void refreshConversations();
      if (selectedId) void loadMessages(selectedId);
    }, 30000);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, [selectedId, loadMessages, refreshConversations]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  async function send() {
    const body = texto.trim();
    if (!body || !selectedId || sending) return;
    setSending(true);
    setNotice(null);
    const interna = mode === "nota";
    try {
      const res = await fetch("/api/atendimento/send", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selectedId, texto: body, interna }),
      });
      const json = await res.json();
      if (!res.ok) {
        setNotice(json.error ?? "Falha ao enviar.");
      } else {
        setTexto("");
        if (json.message) setMessages((prev) => [...prev, json.message as Message]);
        if (json.delivered === false) {
          setNotice(`Mensagem registrada, mas NÃO enviada ao cliente (${json.reason}). Conecte um canal em Canais.`);
        }
        void refreshConversations();
      }
    } catch {
      setNotice("Erro de rede ao enviar.");
    } finally {
      setSending(false);
    }
  }

  async function assign(agentId: string | null) {
    if (!selected) return;
    patchLocal(selected.id, { responsavel_id: agentId });
    const supabase = createSupabaseBrowser();
    await supabase.from("conversations").update({ responsavel_id: agentId }).eq("id", selected.id);
  }

  async function mudarStatus(status: ConversationStatus) {
    if (!selected) return;
    const patch: Partial<Conversation> = { status };
    const update: Record<string, unknown> = { status };
    if (status === "resolvida") {
      const now = new Date().toISOString();
      patch.resolvida_em = now; patch.resolvida_por = currentUserId;
      update.resolvida_em = now; update.resolvida_por = currentUserId;
    }
    patchLocal(selected.id, patch);
    const supabase = createSupabaseBrowser();
    await supabase.from("conversations").update(update).eq("id", selected.id);
  }

  async function saveTags(tags: string[]) {
    if (!selected) return;
    patchLocal(selected.id, { tags });
    const supabase = createSupabaseBrowser();
    await supabase.from("conversations").update({ tags }).eq("id", selected.id);
  }
  function addTag() {
    const t = novaTag.trim().toLowerCase();
    if (!t || !selected || selected.tags.includes(t)) { setNovaTag(""); return; }
    void saveTags([...selected.tags, t]);
    setNovaTag("");
  }
  function removeTag(t: string) {
    if (!selected) return;
    void saveTags(selected.tags.filter((x) => x !== t));
  }

  return (
    <div className="flex h-full border-t">
      {/* ---- Lista ---- */}
      <aside className="w-80 shrink-0 border-r bg-card flex flex-col">
        <div className="border-b">
          <div className="p-2 flex items-center gap-1">
            <div className="relative flex-1">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar…"
                className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border bg-background"
              />
            </div>
            <button type="button" onClick={() => void refreshConversations()} className="p-1.5 text-muted-foreground hover:text-arini" title="Atualizar">
              <RefreshCw size={15} />
            </button>
          </div>
          {/* Abas de atribuição com contadores (estilo Chatwoot) */}
          <div className="flex text-xs px-2 gap-4">
            {([
              ["minhas", "Minhas", counts.minhas],
              ["nao_atribuidas", "Não atribuídas", counts.nao_atribuidas],
              ["todas", "Todos", counts.todas],
            ] as [AssignFilter, string, number][]).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAssignFilter(key)}
                className={`py-2 border-b-2 -mb-px inline-flex items-center gap-1.5 ${
                  assignFilter === key ? "border-arini text-arini font-medium" : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${assignFilter === key ? "bg-arini/10 text-arini" : "bg-muted text-muted-foreground"}`}>{n}</span>
              </button>
            ))}
          </div>
          {/* Filtro de status */}
          <div className="flex gap-1 text-[11px] px-2 py-1.5 border-t bg-muted/20">
            {(["todas", "aberta", "pendente", "resolvida"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-0.5 rounded-full capitalize ${statusFilter === s ? "bg-arini text-white" : "hover:bg-muted text-muted-foreground"}`}
              >
                {s === "todas" ? "todos status" : s}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {filtered.length === 0 && (
            <div className="p-6 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
              <Inbox size={28} className="opacity-40" />
              Nenhuma conversa neste filtro.
            </div>
          )}
          {filtered.map((c) => {
            const active = c.id === selectedId;
            const resp = c.responsavel_id ? agentName.get(c.responsavel_id) : null;
            return (
              <button
                type="button"
                key={c.id}
                onClick={() => setSelectedId(c.id)}
                className={`w-full text-left px-3 py-2.5 border-b flex flex-col gap-1 ${active ? "bg-arini/5 border-l-2 border-l-arini" : "hover:bg-muted/40"}`}
              >
                <div className="flex items-center gap-2">
                  <span className={`h-2 w-2 rounded-full shrink-0 ${CHANNEL_DOT[c.canal] ?? "bg-gray-400"}`} />
                  <span className="font-medium text-sm truncate flex-1">{contactName(c)}</span>
                  {c.status === "resolvida" && <Check size={13} className="text-emerald-500 shrink-0" />}
                  {c.unread_count > 0 && (
                    <span className="bg-arini text-white text-[10px] font-bold rounded-full px-1.5 py-0.5 min-w-[18px] text-center">{c.unread_count}</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{c.last_message_preview ?? "—"}</div>
                <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                  <span>{CHANNEL_LABELS[c.canal]}</span>
                  <span>·</span>
                  <span>{formatDateTimeBR(c.last_message_at)}</span>
                  {resp && <span className="ml-auto rounded-full bg-muted px-1.5 py-0.5">{resp.split(" ")[0]}</span>}
                </div>
                {c.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {c.tags.slice(0, 3).map((t) => (
                      <span key={t} className="rounded-full bg-arini/10 text-arini text-[9px] px-1.5 py-0.5">{t}</span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </aside>

      {/* ---- Thread ---- */}
      <section className="flex-1 min-w-0 flex flex-col bg-muted/20">
        {!selected ? (
          <div className="flex-1 flex items-center justify-center text-sm text-muted-foreground">Selecione uma conversa à esquerda.</div>
        ) : (
          <>
            <header className="px-3 py-2 border-b bg-card flex items-center justify-between gap-2 flex-wrap">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate">{contactName(selected)}</div>
                <div className="text-xs text-muted-foreground">
                  {CHANNEL_LABELS[selected.canal]}{selected.contato_telefone ? ` · ${selected.contato_telefone}` : ""}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <select
                  value={selected.responsavel_id ?? ""}
                  onChange={(e) => void assign(e.target.value || null)}
                  className="text-xs rounded-md border bg-background px-2 py-1.5 max-w-[140px]"
                  title="Responsável"
                >
                  <option value="">Não atribuído</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
                </select>
                {selected.status !== "resolvida" ? (
                  <>
                    <Button type="button" size="sm" variant="outline" onClick={() => void mudarStatus(selected.status === "pendente" ? "aberta" : "pendente")} title="Marcar pendente">
                      <Clock size={14} />
                    </Button>
                    <Button type="button" size="sm" variant="gold" onClick={() => void mudarStatus("resolvida")}>
                      <Check size={14} /> Resolver
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void mudarStatus("aberta")}>
                    <RotateCcw size={14} /> Reabrir
                  </Button>
                )}
              </div>
            </header>

            {/* Etiquetas */}
            <div className="px-3 py-1.5 border-b bg-card/60 flex items-center gap-1.5 flex-wrap">
              {selected.tags.map((t) => (
                <span key={t} className="inline-flex items-center gap-1 rounded-full bg-arini/10 text-arini text-[11px] px-2 py-0.5">
                  {t}
                  <button type="button" onClick={() => removeTag(t)} className="hover:text-red-600"><X size={10} /></button>
                </span>
              ))}
              <input
                value={novaTag}
                onChange={(e) => setNovaTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                placeholder="+ etiqueta"
                className="text-[11px] bg-transparent outline-none w-24 placeholder:text-muted-foreground"
              />
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-2">
              {loadingMsgs && messages.length === 0 && <p className="text-center text-xs text-muted-foreground">Carregando…</p>}
              {!loadingMsgs && messages.length === 0 && <p className="text-center text-xs text-muted-foreground">Sem mensagens nesta conversa.</p>}
              {messages.map((m) => {
                if (m.interna) {
                  return (
                    <div key={m.id} className="flex justify-center">
                      <div className="max-w-[80%] rounded-lg bg-amber-50 border border-amber-200 text-amber-900 px-3 py-2 text-sm">
                        <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-700 mb-0.5">
                          <StickyNote size={11} /> Nota interna
                        </div>
                        <div className="whitespace-pre-line break-words">{m.conteudo}</div>
                        <div className="mt-1 text-[10px] text-amber-700/70">{formatDateTimeBR(m.created_at)}</div>
                      </div>
                    </div>
                  );
                }
                const out = m.direcao === "out";
                return (
                  <div key={m.id} className={`flex ${out ? "justify-end" : "justify-start"}`}>
                    <div className={`max-w-[75%] rounded-2xl px-3 py-2 text-sm ${out ? "bg-arini text-white rounded-br-sm" : "bg-card border rounded-bl-sm"}`}>
                      {m.conteudo ? <div className="whitespace-pre-line break-words">{m.conteudo}</div> : <div className="italic opacity-70">[{m.tipo}]</div>}
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

            {notice && <div className="px-4 py-2 text-xs bg-amber-50 text-amber-800 border-t border-amber-200">{notice}</div>}

            {/* Composer */}
            <div className="border-t bg-card">
              <div className="flex items-center gap-1 px-3 pt-2">
                <button type="button" onClick={() => setMode("resposta")} className={`text-xs px-2 py-1 rounded-t-md ${mode === "resposta" ? "bg-arini text-white" : "text-muted-foreground hover:bg-muted"}`}>Responder</button>
                <button type="button" onClick={() => setMode("nota")} className={`text-xs px-2 py-1 rounded-t-md inline-flex items-center gap-1 ${mode === "nota" ? "bg-amber-500 text-white" : "text-muted-foreground hover:bg-muted"}`}>
                  <StickyNote size={12} /> Nota interna
                </button>
                <div className="relative ml-auto">
                  <button type="button" onClick={() => setShowCanned((v) => !v)} className="text-xs px-2 py-1 rounded-md text-muted-foreground hover:bg-muted inline-flex items-center gap-1" title="Respostas rápidas">
                    <Zap size={12} /> Rápidas
                  </button>
                  {showCanned && (
                    <div className="absolute right-0 bottom-9 z-10 w-72 max-h-64 overflow-y-auto rounded-md border bg-popover shadow-lg">
                      {cannedResponses.length === 0 && <div className="p-3 text-xs text-muted-foreground">Nenhuma resposta rápida cadastrada.</div>}
                      {cannedResponses.map((cr) => (
                        <button key={cr.id} type="button" onClick={() => { setTexto((t) => (t ? t + "\n" : "") + cr.conteudo); setShowCanned(false); }} className="w-full text-left px-3 py-2 border-b hover:bg-muted/50">
                          <div className="text-xs font-medium">{cr.titulo} <span className="text-muted-foreground">/{cr.atalho}</span></div>
                          <div className="text-[11px] text-muted-foreground truncate">{cr.conteudo}</div>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              <div className={`p-3 pt-2 flex items-end gap-2 ${mode === "nota" ? "bg-amber-50/50" : ""}`}>
                <Textarea
                  rows={1}
                  value={texto}
                  onChange={(e) => setTexto(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  placeholder={mode === "nota" ? "Nota interna (só a equipe vê)…" : "Escreva uma resposta…  (Enter envia)"}
                  className="resize-none min-h-[42px] max-h-32"
                />
                <Button type="button" variant={mode === "nota" ? "outline" : "gold"} onClick={() => void send()} disabled={sending || !texto.trim()}>
                  {mode === "nota" ? <StickyNote size={15} /> : <Send size={15} />} {sending ? "…" : mode === "nota" ? "Nota" : "Enviar"}
                </Button>
              </div>
            </div>
          </>
        )}
      </section>

      {/* ---- Painel de contato ---- */}
      {selected && <ContactPanel conversation={selected} />}
    </div>
  );
}
