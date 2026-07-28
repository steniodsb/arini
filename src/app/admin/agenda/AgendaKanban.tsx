"use client";

/**
 * =====================================================================
 * AgendaKanban — quadro estilo Trello.
 * =====================================================================
 *
 * A versão anterior era uma grade fixa de 7 dias com cartõezinhos, e o
 * cliente disse com todas as letras que "não parece Trello". O que faz um
 * quadro parecer Trello não é o arrastar entre colunas — é o conjunto:
 * listas de largura fixa com fundo cinza e rolagem própria, rolagem
 * horizontal do quadro, cartão branco com etiqueta colorida, "+ Adicionar
 * cartão" no rodapé de cada lista e, principalmente, ORDENAÇÃO MANUAL
 * dentro da lista. Tudo isso está aqui.
 *
 * O `DndContext` NÃO fica neste arquivo: ele vive no `AgendaShell`, para
 * que o arraste possa atravessar a fronteira entre o quadro e o painel de
 * não agendados. Este componente se pendura no contexto do pai com
 * `useDndMonitor` e trata só os destinos que são dele.
 */

import { useMemo } from "react";
import { useDndMonitor, useDroppable } from "@dnd-kit/core";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import {
  AGENDA_AGRUPAMENTO_LABELS,
  AGENDA_STATUS_LABELS,
  AGENDA_STATUS_ORDEM,
  AGENDA_TIPO_COR,
  AGENDA_TIPO_LABELS,
  SECTOR_LABELS,
  type AgendaAgrupamento,
  type AgendaItem,
  type AgendaStatus,
  type AgendaTipo,
  type Sector,
} from "@/lib/types";
import { Select } from "@/components/ui/select";
import { Building2, Clock, MapPin, Plus, Timer } from "lucide-react";
import {
  ID_BACKLOG,
  chaveDia,
  corDoItem,
  dataDaChave,
  diasEntre,
  formatarDiaCurto,
  formatarDiaSemanaCurto,
  formatarDuracao,
  formatarHora,
  iniciais,
  somarDias,
  type Agente,
  type PrefillCartao,
  type VistaProps,
} from "./shared";

/** Estrutural de propósito: evita import circular com o AgendaShell. */
type Mudanca = { item: AgendaItem; patch: Partial<AgendaItem> };

/** Dados que todo arrastável da agenda carrega — o contrato do dnd. */
interface DadosArraste {
  item?: AgendaItem;
  colId?: string;
}

const CHAVE_SEM = "__sem__";
const HORA_PADRAO = 9; // 09:00 — hora comercial de referência da imobiliária

/** Cor do pontinho da coluna quando o quadro agrupa por status. */
const COR_STATUS: Record<AgendaStatus, string> = {
  agendado: "#64748b",
  confirmado: "#0ea5e9",
  concluido: "#10b981",
  cancelado: "#ef4444",
  nao_compareceu: "#f59e0b",
};

const SETORES: Sector[] = [
  "captacao", "marketing", "administrativo", "juridico",
  "financeiro", "recepcao", "aluguel", "admin_central",
];

const TIPOS = Object.keys(AGENDA_TIPO_LABELS) as AgendaTipo[];

interface Coluna {
  /** Id do droppable. Prefixado para nunca colidir com id de cartão. */
  id: string;
  chave: string;
  titulo: string;
  subtitulo?: string;
  cor?: string;
  hoje?: boolean;
}

export interface AgendaKanbanProps extends VistaProps {
  agrupamento: AgendaAgrupamento;
  onAgrupamento: (a: AgendaAgrupamento) => void;
  /** Grava um lote de alterações (coluna + ordem) de uma vez só. */
  onAplicar: (mudancas: Mudanca[]) => void;
  onNovo: (prefill: PrefillCartao) => void;
}

// =====================================================================

export function AgendaKanban({
  itens,
  inicio,
  fim,
  agentes,
  agrupamento,
  onAgrupamento,
  onAplicar,
  onNovo,
  onAbrir,
}: AgendaKanbanProps) {
  const hojeChave = chaveDia(new Date());

  const colunas = useMemo<Coluna[]>(() => {
    switch (agrupamento) {
      case "dia": {
        const de = new Date(inicio);
        const total = Math.max(1, diasEntre(de, new Date(new Date(fim).getTime() - 1)) + 1);
        return Array.from({ length: total }, (_, i) => {
          const dia = somarDias(de, i);
          const chave = chaveDia(dia);
          return {
            id: `col:${chave}`,
            chave,
            titulo: formatarDiaSemanaCurto(dia),
            subtitulo: formatarDiaCurto(dia),
            hoje: chave === hojeChave,
          };
        });
      }
      case "status":
        return AGENDA_STATUS_ORDEM.map((s) => ({
          id: `col:${s}`,
          chave: s,
          titulo: AGENDA_STATUS_LABELS[s],
          cor: COR_STATUS[s],
        }));
      case "tipo":
        return TIPOS.map((t) => ({
          id: `col:${t}`,
          chave: t,
          titulo: AGENDA_TIPO_LABELS[t],
          cor: AGENDA_TIPO_COR[t],
        }));
      case "setor":
        return [
          ...SETORES.map((s) => ({ id: `col:${s}`, chave: s, titulo: SECTOR_LABELS[s] })),
          { id: `col:${CHAVE_SEM}`, chave: CHAVE_SEM, titulo: "Sem setor" },
        ];
      case "responsavel":
        return [
          ...agentes.map((a) => ({ id: `col:${a.id}`, chave: a.id, titulo: a.nome })),
          { id: `col:${CHAVE_SEM}`, chave: CHAVE_SEM, titulo: "Sem responsável" },
        ];
    }
  }, [agrupamento, inicio, fim, agentes, hojeChave]);

  /** A que coluna um item pertence, no agrupamento atual. */
  const chaveDoItem = useMemo(() => {
    return (item: AgendaItem): string => {
      switch (agrupamento) {
        case "dia":
          return item.data_hora ? chaveDia(item.data_hora) : CHAVE_SEM;
        case "status":
          return item.status;
        case "tipo":
          return item.tipo;
        case "setor":
          return item.setor_destino ?? CHAVE_SEM;
        case "responsavel":
          return item.responsavel_id ?? CHAVE_SEM;
      }
    };
  }, [agrupamento]);

  /** Itens de cada coluna, já na ordem manual (`ordem`) com desempate por hora. */
  const porColuna = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    for (const col of colunas) mapa.set(col.chave, []);
    for (const item of itens) {
      const lista = mapa.get(chaveDoItem(item));
      if (lista) lista.push(item);
    }
    for (const lista of mapa.values()) {
      lista.sort(
        (a, b) => a.ordem - b.ordem || (a.data_hora ?? "").localeCompare(b.data_hora ?? ""),
      );
    }
    return mapa;
  }, [colunas, itens, chaveDoItem]);

  const porId = useMemo(() => new Map(itens.map((i) => [i.id, i])), [itens]);

  /**
   * Instante padrão para um item que chega SEM data (vindo do painel
   * lateral) numa coluna que não é de dia. Sem isto, o cartão mudaria de
   * status mas continuaria invisível no quadro — o usuário veria o item
   * "sumir" ao soltar.
   */
  function instantePadrao(): string {
    const agora = new Date();
    const dentro = agora >= new Date(inicio) && agora < new Date(fim);
    const base = dentro ? agora : new Date(inicio);
    return new Date(
      base.getFullYear(), base.getMonth(), base.getDate(), HORA_PADRAO, 0, 0, 0,
    ).toISOString();
  }

  /** O que muda no item quando ele cai numa coluna. */
  function patchDaColuna(item: AgendaItem, coluna: Coluna): Partial<AgendaItem> {
    if (agrupamento === "dia") {
      if (coluna.chave === CHAVE_SEM) return {};
      const destino = dataDaChave(coluna.chave);
      if (!item.data_hora) {
        // Veio do backlog: nasce às 09h do dia da coluna.
        return {
          data_hora: new Date(
            destino.getFullYear(), destino.getMonth(), destino.getDate(), HORA_PADRAO, 0, 0, 0,
          ).toISOString(),
        };
      }
      // Preserva a hora do relógio: soma a diferença de dias em ms sobre o
      // timestamp, sem reinterpretar o instante no fuso do navegador.
      const delta = diasEntre(item.data_hora, destino);
      if (delta === 0) return {};
      return { data_hora: somarDias(item.data_hora, delta).toISOString() };
    }

    // Colunas que não são de dia: o campo correspondente muda, e um item
    // sem data ganha uma para poder aparecer no quadro.
    const extra: Partial<AgendaItem> = item.data_hora ? {} : { data_hora: instantePadrao() };

    switch (agrupamento) {
      case "status":
        return { ...extra, status: coluna.chave as AgendaStatus };
      case "tipo":
        return { ...extra, tipo: coluna.chave as AgendaTipo };
      case "setor":
        return {
          ...extra,
          setor_destino: coluna.chave === CHAVE_SEM ? null : (coluna.chave as Sector),
        };
      case "responsavel":
        return {
          ...extra,
          responsavel_id: coluna.chave === CHAVE_SEM ? null : coluna.chave,
        };
      default:
        return extra;
    }
  }

  // -----------------------------------------------------------------
  // Arraste — só os destinos deste quadro
  // -----------------------------------------------------------------

  useDndMonitor({
    onDragEnd(evento) {
      const { active, over } = evento;
      if (!over) return;
      const overId = String(over.id);
      if (overId === ID_BACKLOG) return; // destino da casca, não nosso

      const dadosAtivo = active.data.current as DadosArraste | undefined;
      const item = dadosAtivo?.item;
      if (!item) return;

      // Destino: a própria coluna, ou a coluna do cartão sob o cursor.
      const dadosOver = over.data.current as DadosArraste | undefined;
      const colunaId = colunas.some((c) => c.id === overId) ? overId : dadosOver?.colId;
      const coluna = colunas.find((c) => c.id === colunaId);
      if (!coluna) return;

      const atuais = (porColuna.get(coluna.chave) ?? []).filter((i) => i.id !== item.id);
      const posicaoAlvo = atuais.findIndex((i) => i.id === overId);
      const destino = [...atuais];
      destino.splice(posicaoAlvo >= 0 ? posicaoAlvo : destino.length, 0, item);

      const patchColuna = patchDaColuna(item, coluna);
      const mudancas: Mudanca[] = [];

      destino.forEach((atual, indice) => {
        const alvo = atual.id === item.id ? item : porId.get(atual.id) ?? atual;
        const patch: Partial<AgendaItem> = alvo.id === item.id ? { ...patchColuna } : {};
        // A ordem manual é metade do que faz um Trello parecer Trello.
        if (alvo.ordem !== indice) patch.ordem = indice;
        if (Object.keys(patch).length > 0) mudancas.push({ item: alvo, patch });
      });

      onAplicar(mudancas);
    },
  });

  // -----------------------------------------------------------------

  function prefillDaColuna(coluna: Coluna): PrefillCartao {
    const hora = `T${String(HORA_PADRAO).padStart(2, "0")}:00`;
    if (agrupamento === "dia") return { data: `${coluna.chave}${hora}` };

    const padrao = instantePadrao();
    const data = `${chaveDia(padrao)}${hora}`;
    switch (agrupamento) {
      case "status":
        return { data, status: coluna.chave as AgendaStatus };
      case "tipo":
        return { data, tipo: coluna.chave as AgendaTipo };
      case "setor":
        return { data, setor: coluna.chave === CHAVE_SEM ? null : (coluna.chave as Sector) };
      case "responsavel":
        return { data, responsavelId: coluna.chave === CHAVE_SEM ? null : coluna.chave };
      default:
        return { data };
    }
  }

  return (
    <div className="space-y-2">
      {/* Agrupamento — o seletor fica no quadro, é uma decisão do quadro. */}
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Agrupar por</span>
        <Select
          value={agrupamento}
          onChange={(e) => onAgrupamento(e.target.value as AgendaAgrupamento)}
          className="h-8 w-44 text-xs"
        >
          {(Object.keys(AGENDA_AGRUPAMENTO_LABELS) as AgendaAgrupamento[]).map((a) => (
            <option key={a} value={a}>
              {AGENDA_AGRUPAMENTO_LABELS[a]}
            </option>
          ))}
        </Select>
      </div>

      <div className="overflow-x-auto pb-3">
        <div className="flex gap-3 items-start min-w-max">
          {colunas.map((coluna) => (
            <ColunaQuadro
              key={coluna.id}
              coluna={coluna}
              itens={porColuna.get(coluna.chave) ?? []}
              agentes={agentes}
              onAbrir={onAbrir}
              onNovo={() => onNovo(prefillDaColuna(coluna))}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Coluna — a "lista" do Trello: largura fixa, fundo cinza, rolagem própria
// =====================================================================

function ColunaQuadro({
  coluna,
  itens,
  agentes,
  onAbrir,
  onNovo,
}: {
  coluna: Coluna;
  itens: AgendaItem[];
  agentes: Agente[];
  onAbrir?: (item: AgendaItem) => void;
  onNovo: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({
    id: coluna.id,
    data: { colId: coluna.id } satisfies DadosArraste,
  });

  return (
    <div
      ref={setNodeRef}
      className={`w-[272px] shrink-0 flex flex-col rounded-xl border transition-colors ${
        isOver
          ? "bg-gold/10 border-gold"
          : coluna.hoje
            ? "bg-gold/5 border-gold/40"
            : "bg-slate-100 border-slate-200"
      }`}
    >
      {/* Cabeçalho */}
      <div className="flex items-center justify-between gap-2 px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-2 min-w-0">
          {coluna.cor && (
            <span
              className="h-2.5 w-2.5 rounded-full shrink-0"
              style={{ backgroundColor: coluna.cor }}
            />
          )}
          <h3
            className={`text-sm font-semibold truncate ${coluna.hoje ? "text-gold-dark" : "text-arini"}`}
          >
            {coluna.titulo}
          </h3>
          {coluna.subtitulo && (
            <span className="text-xs text-muted-foreground shrink-0">{coluna.subtitulo}</span>
          )}
        </div>
        <span className="text-xs text-muted-foreground tabular-nums shrink-0">{itens.length}</span>
      </div>

      {/* Cartões — rolagem dentro da coluna, como no Trello */}
      <div className="px-2 flex-1 overflow-y-auto max-h-[58vh] space-y-2 min-h-[52px]">
        <SortableContext
          id={coluna.id}
          items={itens.map((i) => i.id)}
          strategy={verticalListSortingStrategy}
        >
          {itens.map((item) => (
            <Cartao
              key={item.id}
              item={item}
              colId={coluna.id}
              agentes={agentes}
              onAbrir={onAbrir}
            />
          ))}
        </SortableContext>
        {itens.length === 0 && (
          <p className="text-[11px] text-muted-foreground/60 italic text-center py-4">
            Nada aqui
          </p>
        )}
      </div>

      {/* Rodapé */}
      <button
        onClick={onNovo}
        className="m-2 mt-1 flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted-foreground hover:bg-slate-200/70 hover:text-arini transition-colors"
      >
        <Plus size={14} /> Adicionar cartão
      </button>
    </div>
  );
}

// =====================================================================
// Cartão
// =====================================================================

function Cartao({
  item,
  colId,
  agentes,
  onAbrir,
}: {
  item: AgendaItem;
  colId: string;
  agentes: Agente[];
  onAbrir?: (item: AgendaItem) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: item.id,
    data: { item, colId } satisfies DadosArraste,
  });

  const responsavel = item.responsavel_id
    ? agentes.find((a) => a.id === item.responsavel_id) ?? null
    : null;

  return (
    <div
      ref={setNodeRef}
      style={{
        // translate3d escrito à mão para não depender de @dnd-kit/utilities,
        // que não é dependência declarada deste projeto.
        transform: transform
          ? `translate3d(${transform.x}px, ${transform.y}px, 0)`
          : undefined,
        transition,
      }}
      {...listeners}
      {...attributes}
      onClick={() => onAbrir?.(item)}
      className={`group rounded-lg bg-white border border-slate-200 shadow-sm overflow-hidden cursor-grab active:cursor-grabbing touch-none transition-shadow hover:shadow-md hover:border-slate-300 ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      {/* Etiqueta colorida no topo — a "label" do Trello. */}
      <div className="h-1.5" style={{ backgroundColor: corDoItem(item) }} />

      <div className="px-2.5 py-2">
        <div className="text-[13px] font-medium text-arini leading-snug line-clamp-2">
          {item.titulo}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-muted-foreground">
          {item.data_hora && (
            <span className="inline-flex items-center gap-1">
              <Clock size={11} />
              {item.dia_inteiro ? "Dia inteiro" : formatarHora(item.data_hora)}
            </span>
          )}
          {!item.dia_inteiro && (
            <span className="inline-flex items-center gap-1">
              <Timer size={11} />
              {formatarDuracao(item.duracao_min)}
            </span>
          )}
          {item.local && (
            <span className="inline-flex items-center gap-1 max-w-full truncate">
              <MapPin size={11} className="shrink-0" />
              <span className="truncate">{item.local}</span>
            </span>
          )}
          {item.property_codigo && (
            <span className="inline-flex items-center gap-1">
              <Building2 size={11} />
              {item.property_codigo}
            </span>
          )}
        </div>

        <div className="mt-2 flex items-center justify-between gap-2">
          <span
            className="rounded-full px-1.5 py-0.5 text-[10px] font-medium border"
            style={{
              borderColor: `${COR_STATUS[item.status]}55`,
              backgroundColor: `${COR_STATUS[item.status]}1a`,
              color: COR_STATUS[item.status],
            }}
          >
            {AGENDA_STATUS_LABELS[item.status]}
          </span>
          {responsavel && (
            <span
              title={responsavel.nome}
              className="h-5 w-5 shrink-0 grid place-items-center rounded-full bg-arini text-white text-[9px] font-semibold"
            >
              {iniciais(responsavel.nome)}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
