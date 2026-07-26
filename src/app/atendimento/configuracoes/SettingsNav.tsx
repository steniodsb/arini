"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Users, UsersRound, Tag, Zap, Radio, Inbox, Clock, Timer, Star,
  SlidersHorizontal, Workflow, Webhook, KeyRound, ScrollText,
} from "lucide-react";

const GRUPOS: { titulo: string; itens: { href: string; label: string; icon: typeof Users }[] }[] = [
  {
    titulo: "Equipe",
    itens: [
      { href: "/atendimento/configuracoes/agentes", label: "Agentes", icon: Users },
      { href: "/atendimento/configuracoes/equipes", label: "Equipes", icon: UsersRound },
    ],
  },
  {
    titulo: "Canais",
    itens: [
      { href: "/atendimento/configuracoes/caixas", label: "Caixas de entrada", icon: Inbox },
      { href: "/atendimento/canais", label: "Conexões", icon: Radio },
    ],
  },
  {
    titulo: "Atendimento",
    itens: [
      { href: "/atendimento/configuracoes/etiquetas", label: "Etiquetas", icon: Tag },
      { href: "/atendimento/respostas", label: "Respostas rápidas", icon: Zap },
      { href: "/atendimento/configuracoes/atributos", label: "Atributos personalizados", icon: SlidersHorizontal },
      { href: "/atendimento/configuracoes/horarios", label: "Horário comercial", icon: Clock },
      { href: "/atendimento/configuracoes/sla", label: "SLA", icon: Timer },
      { href: "/atendimento/configuracoes/csat", label: "Satisfação (CSAT)", icon: Star },
    ],
  },
  {
    titulo: "Automação",
    itens: [
      { href: "/atendimento/macros", label: "Macros", icon: Workflow },
      { href: "/atendimento/configuracoes/automacoes", label: "Regras de automação", icon: Zap },
    ],
  },
  {
    titulo: "Plataforma",
    itens: [
      { href: "/atendimento/configuracoes/webhooks", label: "Webhooks", icon: Webhook },
      { href: "/atendimento/configuracoes/tokens", label: "Tokens de API", icon: KeyRound },
      { href: "/atendimento/configuracoes/auditoria", label: "Registro de auditoria", icon: ScrollText },
    ],
  },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 border-r bg-card p-3 space-y-4 overflow-y-auto">
      {GRUPOS.map((g) => (
        <div key={g.titulo} className="space-y-0.5">
          <h2 className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2 pb-1">
            {g.titulo}
          </h2>
          {g.itens.map((it) => {
            const active = pathname.startsWith(it.href);
            const Icon = it.icon;
            return (
              <Link
                key={it.href}
                href={it.href}
                className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-[13px] ${
                  active
                    ? "bg-arini/10 text-arini dark:text-gold font-medium dark:bg-gold/15"
                    : "text-foreground/80 hover:bg-muted"
                }`}
              >
                <Icon size={14} className="shrink-0" /> <span className="truncate">{it.label}</span>
              </Link>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
