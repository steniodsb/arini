"use client";

// =====================================================================
// MENU DO ATENDIMENTO — os itens mudam conforme o PAPEL (migration 0040).
//
// ⚠️ O QUE O LAYOUT PRECISA PASSAR
// --------------------------------
// Esta nav aceita a prop opcional `papel: AtendimentoPapel`. Ela AINDA
// NÃO É PASSADA pelo `src/app/atendimento/layout.tsx`. Para ligar:
//
//   import { papelDoPerfil } from "@/lib/atendimento/papel";
//   ...
//   <AtendimentoNav
//     nome={...} email={...} disponibilidade={...} avatarUrl={...}
//     papel={papelDoPerfil(profile)}     // ← a linha que falta
//   />
//
// `papelDoPerfil` já trata a regra de que `is_admin_central` conta como
// administrador — não leia `profile.atendimento_papel` cru aqui.
//
// SEM a prop, a nav cai no menu COMPLETO (o comportamento de hoje). É a
// escolha deliberada: menu de administrador para todo mundo é um
// incômodo (links que a RLS recusa), enquanto o contrário — esconder a
// Caixa central da recepção porque a prop não chegou — deixaria a pessoa
// sem o caminho para o trabalho dela.
//
// MAPA DE ITENS POR PAPEL
// -----------------------
//   recepcao      Caixa central (destaque) · Conversas · Contatos ·
//                 Empresas · Central de Ajuda
//                 → sem Relatórios, Campanhas, Configurações, Canais, IA.
//   atendente     Conversas (as filas dele) · Contatos · Empresas ·
//                 Macros · Central de Ajuda
//                 → sem Configurações e sem as telas de gestão.
//   administrador tudo o que já existia + Caixa central no topo.
// =====================================================================

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
import { ThemeSwitch } from "@/components/theme/ThemeSwitch";
import { AgentStatusMenu } from "./AgentStatusMenu";
import { PAPEL_LABELS, type AgentAvailability, type AtendimentoPapel } from "@/lib/types";

type Item = {
  href: string;
  label: string;
  icon: typeof Inbox;
  /** Ativo só quando o caminho for exatamente este. */
  exact?: boolean;
  /** Item de trabalho principal do papel — ganha cor e fica no topo. */
  destaque?: boolean;
  children?: { href: string; label: string; icon: typeof Inbox }[];
};

const CAIXA_CENTRAL: Item = {
  href: "/atendimento?vista=central",
  label: "Caixa central",
  icon: Inbox,
  destaque: true,
};

const CONVERSAS: Item = {
  href: "/atendimento",
  label: "Conversas",
  icon: MessageSquare,
  children: [
    { href: "/atendimento", label: "Todas as conversas", icon: Inbox },
    { href: "/atendimento?vista=mencoes", label: "Menções", icon: AtSign },
    { href: "/atendimento?vista=nao_atendidas", label: "Não atendidas", icon: AlarmClock },
  ],
};

const CONTATOS: Item = { href: "/atendimento/contatos", label: "Contatos", icon: Users };
const EMPRESAS: Item = { href: "/atendimento/empresas", label: "Empresas", icon: Building2 };
const MACROS: Item = { href: "/atendimento/macros", label: "Macros", icon: Zap };
const AJUDA: Item = { href: "/atendimento/ajuda", label: "Central de Ajuda", icon: LifeBuoy };

/** Menu completo — o de hoje, mais a caixa central no topo. */
const ITENS_ADMIN: Item[] = [
  CAIXA_CENTRAL,
  CONVERSAS,
  { href: "/atendimento/canais", label: "Canais", icon: Radio },
  CONTATOS,
  EMPRESAS,
  { href: "/atendimento/relatorios", label: "Relatórios", icon: BarChart3 },
  { href: "/atendimento/campanhas", label: "Campanhas", icon: Megaphone },
  MACROS,
  { href: "/atendimento/ia", label: "Agentes IA", icon: Bot },
  AJUDA,
  { href: "/atendimento/configuracoes", label: "Configurações", icon: Settings },
];

const ITENS_RECEPCAO: Item[] = [CAIXA_CENTRAL, CONVERSAS, CONTATOS, EMPRESAS, AJUDA];

const ITENS_ATENDENTE: Item[] = [CONVERSAS, CONTATOS, EMPRESAS, MACROS, AJUDA];

function itensDoPapel(papel: AtendimentoPapel | undefined): Item[] {
  if (papel === "recepcao") return ITENS_RECEPCAO;
  if (papel === "atendente") return ITENS_ATENDENTE;
  // administrador — e o fallback de quando o layout ainda não passa a prop.
  return ITENS_ADMIN;
}

export function AtendimentoNav({
  nome,
  email,
  cargo,
  disponibilidade,
  avatarUrl,
  papel,
}: {
  nome: string;
  email: string;
  /** Cargo do colaborador (0043) — identificação, não permissão. */
  cargo?: string | null;
  disponibilidade: AgentAvailability;
  avatarUrl?: string | null;
  /** Ver o bloco no topo do arquivo: precisa ser ligado no layout.tsx. */
  papel?: AtendimentoPapel;
}) {
  const pathname = usePathname();
  const [colapsada, setColapsada] = useState(false);
  // Submenu de Conversas nasce fechado: "Todas / Menções / Não atendidas"
  // ocupavam três linhas permanentes na sidebar para atalhos que quase
  // ninguém usa no dia a dia — a lista em si já é a tela inicial.
  const [conversasAbertas, setConversasAbertas] = useState(false);

  const ITEMS = itensDoPapel(papel);

  function isActive(item: Item) {
    // A caixa central e "Conversas" moram na MESMA rota, separadas só pelo
    // `?vista=`. Comparar só o pathname acenderia as duas ao mesmo tempo —
    // e o `usePathname` não enxerga a query. Por isso a caixa central
    // nunca acende sozinha: quem marca a vista é o cabeçalho da lista.
    if (item.href.includes("?")) return false;
    if (item.href === "/atendimento") return pathname === "/atendimento";
    return pathname.startsWith(item.href);
  }

  if (colapsada) {
    return (
      <nav className="w-14 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col items-center py-3 gap-1">
        <button
          type="button"
          onClick={() => setColapsada(false)}
          title="Expandir menu"
          className="p-2 rounded-md text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground mb-2"
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
                active
                  ? "bg-white/15 text-sidebar-foreground"
                  : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
              }`}
            >
              <Icon size={17} />
            </Link>
          );
        })}
        <div className="mt-auto"><ThemeToggle compact tom="sidebar" /></div>
      </nav>
    );
  }

  return (
    <nav className="w-56 shrink-0 border-r border-sidebar-border bg-sidebar text-sidebar-foreground flex flex-col">
      {/* Cabeçalho da conta */}
      <div className="h-12 shrink-0 px-3 flex items-center gap-2 border-b border-sidebar-border">
        {/* A sidebar é verde nos dois temas, então o logo é sempre o de
            fundo escuro — o padrão sumiria no tema claro. */}
        <Logo size={20} href="/atendimento" variant="light" />
        <span className="font-display text-sm leading-none text-sidebar-foreground truncate flex-1">
          Atendimento
        </span>
        <button
          type="button"
          onClick={() => setColapsada(true)}
          title="Recolher menu"
          className="p-1 rounded text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
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
                      ? "bg-white/15 text-sidebar-foreground font-medium"
                      : item.destaque
                        ? "border border-white/25 text-sidebar-foreground font-medium hover:bg-sidebar-hover"
                        : "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
                  }`}
                >
                  <Icon size={16} className="shrink-0" />
                  <span className="truncate">{item.label}</span>
                </Link>
                {temFilhos && (
                  <button
                    type="button"
                    onClick={() => setConversasAbertas((v) => !v)}
                    className="p-1 text-sidebar-muted hover:text-sidebar-foreground"
                    title={conversasAbertas ? "Recolher" : "Expandir"}
                  >
                    {conversasAbertas ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                )}
              </div>
              {temFilhos && conversasAbertas && (
                <div className="ml-4 pl-2 border-l border-sidebar-border space-y-0.5 my-0.5">
                  {item.children!.map((sub) => (
                    <Link
                      key={sub.href}
                      href={sub.href}
                      className="flex items-center gap-2 px-2.5 py-1.5 rounded-md text-[13px] text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-foreground"
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
      <div className="border-t border-sidebar-border p-2 flex items-center gap-2">
        <AgentStatusMenu
          nome={nome}
          email={email}
          cargo={cargo}
          inicial={disponibilidade}
          avatarUrl={avatarUrl}
          tom="sidebar"
        />
        {/* Interruptor direto. O menu de três opções (com "automático")
            vive em Meu perfil › Aparência — aqui o gesto é um clique. */}
        <ThemeSwitch tom="sidebar" />
      </div>

      {/* O papel fica visível: é ele que explica por que o menu de um
          colega tem itens que o meu não tem. */}
      <div className="px-3 pb-2 flex items-center gap-1 text-[10px] text-sidebar-muted/70">
        <Sparkles size={10} /> Arini Atendimento
        {papel && <span className="ml-auto truncate">{PAPEL_LABELS[papel]}</span>}
      </div>
    </nav>
  );
}
