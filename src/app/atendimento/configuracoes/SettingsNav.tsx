"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Users, UsersRound, Tag, Zap, Radio } from "lucide-react";

const ITEMS = [
  { href: "/atendimento/configuracoes/agentes", label: "Agentes", icon: Users },
  { href: "/atendimento/configuracoes/equipes", label: "Equipes", icon: UsersRound },
  { href: "/atendimento/configuracoes/etiquetas", label: "Etiquetas", icon: Tag },
  { href: "/atendimento/respostas", label: "Respostas rápidas", icon: Zap },
  { href: "/atendimento/canais", label: "Canais", icon: Radio },
];

export function SettingsNav() {
  const pathname = usePathname();
  return (
    <nav className="w-56 shrink-0 border-r bg-card p-3 space-y-1">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground px-2 pb-1">Configurações</h2>
      {ITEMS.map((it) => {
        const active = pathname.startsWith(it.href);
        const Icon = it.icon;
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`flex items-center gap-2 px-2 py-1.5 rounded-md text-sm ${active ? "bg-arini/10 text-arini font-medium" : "text-foreground/80 hover:bg-muted"}`}
          >
            <Icon size={15} /> {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
