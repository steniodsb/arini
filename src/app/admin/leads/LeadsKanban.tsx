"use client";

import { useState } from "react";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  useDraggable,
  useDroppable,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { LEAD_STAGES, type Lead, type LeadStage } from "@/lib/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { formatDateBR } from "@/lib/utils";
import { Phone, MessageCircle, Mail } from "lucide-react";

// Cartão arrastável de um lead. Usa @dnd-kit (ponteiro + toque) em vez do
// drag-and-drop nativo do HTML5 — que não funciona em telas de toque e
// conflitava com o <a> interno do cartão.
function LeadCard({ lead }: { lead: Lead }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`bg-white rounded-md border p-3 shadow-sm cursor-grab active:cursor-grabbing hover:border-gold transition-colors touch-none ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <CardBody lead={lead} />
    </div>
  );
}

// Conteúdo do cartão. O link só navega em clique "limpo" (sem arraste): o
// sensor exige um pequeno deslocamento antes de iniciar o drag, então o clique
// comum continua abrindo o lead.
function CardBody({ lead, overlay = false }: { lead: Lead; overlay?: boolean }) {
  const inner = (
    <>
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
    </>
  );
  if (overlay) return <div>{inner}</div>;
  return (
    <Link href={`/admin/leads/${lead.id}`} className="block" draggable={false}>
      {inner}
    </Link>
  );
}

// Coluna que recebe o cartão solto.
function Column({ col, count, children }: { col: (typeof LEAD_STAGES)[number]; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.key });
  return (
    <div
      ref={setNodeRef}
      className={`w-72 flex-shrink-0 rounded-lg p-3 border transition-colors ${
        isOver ? "bg-gold/10 border-gold" : "bg-muted/40"
      }`}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${col.color}`} />
          <h3 className="font-semibold text-arini text-sm">{col.label}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="space-y-2 min-h-[60px]">{children}</div>
    </div>
  );
}

export function LeadsKanban({ initial }: { initial: Lead[] }) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Ponteiro para mouse (arrasta após 6px) e toque com long-press (200ms) para
  // não conflitar com o scroll horizontal do quadro nem com o toque/clique.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  async function moveTo(leadId: string, stage: LeadStage) {
    const previous = leads;
    const lead = leads.find((l) => l.id === leadId);
    if (!lead || lead.stage === stage) return;
    setLeads((curr) =>
      curr.map((l) => (l.id === leadId ? { ...l, stage, ultima_interacao_em: new Date().toISOString() } : l)),
    );
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

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    moveTo(String(active.id), over.id as LeadStage);
  }

  const activeLead = activeId ? leads.find((l) => l.id === activeId) ?? null : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="overflow-x-auto pb-2">
        <div className="flex gap-3 min-w-max">
          {LEAD_STAGES.map((col) => {
            const items = leads.filter((l) => l.stage === col.key);
            return (
              <Column key={col.key} col={col} count={items.length}>
                {items.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
                {items.length === 0 && (
                  <div className="text-xs text-muted-foreground/60 italic py-4 text-center">Vazio</div>
                )}
              </Column>
            );
          })}
        </div>
      </div>
      <DragOverlay>
        {activeLead ? (
          <div className="bg-white rounded-md border border-gold p-3 shadow-lg w-72 rotate-2">
            <CardBody lead={activeLead} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  );
}
