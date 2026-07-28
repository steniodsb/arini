"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Inbox, MessageSquare, AtSign, AlarmClock, Radio, Users, Building2,
  BarChart3, Megaphone, Settings, ChevronDown, ChevronRight, Zap,
  LifeBuoy, Bot, PanelLeftClose, PanelLeftOpen, Sparkles,
} from "lucide-react";
import { Logo } from "@/components/brand/Logo";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AgentStatusMenu } from "./AgentStatusMenu";
import type { AgentAvailability } from "@/lib/types";

type Item = {
  href: string;
  label: string;
  icon: typeof Inbox;
  /** Ativo só quando o caminho for exatamente este. */
  exact?: boolean;
  children?: { href: string; label: string; icon: typeof Inbox }[];
};

const ITEMS: Item[] = [
  {
    href: "/atendimento",
    label: "Conversas",
    icon: MessageSquare,
    children: [
      { href: "/atendimento", label: "Todas as conversas", icon: Inbox },
      { href: "/atendimento?vista=mencoes", label: "Menções", icon: AtSign },
      { href: "/atendimento?vista=nao_atendidas", label: "Não atendidas", icon: AlarmClock },
    ],
  },
  { href: "/atendimento/canais", label: "Canais", icon: Radio },
  { href: "/atendimento/contatos", label: "Contatos", icon: Users },
  { href: "/atendimento/empresas", label: "Empresas", icon: Building2 },
  { href: "/atendimento/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/atendimento/campanhas", label: "Campanhas", icon: Megaphone },
  { href: "/atendimento/macros", label: "Macros", icon: Zap },
  { href: "/atendimento/ia", label: "Agentes IA", icon: Bot },
  { href: "/atendimento/ajuda", label: "Central de Ajuda", icon: LifeBuoy },
  { href: "/atendimento/configuracoes", label: "Configurações", icon: Settings },
];

export function AtendimentoNav({
  nome,
  email,
  disponibilidade,
  avatarUrl,
}: {
  nome: string;
  email: string;
  disponibilidade: AgentAvailability;
  avatarUrl?: string | null;
}) {
  const pathname = usePathname();
  const [colapsada, setColapsada] = useState(false);
  const [conversasAbertas, setConversasAbertas] = useState(true);

  function isActive(item: Item) {
    if (item.href === "/atendimento") return pathname === "/atendimento";
    return pathname.startsWith(item.href);
  }

  if (colapsada) {
    return (
      <nav className="w-14 shrink-0 border-r bg-card flex flex-col items-center py-3 gap-1">
        <button
          type="button"
          onClick={() => setColapsada(false)}
          title="Expandir menu"
          className="p-2 rounded-md text-muted-foreground hover:bg-muted mb-2"
        >
          <PanelLeftOpen size={16} />
        </button>
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <Link
              key={item.href}
              href={item.href}
              title={item.label}
              className={`w-10 h-10 rounded-lg flex items-center justify-center transition-colors ${
                active ? "bg-arini text-white dark:bg-gold dark:text-arini" : "text-muted-foreground hover:bg-muted hover:text-foreground"
              }`}
            >
              <Icon size={17} />
            </Link>
          );
        })}
        <div className="mt-auto"><ThemeToggle compact /></div>
      </nav>
    );
  }

  return (
    <nav className="w-56 shrink-0 border-r bg-card flex flex-col">
      {/* Cabeçalho da conta */}
      <div className="h-12 shrink-0 px-3 flex items-center gap-2 border-b">
        <Logo size={20} href="/atendimento" />
        <span className="font-display text-sm leading-none text-arini dark:text-gold truncate flex-1">
          Atendimento
        </span>
        <button
          type="button"
          onClick={() => setColapsada(true)}
          title="Recolher menu"
          className="p-1 rounded text-muted-foreground hover:bg-muted"
        >
          <PanelLeftClose size={15} />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto py-2 px-2 space-y-0.5">
        {ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          const temFilhos = Boolean(item.children?.length);
          return (
            <div key={item.href}>
              <div className="flex items-center">
                <Link
                  href={item.href}
                  className={`flex-1 min-w-0 flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors ${
                    active
                      ? "bg-arini/10 text-arini dark:text-gold font-medium dark:bg-gold/15"
                      : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
                {temFilhos && (
                  <button
                    type="button"
                    onClick={() => setConversasAbertas((v) => !v)}
                    className="p-1 text-muted-foreground hover:text-foreground"
                    title={conversasAbertas ? "Recolher" : "Expandir"}
                  >
                    {conversasAbertas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
              </div>
              {temFilhos && conversasAbertas && (
                <div className="ml-4 pl-2 border-l space-y-0.5 my-0.5">
                  {item.children!.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <sub.icon size={13} className="shrink-0 opacity-70" />
                      <span className="truncate">{sub.label}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* Rodapé: agente + tema */}
      <div className="border-t p-2 flex items-center gap-2">
        <AgentStatusMenu nome={nome} email={email} inicial={disponibilidade} avatarUrl={avatarUrl} />
        <ThemeToggle />
      </div>

      <div className="px-3 pb-2 flex items-center gap-1 text-[10px] text-muted-foreground/60">
        <Sparkles size={10} /> Arini Atendimento
      </div>
    </nav>
  );
}
