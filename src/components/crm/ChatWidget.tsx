"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { SECTOR_LABELS, type Sector, type SectorObservation } from "@/lib/types";
import { MessageCircle, Send, X } from "lucide-react";

const TARGET_SECTORS: Sector[] = [
  "captacao", "marketing", "administrativo", "juridico", "financeiro", "recepcao", "admin_central",
];

/**
 * Chat flutuante de comunicação entre setores — presente em todas as telas
 * do admin. Mostra as mensagens recebidas pelo setor e permite enviar
 * rapidamente para outro setor (mesma base da página Comunicação).
 */
export function ChatWidget({ userId, sector }: { userId: string; sector: Sector }) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<SectorObservation[]>([]);
  const [unread, setUnread] = useState(0);
  const [texto, setTexto] = useState("");
  const [target, setTarget] = useState<Sector>(sector === "administrativo" ? "admin_central" : "administrativo");
  const [busy, setBusy] = useState(false);

  async function load() {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("sector_observations")
      .select("*")
      .eq("target_sector", sector)
      .order("created_at", { ascending: false })
      .limit(15);
    const list = (data ?? []) as SectorObservation[];
    setItems(list);
    setUnread(list.filter((o) => !o.resolvido).length);
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector]);

  async function send() {
    if (!texto.trim()) return;
    setBusy(true);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("sector_observations").insert({
      entity_table: "comunicacao",
      entity_id: userId,
      target_sector: target,
      autor_id: userId,
      autor_sector: sector,
      texto: texto.trim(),
    });
    setBusy(false);
    if (!error) setTexto("");
  }

  return (
    <>
      {/* Botão flutuante */}
      <button
        type="button"
        onClick={() => { setOpen((v) => !v); if (!open) load(); }}
        className="fixed bottom-6 right-6 z-40 w-14 h-14 rounded-full bg-arini text-white shadow-xl hover:scale-105 transition flex items-center justify-center"
        title="Comunicação entre setores"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
        {!open && unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1 rounded-full bg-gold-dark text-arini text-[11px] font-bold flex items-center justify-center">
            {unread}
          </span>
        )}
      </button>

      {/* Painel */}
      {open && (
        <div className="fixed bottom-24 right-6 z-40 w-[340px] max-h-[70vh] bg-white rounded-xl shadow-2xl border flex flex-col overflow-hidden">
          <div className="p-3 bg-arini text-white flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2"><MessageCircle size={16} /> Comunicação</span>
            <Link href="/admin/comunicacao" className="text-[11px] text-white/70 hover:text-white">ver tudo →</Link>
          </div>

          <div className="p-3 border-b space-y-2">
            <Textarea rows={2} value={texto} onChange={(e) => setTexto(e.target.value)} placeholder="Mensagem rápida…" className="text-sm" />
            <div className="flex items-center gap-2">
              <Select value={target} onChange={(e) => setTarget(e.target.value as Sector)} className="h-8 text-xs flex-1">
                {TARGET_SECTORS.filter((s) => s !== sector).map((s) => (
                  <option key={s} value={s}>{SECTOR_LABELS[s]}</option>
                ))}
              </Select>
              <Button type="button" size="sm" variant="gold" onClick={send} disabled={busy || !texto.trim()}>
                <Send size={13} />
              </Button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {items.length === 0 && <p className="text-xs text-muted-foreground text-center py-4">Nenhuma mensagem para o seu setor.</p>}
            {items.map((o) => (
              <div key={o.id} className={`rounded-md border p-2 text-xs ${o.resolvido ? "opacity-60" : ""}`}>
                <div className="flex items-center justify-between mb-1">
                  {o.autor_sector && <Badge variant="outline">{SECTOR_LABELS[o.autor_sector]}</Badge>}
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(o.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" })}
                  </span>
                </div>
                <div className="whitespace-pre-line">{o.texto}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );
}
