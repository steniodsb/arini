"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { AVAILABILITY_DOT, AVAILABILITY_LABELS, type AgentAvailability } from "@/lib/types";
import { LogOut, User, Check } from "lucide-react";

const OPCOES: AgentAvailability[] = ["online", "ocupado", "ausente", "offline"];

/** Avatar do agente no rodapé da sidebar: disponibilidade, perfil e sair. */
export function AgentStatusMenu({
  nome,
  email,
  inicial,
  avatarUrl,
}: {
  nome: string;
  email: string;
  inicial: AgentAvailability;
  /** Foto do perfil. Sem ela, cai no círculo com a inicial do nome. */
  avatarUrl?: string | null;
}) {
  const [status, setStatus] = useState<AgentAvailability>(inicial);
  const [open, setOpen] = useState(false);
  const [saindo, setSaindo] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  async function mudarStatus(novo: AgentAvailability) {
    setStatus(novo);
    setOpen(false);
    const supabase = createSupabaseBrowser();
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase.from("profiles").update({ disponibilidade: novo }).eq("id", data.user.id);
    }
  }

  async function sair() {
    setSaindo(true);
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.replace("/atendimento/login");
    router.refresh();
  }

  return (
    <div className="relative flex-1 min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-2 px-1.5 py-1.5 rounded-lg hover:bg-muted text-left min-w-0"
      >
        <span className="relative shrink-0">
          {avatarUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- URL de storage externo; next/image exigiria allowlist de domínios
            <img
              src={avatarUrl}
              alt=""
              className="h-7 w-7 rounded-full object-cover border"
            />
          ) : (
            <span className="h-7 w-7 rounded-full bg-arini text-white dark:bg-gold dark:text-arini flex items-center justify-center text-[11px] font-semibold">
              {(nome || "?").charAt(0).toUpperCase()}
            </span>
          )}
          <span
            className={`absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full ring-2 ring-card ${AVAILABILITY_DOT[status]}`}
          />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-xs font-medium truncate">{nome}</span>
          <span className="block text-[10px] text-muted-foreground truncate">
            {AVAILABILITY_LABELS[status]}
          </span>
        </span>
      </button>

      {open && (
        <div className="absolute bottom-11 left-0 z-50 w-56 rounded-lg border bg-popover text-popover-foreground shadow-lg overflow-hidden">
          <div className="px-3 py-2 border-b">
            <div className="text-xs font-medium truncate">{nome}</div>
            <div className="text-[10px] text-muted-foreground truncate">{email}</div>
          </div>
          <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Disponibilidade
          </div>
          {OPCOES.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => void mudarStatus(o)}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left"
            >
              <span className={`h-2 w-2 rounded-full ${AVAILABILITY_DOT[o]}`} />
              <span className="flex-1">{AVAILABILITY_LABELS[o]}</span>
              {status === o && <Check size={13} className="text-arini dark:text-gold" />}
            </button>
          ))}
          <div className="border-t mt-1">
            <Link
              href="/atendimento/perfil"
              onClick={() => setOpen(false)}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted"
            >
              <User size={14} className="text-muted-foreground" /> Meu perfil
            </Link>
            <button
              type="button"
              onClick={() => void sair()}
              disabled={saindo}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-red-600 dark:text-red-400"
            >
              <LogOut size={14} /> {saindo ? "Saindo…" : "Sair"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
