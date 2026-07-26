"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Eye, Check, Plus, X } from "lucide-react";
import type { AgentOption } from "@/lib/types";

// Participante ≠ responsável. O responsável é quem tem que resolver; o
// participante só acompanha (recebe menção e notificação). É como o
// gerente segue um caso sem tirá-lo do atendente.

export function ParticipantsMenu({
  conversationId,
  agents,
  currentUserId,
}: {
  conversationId: string;
  agents: AgentOption[];
  currentUserId: string;
}) {
  const [participantes, setParticipantes] = useState<string[]>([]);
  const [aberto, setAberto] = useState(false);
  const [carregando, setCarregando] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("atendimento_conversation_participants")
      .select("profile_id")
      .eq("conversation_id", conversationId);
    setParticipantes((data ?? []).map((r) => r.profile_id as string));
    setCarregando(false);
  }, [conversationId]);

  useEffect(() => { void carregar(); }, [carregar]);

  useEffect(() => {
    if (!aberto) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [aberto]);

  async function alternar(profileId: string) {
    const supabase = createSupabaseBrowser();
    const jaEsta = participantes.includes(profileId);
    // Otimista: a lista responde na hora e volta atrás se o banco recusar.
    setParticipantes((p) => (jaEsta ? p.filter((x) => x !== profileId) : [...p, profileId]));
    const { error } = jaEsta
      ? await supabase
          .from("atendimento_conversation_participants")
          .delete()
          .eq("conversation_id", conversationId)
          .eq("profile_id", profileId)
      : await supabase
          .from("atendimento_conversation_participants")
          .insert({ conversation_id: conversationId, profile_id: profileId });
    if (error) void carregar();
  }

  const souParticipante = participantes.includes(currentUserId);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        title={`Participantes (${participantes.length})`}
        className={`p-1.5 rounded-md hover:bg-muted inline-flex items-center gap-1 ${
          souParticipante ? "text-arini dark:text-gold" : "text-muted-foreground"
        }`}
      >
        <Eye size={15} />
        {participantes.length > 0 && (
          <span className="text-[10px] font-medium">{participantes.length}</span>
        )}
      </button>

      {aberto && (
        <div className="absolute right-0 top-10 z-40 w-64 rounded-lg border bg-popover shadow-xl overflow-hidden">
          <div className="px-3 py-2 border-b">
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Participantes
            </div>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              Acompanham a conversa e recebem as menções, sem virar responsáveis.
            </p>
          </div>

          <button
            type="button"
            onClick={() => void alternar(currentUserId)}
            className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left border-b"
          >
            {souParticipante ? <X size={13} /> : <Plus size={13} />}
            <span className="flex-1">
              {souParticipante ? "Parar de acompanhar" : "Acompanhar esta conversa"}
            </span>
          </button>

          <div className="max-h-56 overflow-y-auto">
            {carregando && <div className="p-3 text-xs text-muted-foreground">Carregando…</div>}
            {!carregando && agents.length === 0 && (
              <div className="p-3 text-xs text-muted-foreground">Nenhum agente.</div>
            )}
            {agents.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => void alternar(a.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm hover:bg-muted text-left"
              >
                <span className="h-5 w-5 shrink-0 rounded-full bg-muted flex items-center justify-center text-[10px] font-semibold">
                  {a.nome.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate">{a.nome}</span>
                {participantes.includes(a.id) && (
                  <Check size={13} className="text-arini dark:text-gold shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
