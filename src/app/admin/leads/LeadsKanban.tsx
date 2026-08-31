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
import { Phone, MessageCircle, Mail, X } from "lucide-react";

// Quantos cartões cada coluna mostra antes do "ver mais".
//
// Existe porque o quadro abria os 300+ leads de uma vez ("tá abrindo tudo
// uma vez" — call de 21/08). Cada cartão é um `useDraggable`, ou seja um
// listener e um nó no contexto do dnd-kit: 300 cartões custam bem mais que
// 300 divs. O corte é POR COLUNA, não no total, senão uma etapa cheia
// engoliria a cota das outras e as colunas do fim apareceriam vazias.
const PAGINA = 10;

// Cartão arrastável de um lead. Usa @dnd-kit (ponteiro + toque) em vez do
// drag-and-drop nativo do HTML5 — que não funciona em telas de toque e
// conflitava com o <a> interno do cartão.
function LeadCard({
  lead,
  podeDescartar,
  onDescartar,
}: {
  lead: Lead;
  podeDescartar: boolean;
  onDescartar: (lead: Lead) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: lead.id });
  const style = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
    : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative bg-white rounded-md border p-3 shadow-sm hover:border-gold transition-colors ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {/*
        O arraste fica no CORPO, não no cartão inteiro. Com os listeners no
        elemento externo, o botão "não é lead" herdava o `touch-none` e o
        sensor de ponteiro — no toque ele virava início de arraste em vez de
        clique, e no mouse o clique só passava por acidente.
      */}
      <div {...listeners} {...attributes} className="cursor-grab active:cursor-grabbing touch-none">
        <CardBody lead={lead} />
      </div>

      {podeDescartar && (
        <button
          type="button"
          onClick={() => onDescartar(lead)}
          // Aparece no hover no mouse; no toque não existe hover, então fica
          // sempre visível em tela pequena — escondê-lo ali seria escondê-lo
          // para sempre.
          className="absolute top-1.5 right-1.5 p-1 rounded text-muted-foreground/50
                     hover:bg-red-50 hover:text-red-600 opacity-100 sm:opacity-0
                     sm:group-hover:opacity-100 transition-opacity"
          title="Não é lead — remover do funil"
          aria-label={`Marcar ${lead.nome} como "não é lead"`}
        >
          <X size={13} />
        </button>
      )}
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
      className={`w-72 flex-shrink-0 rounded-lg border flex flex-col transition-colors ${
        isOver ? "bg-gold/10 border-gold" : "bg-muted/40"
      }`}
    >
      {/*
        Cabeçalho sempre visível. É o que responde "não sei qual que é esse
        setor" (call de 21/08).

        Antes isto era `sticky top-0` e NÃO funcionava: o quadro inteiro vive
        dentro de um `overflow-x-auto`, e o CSS promove o eixo Y desse
        contêiner a `auto` junto. O grudento passa a se orientar por esse
        contêiner — que nunca rola na vertical, porque cresce com o conteúdo.
        Resultado: quem rolava era a PÁGINA, e o título subia junto e sumia
        (medido: rolando 600px o título ia para y=-169).

        A correção é dar rolagem de verdade a quem precisa: a lista de cartões
        tem altura máxima e rola sozinha, e o cabeçalho fica fora dela, como
        irmão de cima num flex. Aí ele não depende de `sticky` para nada.
      */}
      <div className="shrink-0 px-3 pt-3 pb-2 rounded-t-lg bg-muted/95 border-b border-black/5
                      flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full ${col.color}`} />
          <h3 className="font-semibold text-arini text-sm">{col.label}</h3>
        </div>
        <span className="text-xs text-muted-foreground">{count}</span>
      </div>
      {/* `overscroll-contain`: chegar ao fim da coluna não passa a rolagem
          para a página, senão a tela dá um salto no meio do arraste. */}
      <div className="p-3 space-y-2 min-h-[60px] max-h-[62vh] overflow-y-auto overscroll-contain">
        {children}
      </div>
    </div>
  );
}

export function LeadsKanban({
  initial,
  podeDescartar = false,
}: {
  initial: Lead[];
  /** Recepção e diretoria. O banco também barra — ver 0048_leads_descarte.sql. */
  podeDescartar?: boolean;
}) {
  const [leads, setLeads] = useState<Lead[]>(initial);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [visiveis, setVisiveis] = useState<Record<string, number>>({});

  const limite = (stage: string) => visiveis[stage] ?? PAGINA;
  const verMais = (stage: string) =>
    setVisiveis((v) => ({ ...v, [stage]: (v[stage] ?? PAGINA) + PAGINA }));

  async function descartar(lead: Lead) {
    if (!confirm(`Marcar "${lead.nome}" como não é lead?\n\nEle sai do funil, mas continua no banco — dá para reverter.`)) return;
    const previous = leads;
    setLeads((curr) => curr.filter((l) => l.id !== lead.id));
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("leads").update({ descartado: true }).eq("id", lead.id);
    if (error) {
      setLeads(previous);
      alert("Não foi possível descartar: " + error.message);
    }
  }

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
            const mostrados = items.slice(0, limite(col.key));
            const restantes = items.length - mostrados.length;
            return (
              // O contador do cabeçalho é o TOTAL da etapa, não o que está
              // desenhado: é o número que ele usa para ler o funil.
              <Column key={col.key} col={col} count={items.length}>
                {mostrados.map((lead) => (
                  <LeadCard
                    key={lead.id}
                    lead={lead}
                    podeDescartar={podeDescartar}
                    onDescartar={descartar}
                  />
                ))}
                {restantes > 0 && (
                  <button
                    type="button"
                    onClick={() => verMais(col.key)}
                    className="w-full text-xs text-arini/80 hover:text-arini hover:bg-white
                               border border-dashed rounded-md py-2 transition-colors"
                  >
                    Ver mais {Math.min(PAGINA, restantes)} de {restantes}
                  </button>
                )}
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
