"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  MessageSquare, Users, Building2, BarChart3, Megaphone, Radio, Settings,
} from "lucide-react";

const ITEMS = [
  { href: "/atendimento", label: "Conversas", icon: MessageSquare, exact: false, match: "/atendimento" },
  { href: "/atendimento/contatos", label: "Contatos", icon: Users, match: "/atendimento/contatos" },
  { href: "/atendimento/empresas", label: "Empresas", icon: Building2, match: "/atendimento/empresas" },
  { href: "/atendimento/relatorios", label: "Relatórios", icon: BarChart3, match: "/atendimento/relatorios" },
  { href: "/atendimento/campanhas", label: "Campanhas", icon: Megaphone, match: "/atendimento/campanhas" },
  { href: "/atendimento/canais", label: "Canais", icon: Radio, match: "/atendimento/canais" },
  { href: "/atendimento/configuracoes", label: "Configurações", icon: Settings, match: "/atendimento/configuracoes" },
];

export function AtendimentoNav() {
  const pathname = usePathname();
  function isActive(item: (typeof ITEMS)[number]) {
    if (item.href === "/atendimento") {
      // "Conversas" ativo só na raiz do atendimento.
      return pathname === "/atendimento";
    }
    return pathname.startsWith(item.match);
  }
  return (
    <nav className="w-16 shrink-0 bg-arini flex flex-col items-center py-3 gap-1">
      {ITEMS.map((item) => {
        const active = isActive(item);
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            title={item.label}
            className={`w-12 h-12 rounded-xl flex flex-col items-center justify-center gap-0.5 transition-colors ${
              active ? "bg-white/15 text-white" : "text-white/60 hover:bg-white/10 hover:text-white"
            }`}
          >
            <Icon size={18} />
            <span className="text-[8px] leading-none">{item.label.split(" ")[0]}</span>
          </Link>
        );
      })}
    </nav>
  );
}
