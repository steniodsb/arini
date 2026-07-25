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
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { SECTOR_LABELS, type Sector } from "@/lib/types";
import {
  Calendar as CalendarIcon,
  Phone,
  MessageCircle,
  Home,
  FileSignature,
  Users,
  Video,
  Check,
  type LucideIcon,
} from "lucide-react";

const TIPO_ICON: Record<string, LucideIcon> = {
  visita: Home,
  reuniao: Users,
  ligacao: Phone,
  retorno: MessageCircle,
  assinatura: FileSignature,
  gravacao: Video,
};

const TIPO_BORDER: Record<string, string> = {
  visita: "border-l-purple-500",
  reuniao: "border-l-blue-500",
  ligacao: "border-l-amber-500",
  retorno: "border-l-pink-500",
  assinatura: "border-l-emerald-500",
  gravacao: "border-l-indigo-500",
  outro: "border-l-slate-400",
};

interface CardItem {
  id: string; // "evt:<uuid>" ou "apt:<uuid>" — prefixo identifica a tabela de origem
  kind: "event" | "appt";
  titulo: string;
  tipo: string;
  data_hora: string;
  confirmado: boolean;
  setorDestino?: Sector | null;
  leadId?: string;
}

interface DayCol {
  index: number;
  label: string;
  dayNum: number;
  isToday: boolean;
  isPast: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function CardBody({ item, overlay = false }: { item: CardItem; overlay?: boolean }) {
  const Icon = TIPO_ICON[item.tipo] ?? CalendarIcon;
  const time = new Date(item.data_hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const inner = (
    <>
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-mono text-muted-foreground">{time}</span>
        {item.confirmado && (
          <span className="text-emerald-600" title="Confirmado">
            <Check size={11} />
          </span>
        )}
      </div>
      <div className="text-[11px] font-medium text-arini truncate mt-0.5">{item.titulo}</div>
      <div className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
        <Icon size={10} /> {item.tipo}
        {item.setorDestino && <span className="truncate">→ {SECTOR_LABELS[item.setorDestino]}</span>}
      </div>
    </>
  );
  const className = `block p-2 rounded-md bg-white border border-l-2 shadow-sm transition-colors ${
    TIPO_BORDER[item.tipo] ?? "border-l-slate-400"
  } ${overlay ? "shadow-lg" : "hover:border-gold"}`;

  if (overlay) return <div className={className}>{inner}</div>;
  if (item.kind === "appt" && item.leadId) {
    return (
      <Link href={`/admin/leads/${item.leadId}`} className={className} draggable={false}>
        {inner}
      </Link>
    );
  }
  return <div className={className}>{inner}</div>;
}

// Cartão arrastável. Usa @dnd-kit (ponteiro + toque), igual ao kanban de leads,
// para funcionar em touch e não conflitar com o link interno do cartão.
function Card({ item }: { item: CardItem }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: item.id });
  const style = transform ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 } : undefined;
  return (
    <div
      ref={setNodeRef}
      style={style}
      {...listeners}
      {...attributes}
      className={`cursor-grab active:cursor-grabbing touch-none ${isDragging ? "opacity-40" : ""}`}
    >
      <CardBody item={item} />
    </div>
  );
}

function Column({ col, count, children }: { col: DayCol; count: number; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: col.index });
  return (
    <div
      ref={setNodeRef}
      className={`min-h-[220px] rounded-lg border p-2 transition-colors ${
        isOver ? "bg-gold/10 border-gold" : col.isToday ? "border-gold bg-gold/5" : col.isPast ? "bg-muted/30" : "bg-white"
      }`}
    >
      <div className="flex items-center justify-between pb-2 border-b">
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{col.label}</div>
          <div className={`text-lg font-semibold ${col.isToday ? "text-gold-dark" : "text-arini"}`}>{col.dayNum}</div>
        </div>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      <div className="mt-2 space-y-1.5">
        {children}
        {count === 0 && <div className="text-[10px] text-muted-foreground/60 italic text-center py-4">Vazio</div>}
      </div>
    </div>
  );
}

export function AgendaKanban({
  weekStart,
  dayLabels,
  initialAppointments,
  initialEvents,
}: {
  weekStart: string; // ISO — início (00:00) da semana exibida, mesmo instante usado no filtro do servidor
  dayLabels: { label: string; dayNum: number }[]; // 7 entradas, formatadas no servidor (weekday + dia)
  initialAppointments: { id: string; lead_id: string; tipo: string; data_hora: string; confirmado: boolean; leads: { nome: string } | null }[];
  initialEvents: { id: string; titulo: string; tipo: string; data_hora: string; confirmado: boolean; setor_destino: Sector | null }[];
}) {
  const [items, setItems] = useState<CardItem[]>(() => [
    ...initialEvents.map((e) => ({
      id: `evt:${e.id}`,
      kind: "event" as const,
      titulo: e.titulo,
      tipo: e.tipo,
      data_hora: e.data_hora,
      confirmado: e.confirmado,
      setorDestino: e.setor_destino,
    })),
    ...initialAppointments.map((a) => ({
      id: `apt:${a.id}`,
      kind: "appt" as const,
      titulo: a.leads?.nome ?? "Lead",
      tipo: a.tipo,
      data_hora: a.data_hora,
      confirmado: a.confirmado,
      leadId: a.lead_id,
    })),
  ]);
  const [activeId, setActiveId] = useState<string | null>(null);

  // Ponteiro para mouse (arrasta após 6px) e toque com long-press (200ms) para
  // não conflitar com o scroll horizontal do board nem com o clique no cartão.
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  // Índice do dia (0-6) de um instante, relativo ao início da semana exibida —
  // aritmética pura em ms, sem reinterpretar o instante no fuso do navegador
  // (evita desalinhar cartão x coluna quando servidor e cliente têm TZ diferentes).
  const weekStartMs = new Date(weekStart).getTime();
  const dayIndexOf = (iso: string) => Math.floor((new Date(iso).getTime() - weekStartMs) / DAY_MS);
  const todayIndex = Math.floor((Date.now() - weekStartMs) / DAY_MS);

  const cols: DayCol[] = dayLabels.map((dl, index) => ({
    index,
    label: dl.label,
    dayNum: dl.dayNum,
    isToday: index === todayIndex,
    isPast: index < todayIndex,
  }));

  async function moveTo(itemId: string, targetIndex: number) {
    const item = items.find((i) => i.id === itemId);
    if (!item) return;
    const origIndex = dayIndexOf(item.data_hora);
    if (origIndex === targetIndex) return;

    const nextIso = new Date(new Date(item.data_hora).getTime() + (targetIndex - origIndex) * DAY_MS).toISOString();

    const previous = items;
    setItems((curr) => curr.map((i) => (i.id === itemId ? { ...i, data_hora: nextIso } : i)));

    const supabase = createSupabaseBrowser();
    const table = item.kind === "event" ? "agenda_events" : "lead_appointments";
    const rawId = itemId.slice(itemId.indexOf(":") + 1);
    const { error } = await supabase.from(table).update({ data_hora: nextIso }).eq("id", rawId);
    if (error) {
      setItems(previous);
      alert("Não foi possível mover: " + error.message);
    }
  }

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setActiveId(null);
    const { active, over } = e;
    if (!over) return;
    moveTo(String(active.id), Number(over.id));
  }

  const activeItem = activeId ? items.find((i) => i.id === activeId) ?? null : null;

  return (
    <DndContext sensors={sensors} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setActiveId(null)}>
      <div className="overflow-x-auto pb-2">
        <div className="grid grid-cols-7 gap-3 min-w-[980px]">
          {cols.map((col) => {
            const dayItems = items
              .filter((i) => dayIndexOf(i.data_hora) === col.index)
              .sort((a, b) => a.data_hora.localeCompare(b.data_hora));
            return (
              <Column key={col.index} col={col} count={dayItems.length}>
                {dayItems.map((item) => (
                  <Card key={item.id} item={item} />
                ))}
              </Column>
            );
          })}
        </div>
      </div>
      <DragOverlay>{activeItem ? <div className="w-56 rotate-2"><CardBody item={activeItem} overlay /></div> : null}</DragOverlay>
    </DndContext>
  );
}
