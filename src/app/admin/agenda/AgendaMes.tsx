"use client";

import { useEffect, useMemo, useState } from "react";
import {
  useDndMonitor,
  useDraggable,
  useDroppable,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  AGENDA_STATUS_LABELS,
  AGENDA_TIPO_LABELS,
  type AgendaItem,
} from "@/lib/types";
import type { VistaProps } from "./shared";
import {
  chaveDia,
  corDoItem,
  diasEntre,
  formatarHora,
  formatarIntervalo,
  iniciais,
  inicioDaSemana,
  inicioDoMes,
  intervaloEmDias,
  mesmoDia,
  numeroDaSemanaISO,
} from "./shared";
import { X } from "lucide-react";

/**
 * Calendário mensal (grade 7×6 clássica, começando no domingo), no formato que
 * o cliente aprovou (referência ClickUp/Wrike): número ISO da semana na lateral,
 * compromisso de vários dias como BARRA contínua e avatar do responsável.
 *
 * A grade tem SEMPRE 42 células, mesmo que o mês só ocupe 5 semanas, e a altura
 * da célula é fixa: layout mudando debaixo do cursor é a forma mais fácil de
 * clicar no dia errado.
 */

/** Item que já tem data. Sem data (`data_hora: null`) é do painel lateral. */
type ItemAgendado = AgendaItem & { data_hora: string };

const NOMES_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
/** Quantas faixas de compromisso cabem antes do "+N mais". */
const MAX_FAIXAS = 3;
const ALTURA_CELULA = 132;
/** Espaço reservado no topo da célula para o número do dia. */
const TOPO_SEGMENTOS = 26;
/** Passo vertical de cada faixa e altura útil da barra/pílula. */
const SLOT_FAIXA = 20;
const ALTURA_SEGMENTO = 18;

/**
 * Converte a string de período em Date à MEIA-NOITE LOCAL.
 *
 * Cuidado de fuso: `new Date("2026-07-01")` é lido como UTC e no Brasil (UTC-3)
 * retrocede para 30/06 às 21h — o mês inteiro sairia deslocado. Data pura é
 * quebrada na mão e remontada com o construtor local.
 */
function diaLocal(valor: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(valor);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Versão pastel da cor do tipo. A referência do cliente usa fundo claro com
 * texto escuro (não barra sólida saturada) — com 42 células na tela, cor cheia
 * vira ruído e o mês fica ilegível.
 */
function comAlfa(hex: string, alfa: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}

/** Um pedaço de compromisso dentro de UMA linha de semana. */
interface Segmento {
  chave: string;
  item: ItemAgendado;
  semana: number;
  /** Coluna 0..6 onde o pedaço começa e quantas colunas ele ocupa. */
  col: number;
  span: number;
  /** Cantos "abertos": o compromisso continua na semana anterior/seguinte. */
  continuaAntes: boolean;
  continuaDepois: boolean;
  /** Barra (multi-dia ou dia inteiro) x pílula com hora. */
  barra: boolean;
  faixa: number;
}

export function AgendaMes({ itens, inicio, agentes, onMover, onAbrir }: VistaProps) {
  // `fim` não é usado: a grade do mês é derivada só do mês de `inicio` — ela
  // sempre mostra 6 semanas, independentemente do range carregado pela casca.
  const [diaAberto, setDiaAberto] = useState<string | null>(null);

  /**
   * "Hoje" só é resolvido no cliente. O HTML do servidor sai no fuso do
   * servidor (UTC em produção); calcular no render destacaria outro dia no
   * SSR depois das 21h e a hidratação divergiria.
   */
  const [hoje, setHoje] = useState<Date | null>(null);
  useEffect(() => setHoje(new Date()), []);

  const agentePorId = useMemo(() => {
    const m = new Map<string, { nome: string; avatarUrl?: string | null }>();
    for (const a of agentes) m.set(a.id, { nome: a.nome, avatarUrl: a.avatarUrl });
    return m;
  }, [agentes]);

  const mesBase = useMemo(() => inicioDoMes(diaLocal(inicio)), [inicio]);

  /** As 42 células: da semana que contém o dia 1 até fechar 6 semanas. */
  const celulas = useMemo(() => {
    const primeiro = inicioDaSemana(mesBase);
    return Array.from({ length: 42 }, (_, i) =>
      // Avançamos pelo construtor local (não somando ms) para não escorregar 1h
      // numa eventual virada de horário de verão.
      new Date(primeiro.getFullYear(), primeiro.getMonth(), primeiro.getDate() + i),
    );
  }, [mesBase]);

  const agendados = useMemo(
    () => itens.filter((i): i is ItemAgendado => i.data_hora !== null),
    [itens],
  );

  /**
   * Recorta cada compromisso em segmentos de semana e empilha em faixas.
   *
   * Custa O(itens × semanas), então fica no useMemo: a grade tem 6 semanas e
   * re-renderiza a cada hover/popover — recalcular isso sempre seria desperdício.
   */
  const { porSemana, itensPorDia, ocultosPorDia } = useMemo(() => {
    const inicioGrade = celulas[0];
    const segmentos: Segmento[] = [];
    const porDia = new Map<string, ItemAgendado[]>();

    for (const item of agendados) {
      // `intervaloEmDias` devolve null para item sem data. Já filtramos esses
      // em `agendados`, mas o guard mantém o tipo honesto (e a vista imune se
      // a casca um dia deixar passar um item de backlog).
      const intervalo = intervaloEmDias(item);
      if (!intervalo) continue;
      const { inicio: ini, fim: f } = intervalo;
      // Índices de dia relativos ao começo da grade (0..41), em dias de
      // calendário locais — nunca via toISOString, que jogaria o item da noite
      // para o dia seguinte.
      const di = diasEntre(inicioGrade, ini);
      const df = diasEntre(inicioGrade, f);
      if (df < 0 || di > 41) continue; // fora das 6 semanas exibidas

      const de = Math.max(0, di);
      const ate = Math.min(41, df);
      const multiDia = df > di;

      for (let d = de; d <= ate; d++) {
        const k = chaveDia(celulas[d]);
        const lista = porDia.get(k);
        if (lista) lista.push(item);
        else porDia.set(k, [item]);
      }

      // Quebra na virada de semana: um pedaço até sábado, outro do domingo.
      for (let w = Math.floor(de / 7); w <= Math.floor(ate / 7); w++) {
        const col = Math.max(de, w * 7) - w * 7;
        const colFim = Math.min(ate, w * 7 + 6) - w * 7;
        segmentos.push({
          chave: `${item.id}@${w}`,
          item,
          semana: w,
          col,
          span: colFim - col + 1,
          continuaAntes: w * 7 + col > di,
          continuaDepois: w * 7 + colFim < df,
          barra: multiDia || item.dia_inteiro,
          faixa: 0,
        });
      }
    }

    // Empilhamento por semana: barras longas primeiro (é como o olho lê o mês),
    // depois por horário. Sem isso duas barras do mesmo dia se sobrepõem e o
    // calendário esconde compromisso.
    const porSemana: Segmento[][] = Array.from({ length: 6 }, () => []);
    for (const s of segmentos) porSemana[s.semana]?.push(s);

    for (const linha of porSemana) {
      linha.sort(
        (a, b) =>
          b.span - a.span ||
          a.col - b.col ||
          new Date(a.item.data_hora).getTime() - new Date(b.item.data_hora).getTime(),
      );
      const ocupado: boolean[][] = [];
      for (const s of linha) {
        let f = 0;
        for (;;) {
          if (!ocupado[f]) ocupado[f] = new Array(7).fill(false);
          let livre = true;
          for (let c = s.col; c < s.col + s.span; c++) {
            if (ocupado[f][c]) {
              livre = false;
              break;
            }
          }
          if (livre) {
            for (let c = s.col; c < s.col + s.span; c++) ocupado[f][c] = true;
            break;
          }
          f++;
        }
        s.faixa = f;
      }
    }

    // Quantos itens de cada dia ficaram abaixo do corte (vira "+N mais").
    const ocultos = new Map<string, number>();
    for (const linha of porSemana) {
      for (const s of linha) {
        if (s.faixa < MAX_FAIXAS) continue;
        for (let c = s.col; c < s.col + s.span; c++) {
          const k = chaveDia(celulas[s.semana * 7 + c]);
          ocultos.set(k, (ocultos.get(k) ?? 0) + 1);
        }
      }
    }

    for (const lista of Array.from(porDia.values())) {
      lista.sort(
        (a, b) => new Date(a.data_hora).getTime() - new Date(b.data_hora).getTime(),
      );
    }

    return { porSemana, itensPorDia: porDia, ocultosPorDia: ocultos };
  }, [agendados, celulas]);

  /**
   * O `DndContext` mora na casca (para arrastar do painel "sem data" para o
   * calendário). Aqui só ESCUTAMOS o fim do arraste: reagendar preservando a
   * hora é regra da vista de mês, não da casca — a casca não sabe que o mês
   * move por DIA e não por instante. Itens sem data não passam por aqui
   * (foram filtrados), então não há conflito com o `onAgendar` da casca.
   */
  useDndMonitor({
    onDragEnd(e: DragEndEvent) {
      const alvo = e.over?.id;
      if (!onMover || typeof alvo !== "string" || !alvo.startsWith("dia:")) return;

      const item = agendados.find((i) => i.id === String(e.active.id));
      if (!item) return;

      const destino = celulas.find((c) => `dia:${chaveDia(c)}` === alvo);
      if (!destino) return;

      const original = new Date(item.data_hora);
      if (mesmoDia(original, destino)) return; // soltou no mesmo dia: nada muda

      // Preserva a HORA original e troca só a data. Montamos com o construtor
      // local a partir de getHours/getMinutes — usar toISOString().slice(0,10)
      // aqui devolveria o dia seguinte para qualquer compromisso após as 21h.
      const nova = new Date(
        destino.getFullYear(),
        destino.getMonth(),
        destino.getDate(),
        original.getHours(),
        original.getMinutes(),
        0,
        0,
      );
      onMover(item.id, nova.toISOString());
    },
  });

  const mesAtual = mesBase.getMonth();

  // Mês vazio NÃO substitui a grade. Antes havia um retorno antecipado aqui
  // com um cartão de "sem compromissos", e ele quebrava justamente o primeiro
  // uso: sem grade não existem os alvos de soltura, então era impossível
  // arrastar um cartão do painel lateral para um dia. Um calendário vazio
  // ainda é um calendário — a dica abaixo basta.
  const mesVazio = agendados.length === 0;

  return (
    <div className="overflow-x-auto rounded-lg border bg-white">
      {mesVazio && (
        <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          Nenhum compromisso com data neste mês. Arraste um cartão do painel de
          não agendados para um dia, ou clique em Novo compromisso.
        </p>
      )}
      <div className="min-w-[680px]">
        <CabecalhoSemana />

        {porSemana.map((segmentos, w) => {
          const diasDaSemana = celulas.slice(w * 7, w * 7 + 7);
          return (
            <div key={w} className="flex border-b last:border-b-0">
              {/* Lateral: número ISO da semana. Calculado a partir da SEGUNDA
                  da linha — a semana ISO começa na segunda, e a nossa grade
                  começa no domingo; usar o domingo devolveria a semana anterior. */}
              <div className="flex w-9 shrink-0 items-start justify-center border-r bg-muted/30 pt-2 text-[11px] tabular-nums text-muted-foreground">
                {numeroDaSemanaISO(diasDaSemana[1])}
              </div>

              <div className="relative flex-1" style={{ height: ALTURA_CELULA }}>
                {/* Camada 1: as 7 células (fundo, número do dia, alvo de drop). */}
                <div className="grid h-full grid-cols-7">
                  {diasDaSemana.map((dia) => {
                    const k = chaveDia(dia);
                    const foraDoMes = dia.getMonth() !== mesAtual;
                    const eHoje = hoje ? mesmoDia(dia, hoje) : false;
                    const ocultos = ocultosPorDia.get(k) ?? 0;

                    return (
                      <Celula key={k} id={`dia:${k}`} foraDoMes={foraDoMes}>
                        <span
                          className={`ml-1 mt-1 inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1 text-xs tabular-nums ${
                            eHoje
                              ? "bg-arini font-semibold text-white"
                              : foraDoMes
                                ? "text-muted-foreground/50"
                                : "text-foreground"
                          }`}
                        >
                          {dia.getDate()}
                        </span>

                        {ocultos > 0 && (
                          <button
                            type="button"
                            onClick={() => setDiaAberto(diaAberto === k ? null : k)}
                            className="absolute bottom-1 left-1 z-10 rounded px-1 text-[11px] font-medium text-arini hover:underline"
                          >
                            +{ocultos} mais
                          </button>
                        )}

                        {/* Dia vazio não faz nada ao clicar: o diálogo de criação
                            é da casca (NewEventDialog). O gancho de criação
                            entraria exatamente aqui, algo como `onCriar?.(dia)`,
                            quando o contrato expuser isso. */}

                        {diaAberto === k && (
                          <PainelDoDia
                            dia={dia}
                            itens={itensPorDia.get(k) ?? []}
                            agentePorId={agentePorId}
                            onFechar={() => setDiaAberto(null)}
                            onAbrir={onAbrir}
                          />
                        )}
                      </Celula>
                    );
                  })}
                </div>

                {/* Camada 2: barras e pílulas por cima das células. Fica com
                    pointer-events desligado para não roubar o clique do dia;
                    cada segmento reativa o seu. */}
                <div
                  className="pointer-events-none absolute inset-x-0 bottom-0"
                  style={{ top: TOPO_SEGMENTOS }}
                >
                  {segmentos
                    .filter((s) => s.faixa < MAX_FAIXAS)
                    .map((s) => (
                      <SegmentoView
                        key={s.chave}
                        seg={s}
                        agente={
                          s.item.responsavel_id
                            ? agentePorId.get(s.item.responsavel_id)
                            : undefined
                        }
                        onAbrir={onAbrir}
                      />
                    ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function CabecalhoSemana() {
  return (
    <div className="flex border-b bg-muted/40">
      <div className="w-9 shrink-0 border-r py-1.5 text-center text-[10px] font-medium uppercase text-muted-foreground">
        Sem
      </div>
      <div className="grid flex-1 grid-cols-7">
        {NOMES_SEMANA.map((n) => (
          <div
            key={n}
            className="px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide text-muted-foreground"
          >
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Célula do dia: altura fixa e alvo de drop do dnd-kit (contexto vem da casca). */
function Celula({
  id,
  foraDoMes,
  children,
}: {
  id: string;
  foraDoMes: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <div
      ref={setNodeRef}
      className={`relative border-r last:border-r-0 ${
        foraDoMes ? "bg-muted/25" : "bg-white"
      } ${isOver ? "ring-2 ring-inset ring-arini/60" : ""}`}
    >
      {children}
    </div>
  );
}

function SegmentoView({
  seg,
  agente,
  onAbrir,
}: {
  seg: Segmento;
  agente?: { nome: string; avatarUrl?: string | null };
  onAbrir?: (item: AgendaItem) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    // O id do arraste é o do ITEM, não o do segmento: um compromisso quebrado
    // em duas semanas continua sendo um só ao ser movido.
    id: seg.item.id,
    data: { item: seg.item },
  });

  const item = seg.item;
  const cor = corDoItem(item);
  const detalhe = [
    item.dia_inteiro
      ? "Dia inteiro"
      : formatarIntervalo(item.data_hora, item.duracao_min),
    item.titulo,
    `${AGENDA_TIPO_LABELS[item.tipo]} · ${AGENDA_STATUS_LABELS[item.status]}`,
    agente ? `Responsável: ${agente.nome}` : null,
    item.local ? `Local: ${item.local}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <div
      className="pointer-events-auto absolute px-0.5"
      style={{
        left: `${(seg.col / 7) * 100}%`,
        width: `${(seg.span / 7) * 100}%`,
        top: seg.faixa * SLOT_FAIXA,
        height: ALTURA_SEGMENTO,
      }}
    >
      <button
        ref={setNodeRef}
        {...listeners}
        {...attributes}
        type="button"
        title={detalhe}
        onClick={() => onAbrir?.(item)}
        className={`flex h-full w-full items-center gap-1 overflow-hidden px-1 text-left text-[11px] leading-none text-slate-800 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-arini ${
          seg.continuaAntes ? "rounded-l-none" : "rounded-l-md"
        } ${seg.continuaDepois ? "rounded-r-none" : "rounded-r-md"}`}
        style={{
          backgroundColor: comAlfa(cor, 0.16),
          // A borda esquerda some quando o pedaço é continuação da semana
          // anterior: é o que sinaliza "isto começou antes".
          borderLeft: seg.continuaAntes ? "none" : `3px solid ${cor}`,
          opacity: isDragging ? 0.35 : item.status === "cancelado" ? 0.5 : 1,
          textDecoration: item.status === "cancelado" ? "line-through" : undefined,
        }}
      >
        {agente && <MiniAvatar nome={agente.nome} url={agente.avatarUrl} />}
        {!seg.barra && (
          <span className="shrink-0 font-semibold tabular-nums text-slate-600">
            {formatarHora(item.data_hora)}
          </span>
        )}
        <span className="truncate font-medium">{item.titulo}</span>
        {seg.continuaDepois && <span className="ml-auto shrink-0 opacity-60">›</span>}
      </button>
    </div>
  );
}

/** Avatar circular do responsável: foto quando existe, iniciais quando não. */
function MiniAvatar({ nome, url }: { nome: string; url?: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={nome}
        title={nome}
        className="h-4 w-4 shrink-0 rounded-full object-cover ring-1 ring-black/10"
      />
    );
  }
  return (
    <span
      title={nome}
      className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-white/70 text-[8px] font-bold text-slate-600 ring-1 ring-black/10"
    >
      {iniciais(nome)}
    </span>
  );
}

/** Painel do "+N mais": lista o dia inteiro sem esticar a célula da grade. */
function PainelDoDia({
  dia,
  itens,
  agentePorId,
  onFechar,
  onAbrir,
}: {
  dia: Date;
  itens: ItemAgendado[];
  agentePorId: Map<string, { nome: string; avatarUrl?: string | null }>;
  onFechar: () => void;
  onAbrir?: (item: AgendaItem) => void;
}) {
  return (
    <>
      {/* Camada invisível que fecha o painel ao clicar fora. */}
      <button
        type="button"
        aria-label="Fechar"
        onClick={onFechar}
        className="fixed inset-0 z-40 cursor-default"
      />
      <div className="absolute left-0 top-6 z-50 max-h-64 w-56 overflow-y-auto rounded-lg border bg-white p-2 shadow-xl">
        <div className="mb-1.5 flex items-center justify-between gap-2">
          <span className="text-xs font-semibold text-arini">
            {dia.toLocaleDateString("pt-BR", {
              weekday: "short",
              day: "2-digit",
              month: "short",
            })}
          </span>
          <button
            type="button"
            onClick={onFechar}
            className="rounded p-0.5 text-muted-foreground hover:bg-muted"
          >
            <X size={13} />
          </button>
        </div>
        <div className="space-y-1">
          {itens.map((item) => {
            const agente = item.responsavel_id
              ? agentePorId.get(item.responsavel_id)
              : undefined;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  onFechar();
                  onAbrir?.(item);
                }}
                className="flex w-full items-start gap-1.5 rounded px-1 py-1 text-left text-[11px] hover:bg-muted"
              >
                <span
                  className="mt-1 h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: corDoItem(item) }}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium text-foreground">
                    {item.titulo}
                  </span>
                  <span className="block text-muted-foreground">
                    {item.dia_inteiro
                      ? "Dia inteiro"
                      : formatarIntervalo(item.data_hora, item.duracao_min)}{" "}
                    · {AGENDA_TIPO_LABELS[item.tipo]}
                  </span>
                </span>
                {agente && <MiniAvatar nome={agente.nome} url={agente.avatarUrl} />}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
}
