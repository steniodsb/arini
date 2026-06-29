"use client";

import { useState } from "react";
import Link from "next/link";
import { LEAD_STAGES, type Lead, type LeadStage } from "@/lib/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { formatDateBR } from "@/lib/utils";
import { Phone, MessageCircle, Mail } from "lucide-react";

export function LeadsKanban({ initial }: { initial: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [dragging, setDragging] = useState<string | null>(null);

  async function moveTo(leadId: string, stage: LeadStage) {
    const previous = leads;
    setLeads((curr) => curr.map((l) => (l.id === leadId ? { ...l, stage, ultima_interacao_em: new Date().toISOString() } : l)));
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("leads")
      .update({ stage, ultima_interacao_em: new Date().toISOString() })
      .eq("id", leadId);
    if (error) {
      setLeads(previous);
      alert("Não foi possível mover: " + error.message);
      return;
    }
    await supabase.from("lead_interactions").insert({
      lead_id: leadId,
      tipo: "stage_change",
      conteudo: `Movido para "${stage}"`,
      user_id: user?.id,
    });
  }

  return (
    <div className="overflow-x-auto pb-2">
      <div className="flex gap-3 min-w-max">
        {LEAD_STAGES.map((col) => {
          const items = leads.filter((l) => l.stage === col.key);
          return (
            <div
              key={col.key}
              className="w-72 flex-shrink-0 bg-muted/40 rounded-lg p-3 border"
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => { if (dragging) { moveTo(dragging, col.key); setDragging(null); } }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${col.color}`} />
                  <h3 className="font-semibold text-arini text-sm">{col.label}</h3>
                </div>
                <span className="text-xs text-muted-foreground">{items.length}</span>
              </div>
              <div className="space-y-2">
                {items.map((lead) => (
                  <div
                    key={lead.id}
                    draggable
                    onDragStart={() => setDragging(lead.id)}
                    className="bg-white rounded-md border p-3 shadow-sm cursor-move hover:border-gold transition-colors"
                  >
                    <Link href={`/admin/leads/${lead.id}`} className="block">
                      <div className="font-medium text-arini text-sm">{lead.nome}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">{lead.origem}</div>
                      <div className="flex items-center gap-3 mt-2 text-muted-foreground text-xs">
                        {lead.whatsapp && <MessageCircle size={12} />}
                        {lead.telefone && <Phone size={12} />}
                        {lead.email && <Mail size={12} />}
                      </div>
                      <div className="text-[10px] text-muted-foreground mt-2">
                        {formatDateBR(lead.ultima_interacao_em)}
                      </div>
                    </Link>
                  </div>
                ))}
                {items.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 italic py-4 text-center">Vazio</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
