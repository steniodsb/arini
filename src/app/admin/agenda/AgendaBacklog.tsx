"use client";

/**
 * =====================================================================
 * AgendaBacklog — painel lateral dos compromissos SEM data.
 * =====================================================================
 *
 * É o fluxo central da referência que o cliente mandou: o que ainda não
 * tem data mora aqui, e agendar é arrastar daqui para o calendário.
 * Arrastar de volta para cá remove a data (quem trata esse destino é o
 * `AgendaShell`, dono do `DndContext` — ver o cabeçalho daquele arquivo).
 *
 * Os cartões são `useDraggable` puro, sem `useSortable`: a ordem dentro do
 * painel não significa nada para o usuário (é uma caixa de entrada, não
 * uma fila), e sortable aqui só custaria complexidade.
 */

import { useMemo, useState } from "react";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import {
  AGENDA_STATUS_LABELS,
  AGENDA_STATUS_ORDEM,
  AGENDA_TIPO_LABELS,
  SECTOR_LABELS,
  type AgendaItem,
  type AgendaStatus,
  type AgendaTipo,
  type Sector,
} from "@/lib/types";
import { Select } from "@/components/ui/select";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronRight,
  FileSignature,
  Home,
  Inbox,
  MessageCircle,
  PanelRightClose,
  PanelRightOpen,
  Phone,
  Plus,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";
import { ID_BACKLOG, corDoItem, formatarFaixaDatas, iniciais, type Agente } from "./shared";

const TIPO_ICONE: Record<AgendaTipo, LucideIcon> = {
  visita: Home,
  reuniao: Users,
  ligacao: Phone,
  retorno: MessageCircle,
  assinatura: FileSignature,
  gravacao: Video,
  outro: CalendarIcon,
};

const SETORES: Sector[] = [
  "captacao", "marketing", "administrativo", "juridico",
  "financeiro", "recepcao", "aluguel", "admin_central",
];

const TIPOS = Object.keys(AGENDA_TIPO_LABELS) as AgendaTipo[];

export function AgendaBacklog({
  itens,
  agentes,
  aberto,
  onAlternar,
  onAbrir,
  onNovo,
}: {
  /** Só itens SEM data — a casca já separou. */
  itens: AgendaItem[];
  agentes: Agente[];
  aberto: boolean;
  onAlternar: () => void;
  onAbrir?: (item: AgendaItem) => void;
  onNovo: () => void;
}) {
  // Filtros locais do painel (independentes dos filtros globais da casca:
  // aqui o usuário costuma querer "só o que é meu", sem mexer no calendário).
  const [setor, setSetor] = useState("");
  const [quem, setQuem] = useState(""); // "r:<id>" (responsável) ou "t:<tipo>"
  const [fechadas, setFechadas] = useState<Set<AgendaStatus>>(new Set());

  const filtrados = useMemo(() => {
    return itens.filter((i) => {
      if (setor && i.setor_destino !== setor && i.criado_por_sector !== setor) return false;
      if (quem.startsWith("r:")) {
        const id = quem.slice(2);
        if (id === "__sem__" ? i.responsavel_id !== null : i.responsavel_id !== id) return false;
      } else if (quem.startsWith("t:")) {
        if (i.tipo !== quem.slice(2)) return false;
      }
      return true;
    });
  }, [itens, setor, quem]);

  const secoes = useMemo(() => {
    return AGENDA_STATUS_ORDEM.map((status) => ({
      status,
      itens: filtrados.filter((i) => i.status === status),
    })).filter((s) => s.itens.length > 0);
  }, [filtrados]);

  // O painel inteiro é a zona de soltura. Continua ativa mesmo recolhido,
  // para dar onde soltar sem obrigar o usuário a reabrir no meio do arraste.
  const { setNodeRef, isOver } = useDroppable({ id: ID_BACKLOG });

  if (!aberto) {
    return (
      <div
        ref={setNodeRef}
        className={`hidden lg:flex w-12 shrink-0 flex-col items-center gap-2 rounded-xl border py-3 transition-colors ${
          isOver ? "bg-gold/10 border-gold" : "bg-card"
        }`}
      >
        <button
          onClick={onAlternar}
          title="Expandir painel de não agendados"
          className="text-muted-foreground hover:text-arini"
        >
          <PanelRightOpen size={18} />
        </button>
        <Inbox size={16} className="text-muted-foreground" />
        <span className="text-xs font-semibold text-arini tabular-nums">{itens.length}</span>
        <span className="text-[10px] text-muted-foreground [writing-mode:vertical-rl] mt-1">
          Não agendados
        </span>
      </div>
    );
  }

  return (
    <div
      ref={setNodeRef}
      className={`w-full lg:w-[290px] shrink-0 rounded-xl border transition-colors ${
        isOver ? "bg-gold/10 border-gold" : "bg-card"
      }`}
    >
      <div className="flex items-center justify-between gap-2 px-3 pt-3 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          <Inbox size={16} className="text-muted-foreground shrink-0" />
          <h3 className="text-sm font-semibold text-arini truncate">Não agendados</h3>
          <span className="text-xs text-muted-foreground tabular-nums">{filtrados.length}</span>
        </div>
        <button
          onClick={onAlternar}
          title="Recolher painel"
          className="text-muted-foreground hover:text-arini shrink-0"
        >
          <PanelRightClose size={16} />
        </button>
      </div>

      {/* Dois seletores, como na referência */}
      <div className="px-3 pb-2 grid grid-cols-2 gap-1.5">
        <Select
          value={setor}
          onChange={(e) => setSetor(e.target.value)}
          className="h-8 text-xs px-2"
        >
          <option value="">Todo setor</option>
          {SETORES.map((s) => (
            <option key={s} value={s}>
              {SECTOR_LABELS[s]}
            </option>
          ))}
        </Select>
        <Select value={quem} onChange={(e) => setQuem(e.target.value)} className="h-8 text-xs px-2">
          <option value="">Todos</option>
          <optgroup label="Responsável">
            <option value="r:__sem__">Sem responsável</option>
            {agentes.map((a) => (
              <option key={a.id} value={`r:${a.id}`}>
                {a.nome}
              </option>
            ))}
          </optgroup>
          <optgroup label="Tipo">
            {TIPOS.map((t) => (
              <option key={t} value={`t:${t}`}>
                {AGENDA_TIPO_LABELS[t]}
              </option>
            ))}
          </optgroup>
        </Select>
      </div>

      <div className="px-2 pb-2 space-y-2 max-h-[60vh] overflow-y-auto">
        {secoes.length === 0 && (
          <div className="px-2 py-8 text-center">
            <Inbox className="mx-auto text-muted-foreground/40" size={24} />
            <p className="mt-2 text-xs text-muted-foreground">
              {itens.length === 0
                ? "Nada esperando data. Crie um compromisso sem data para deixá-lo aqui até decidir quando."
                : "Nenhum item com esses filtros."}
            </p>
          </div>
        )}

        {secoes.map((secao) => {
          const recolhida = fechadas.has(secao.status);
          return (
            <div key={secao.status}>
              <button
                onClick={() =>
                  setFechadas((curr) => {
                    const proximo = new Set(curr);
                    if (proximo.has(secao.status)) proximo.delete(secao.status);
                    else proximo.add(secao.status);
                    return proximo;
                  })
                }
                className="w-full flex items-center gap-1 px-1 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:text-arini"
              >
                {recolhida ? <ChevronRight size={13} /> : <ChevronDown size={13} />}
                {AGENDA_STATUS_LABELS[secao.status]}
                <span className="ml-auto tabular-nums font-normal">{secao.itens.length}</span>
              </button>
              {!recolhida && (
                <div className="space-y-1.5 mt-1">
                  {secao.itens.map((item) => (
                    <CartaoBacklog
                      key={item.id}
                      item={item}
                      agentes={agentes}
                      onAbrir={onAbrir}
                    />
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <button
        onClick={onNovo}
        className="m-2 mt-0 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-muted hover:text-arini transition-colors"
      >
        <Plus size={14} /> Adicionar sem data
      </button>
    </div>
  );
}

function CartaoBacklog({
  item,
  agentes,
  onAbrir,
}: {
  item: AgendaItem;
  agentes: Agente[];
  onAbrir?: (item: AgendaItem) => void;
}) {
  // O mesmo formato de `data` do quadro: `{ item }`. É esse contrato que
  // permite o quadro entender um cartão que veio daqui.
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: item.id,
    data: { item },
  });

  const Icone = TIPO_ICONE[item.tipo] ?? CalendarIcon;
  const responsavel = item.responsavel_id
    ? agentes.find((a) => a.id === item.responsavel_id) ?? null
    : null;
  const faixa = formatarFaixaDatas(item);

  return (
    <div
      ref={setNodeRef}
      style={
        transform
          ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)`, zIndex: 50 }
          : undefined
      }
      {...listeners}
      {...attributes}
      onClick={() => onAbrir?.(item)}
      className={`rounded-lg border border-slate-200 bg-white shadow-sm overflow-hidden cursor-grab active:cursor-grabbing touch-none hover:shadow-md transition-shadow ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="flex">
        <span className="w-1 shrink-0" style={{ backgroundColor: corDoItem(item) }} />
        <div className="flex-1 min-w-0 px-2 py-1.5">
          <div className="text-[12px] font-medium text-arini leading-snug line-clamp-2">
            {item.titulo}
          </div>
          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
            <Icone size={11} className="shrink-0" />
            {faixa && <span className="truncate">{faixa}</span>}
            {responsavel && (
              <span
                title={responsavel.nome}
                className="ml-auto h-4 w-4 shrink-0 grid place-items-center rounded-full bg-arini text-white text-[8px] font-semibold"
              >
                {iniciais(responsavel.nome)}
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
