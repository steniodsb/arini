"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { useTheme } from "@/components/theme/ThemeProvider";
import {
  Search, MessageSquare, Users, Building2, BarChart3, Megaphone, Radio,
  Settings, Zap, Sun, Moon, User, LifeBuoy, Bot, CornerDownLeft, Keyboard,
} from "lucide-react";

type Cmd = {
  id: string;
  label: string;
  hint?: string;
  icon: typeof Search;
  run: () => void;
  grupo: string;
};

/**
 * Barra de comando (Cmd/Ctrl + K) — navegação rápida, ações de tema e
 * busca de conversas por nome/telefone. Cmd/Ctrl + / mostra os atalhos.
 */
export function CommandBar() {
  const [open, setOpen] = useState(false);
  const [atalhos, setAtalhos] = useState(false);
  const [q, setQ] = useState("");
  const [conversas, setConversas] = useState<{ id: string; nome: string; tel: string | null }[]>([]);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();
  const { setPreference } = useTheme();

  // Atalhos globais.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const meta = e.metaKey || e.ctrlKey;
      if (meta && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (meta && e.key === "/") {
        e.preventDefault();
        setAtalhos((v) => !v);
        return;
      }
      if (e.key === "Escape") {
        setOpen(false);
        setAtalhos(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (open) {
      setQ("");
      setCursor(0);
      setTimeout(() => inputRef.current?.focus(), 10);
    }
  }, [open]);

  // Busca conversas conforme digita (a partir de 2 caracteres).
  useEffect(() => {
    const termo = q.trim();
    if (!open || termo.length < 2) { setConversas([]); return; }
    let cancel = false;
    const t = setTimeout(async () => {
      const supabase = createSupabaseBrowser();
      const { data } = await supabase
        .from("conversations")
        .select("id, contato_nome, contato_telefone")
        .or(`contato_nome.ilike.%${termo}%,contato_telefone.ilike.%${termo}%`)
        .order("last_message_at", { ascending: false })
        .limit(6);
      if (cancel) return;
      setConversas(
        (data ?? []).map((c) => ({
          id: c.id as string,
          nome: (c.contato_nome as string) || (c.contato_telefone as string) || "Contato",
          tel: (c.contato_telefone as string) ?? null,
        })),
      );
    }, 200);
    return () => { cancel = true; clearTimeout(t); };
  }, [q, open]);

  const comandos = useMemo<Cmd[]>(() => {
    const nav = (href: string) => () => { setOpen(false); router.push(href); };
    return [
      { id: "conv", label: "Ir para Conversas", icon: MessageSquare, run: nav("/atendimento"), grupo: "Navegação" },
      { id: "cont", label: "Ir para Contatos", icon: Users, run: nav("/atendimento/contatos"), grupo: "Navegação" },
      { id: "emp", label: "Ir para Empresas", icon: Building2, run: nav("/atendimento/empresas"), grupo: "Navegação" },
      { id: "rel", label: "Ir para Relatórios", icon: BarChart3, run: nav("/atendimento/relatorios"), grupo: "Navegação" },
      { id: "camp", label: "Ir para Campanhas", icon: Megaphone, run: nav("/atendimento/campanhas"), grupo: "Navegação" },
      { id: "can", label: "Ir para Canais", icon: Radio, run: nav("/atendimento/canais"), grupo: "Navegação" },
      { id: "mac", label: "Ir para Macros", icon: Zap, run: nav("/atendimento/macros"), grupo: "Navegação" },
      { id: "ia", label: "Ir para Agentes IA", icon: Bot, run: nav("/atendimento/ia"), grupo: "Navegação" },
      { id: "ajuda", label: "Ir para Central de Ajuda", icon: LifeBuoy, run: nav("/atendimento/ajuda"), grupo: "Navegação" },
      { id: "cfg", label: "Ir para Configurações", icon: Settings, run: nav("/atendimento/configuracoes"), grupo: "Navegação" },
      { id: "perfil", label: "Meu perfil", icon: User, run: nav("/atendimento/perfil"), grupo: "Navegação" },
      { id: "claro", label: "Tema claro", icon: Sun, run: () => { setPreference("claro"); setOpen(false); }, grupo: "Aparência" },
      { id: "escuro", label: "Tema escuro", icon: Moon, run: () => { setPreference("escuro"); setOpen(false); }, grupo: "Aparência" },
      { id: "atalhos", label: "Ver atalhos de teclado", hint: "Ctrl /", icon: Keyboard, run: () => { setOpen(false); setAtalhos(true); }, grupo: "Ajuda" },
    ];
  }, [router, setPreference]);

  const filtrados = useMemo(() => {
    const termo = q.trim().toLowerCase();
    if (!termo) return comandos;
    return comandos.filter((c) => c.label.toLowerCase().includes(termo));
  }, [comandos, q]);

  const lista: Cmd[] = useMemo(() => {
    const convCmds: Cmd[] = conversas.map((c) => ({
      id: `conv-${c.id}`,
      label: c.nome,
      hint: c.tel ?? undefined,
      icon: MessageSquare,
      grupo: "Conversas",
      run: () => { setOpen(false); router.push(`/atendimento?c=${c.id}`); },
    }));
    return [...convCmds, ...filtrados];
  }, [conversas, filtrados, router]);

  useEffect(() => { setCursor(0); }, [q]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setCursor((c) => Math.min(c + 1, lista.length - 1)); }
    if (e.key === "ArrowUp") { e.preventDefault(); setCursor((c) => Math.max(c - 1, 0)); }
    if (e.key === "Enter") { e.preventDefault(); lista[cursor]?.run(); }
  }

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-start justify-center pt-24 px-4" onClick={() => setOpen(false)}>
          <div
            className="w-full max-w-lg rounded-xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 px-3 border-b">
              <Search size={16} className="text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                onKeyDown={onKeyDown}
                placeholder="Buscar conversa ou executar um comando…"
                className="flex-1 py-3 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
              <kbd className="text-[10px] rounded border px-1.5 py-0.5 text-muted-foreground">esc</kbd>
            </div>
            <div className="max-h-80 overflow-y-auto py-1">
              {lista.length === 0 && (
                <div className="px-4 py-6 text-center text-sm text-muted-foreground">Nada encontrado.</div>
              )}
              {lista.map((c, i) => {
                const Icon = c.icon;
                const anterior = lista[i - 1];
                const cabecalho = !anterior || anterior.grupo !== c.grupo;
                return (
                  <div key={c.id}>
                    {cabecalho && (
                      <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                        {c.grupo}
                      </div>
                    )}
                    <button
                      type="button"
                      onMouseEnter={() => setCursor(i)}
                      onClick={c.run}
                      className={`w-full flex items-center gap-2.5 px-3 py-2 text-sm text-left ${
                        i === cursor ? "bg-muted" : ""
                      }`}
                    >
                      <Icon size={15} className="text-muted-foreground shrink-0" />
                      <span className="flex-1 truncate">{c.label}</span>
                      {c.hint && <span className="text-[10px] text-muted-foreground">{c.hint}</span>}
                      {i === cursor && <CornerDownLeft size={12} className="text-muted-foreground" />}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {atalhos && <AtalhosModal onClose={() => setAtalhos(false)} />}
    </>
  );
}

const ATALHOS: { teclas: string; acao: string }[] = [
  { teclas: "Ctrl/Cmd + K", acao: "Abrir a barra de comando" },
  { teclas: "Ctrl/Cmd + /", acao: "Mostrar esta lista de atalhos" },
  { teclas: "Enter", acao: "Enviar a mensagem" },
  { teclas: "Shift + Enter", acao: "Quebrar linha sem enviar" },
  { teclas: "Ctrl/Cmd + Enter", acao: "Enviar e resolver a conversa" },
  { teclas: "Alt + N", acao: "Alternar para nota interna" },
  { teclas: "Alt + R", acao: "Resolver / reabrir a conversa" },
  { teclas: "Alt + E", acao: "Adiar (snooze) a conversa" },
  { teclas: "Alt + ↑ / ↓", acao: "Navegar entre conversas" },
  { teclas: "Esc", acao: "Fechar modal / limpar seleção" },
];

function AtalhosModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-xl border bg-popover text-popover-foreground shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-4 py-3 border-b flex items-center gap-2">
          <Keyboard size={16} className="text-muted-foreground" />
          <h2 className="text-sm font-semibold flex-1">Atalhos de teclado</h2>
          <kbd className="text-[10px] rounded border px-1.5 py-0.5 text-muted-foreground">esc</kbd>
        </div>
        <div className="p-2 max-h-[60vh] overflow-y-auto">
          {ATALHOS.map((a) => (
            <div key={a.teclas} className="flex items-center gap-3 px-2 py-1.5 text-sm">
              <span className="flex-1 text-muted-foreground">{a.acao}</span>
              <kbd className="text-[10px] rounded border bg-muted px-1.5 py-0.5 font-mono">{a.teclas}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
