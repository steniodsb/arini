"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  intervaloEmDias,
  mesmoDia,
} from "./shared";
import { Clock } from "lucide-react";

/**
 * Semana em grade de horas (estilo Google Calendar).
 *
 * Duas decisões que definem a vista:
 * 1. A grade NÃO nasce com 24h. Ninguém marca visita às 3h da manhã, e abrir
 *    com 24 linhas faz metade da tela nascer vazia. Começa em 7h–21h e há um
 *    botão para expandir — com aviso quando existe compromisso fora da janela.
 * 2. Compromissos que se cruzam dividem a largura da coluna. Sem isso um cobre
 *    o outro, a grade parece livre e o corretor marca em cima de um horário
 *    que já estava ocupado.
 */

/** Item que já tem data. Sem data (`data_hora: null`) é do painel lateral. */
type ItemAgendado = AgendaItem & { data_hora: string };

const ALTURA_HORA = 48;
const PX_POR_MIN = ALTURA_HORA / 60;
/** Largura da régua de horas à esquerda. */
const LARGURA_REGUA = 56;
/** Passo do arraste vertical: 15 min é a menor granularidade útil da agenda. */
const PASSO_MIN = 15;
/** Acima disso o compromisso vai para a faixa de "dia inteiro" no topo. */
const MIN_DIA_INTEIRO = 8 * 60;

const HORA_INICIO_PADRAO = 7;
const HORA_FIM_PADRAO = 21;

/**
 * Converte a string de período em Date à MEIA-NOITE LOCAL.
 *
 * Cuidado de fuso: `new Date("2026-07-27")` é lido como UTC e no Brasil (UTC-3)
 * volta para 26/07 às 21h — a semana inteira sairia deslocada em um dia.
 */
function diaLocal(valor: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(valor);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Minutos desde a meia-noite LOCAL — getHours/getMinutes, nunca UTC. */
function minutosDoDia(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/** Bloco já posicionado dentro da coluna do seu dia. */
interface Bloco {
  item: ItemAgendado;
  coluna: number; // índice do dia 0..6
  inicioMin: number;
  fimMin: number;
  /** Sub-coluna dentro do grupo de colisão e tamanho do grupo. */
  sub: number;
  total: number;
}

/** Pedaço da faixa de "dia inteiro", que pode atravessar vários dias. */
interface FaixaDia {
  item: ItemAgendado;
  col: number;
  span: number;
  faixa: number;
  continuaAntes: boolean;
  continuaDepois: boolean;
}

export function AgendaSemana({ itens, inicio, agentes, onMover, onAbrir }: VistaProps) {
  const [diaTodo, setDiaTodo] = useState(false);
  /**
   * `agora` só é preenchido no cliente. Se fosse calculado no render, o HTML
   * do servidor (que roda em UTC) marcaria outro dia como "hoje" e a
   * hidratação divergiria — a linha vermelha apareceria na coluna errada
   * por um instante.
   */
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => {
    setAgora(new Date());
    const t = setInterval(() => setAgora(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const horaIni = diaTodo ? 0 : HORA_INICIO_PADRAO;
  const horaFim = diaTodo ? 24 : HORA_FIM_PADRAO;
  const alturaGrade = (horaFim - horaIni) * ALTURA_HORA;

  const agentePorId = useMemo(() => {
    const m = new Map<string, { nome: string; avatarUrl?: string | null }>();
    for (const a of agentes) m.set(a.id, { nome: a.nome, avatarUrl: a.avatarUrl });
    return m;
  }, [agentes]);

  const dias = useMemo(() => {
    const dom = inicioDaSemana(diaLocal(inicio));
    return Array.from({ length: 7 }, (_, i) =>
      // Construtor local em vez de soma de ms: imune a virada de horário de verão.
      new Date(dom.getFullYear(), dom.getMonth(), dom.getDate() + i),
    );
  }, [inicio]);

  const agendados = useMemo(
    () => itens.filter((i): i is ItemAgendado => i.data_hora !== null),
    [itens],
  );

  /** Separa o que é "dia inteiro" (faixa do topo) do que é bloco de horário. */
  const { faixas, alturaFaixas, blocos, foraDaJanela } = useMemo(() => {
    const inicioSemana = dias[0];
    const deDiaInteiro: FaixaDia[] = [];
    const comHorario: ItemAgendado[] = [];

    for (const item of agendados) {
      // `intervaloEmDias` devolve null para item sem data — já filtrados em
      // `agendados`, mas o guard mantém o tipo honesto.
      const intervalo = intervaloEmDias(item);
      if (!intervalo) continue;
      const { inicio: ini, fim: f } = intervalo;
      const di = diasEntre(inicioSemana, ini);
      const df = diasEntre(inicioSemana, f);
      if (df < 0 || di > 6) continue; // fora da semana exibida

      const multiDia = df > di;
      if (item.dia_inteiro || multiDia || item.duracao_min >= MIN_DIA_INTEIRO) {
        deDiaInteiro.push({
          item,
          col: Math.max(0, di),
          span: Math.min(6, df) - Math.max(0, di) + 1,
          faixa: 0,
          continuaAntes: di < 0,
          continuaDepois: df > 6,
        });
      } else {
        comHorario.push(item);
      }
    }

    // Empilha as barras de dia inteiro para que não se cubram.
    deDiaInteiro.sort((a, b) => b.span - a.span || a.col - b.col);
    const ocupado: boolean[][] = [];
    for (const s of deDiaInteiro) {
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

    // ------- blocos de horário, com resolução de colisão por coluna -------
    const porColuna: ItemAgendado[][] = Array.from({ length: 7 }, () => []);
    let fora = 0;
    for (const item of comHorario) {
      const d = new Date(item.data_hora);
      const col = diasEntre(inicioSemana, d);
      if (col < 0 || col > 6) continue;
      const ini = minutosDoDia(d);
      const fim = ini + Math.max(15, item.duracao_min || 30);
      // Fora da janela visível: não desenhamos meio compromisso (mentiria
      // sobre a duração); contamos para oferecer "mostrar dia inteiro".
      if (fim <= horaIni * 60 || ini >= horaFim * 60) {
        fora++;
        continue;
      }
      porColuna[col].push(item);
    }

    const resultado: Bloco[] = [];
    for (let col = 0; col < 7; col++) {
      const lista = porColuna[col]
        .map((item) => {
          const d = new Date(item.data_hora);
          const ini = minutosDoDia(d);
          return {
            item,
            inicioMin: ini,
            fimMin: ini + Math.max(15, item.duracao_min || 30),
          };
        })
        .sort((a, b) => a.inicioMin - b.inicioMin || a.fimMin - b.fimMin);

      // Grupo de colisão = corrente de eventos que se tocam. Fechamos o grupo
      // quando o próximo começa depois do fim mais tardio já visto; só então
      // sabemos em quantas colunas a largura deve ser dividida.
      let grupo: typeof lista = [];
      let maxFim = -1;

      const fecharGrupo = () => {
        if (grupo.length === 0) return;
        const fimDaSub: number[] = [];
        const subDe = new Map<string, number>();
        for (const ev of grupo) {
          let s = fimDaSub.findIndex((f) => f <= ev.inicioMin);
          if (s === -1) {
            s = fimDaSub.length;
            fimDaSub.push(ev.fimMin);
          } else {
            fimDaSub[s] = ev.fimMin;
          }
          subDe.set(ev.item.id, s);
        }
        for (const ev of grupo) {
          resultado.push({
            item: ev.item,
            coluna: col,
            inicioMin: ev.inicioMin,
            fimMin: ev.fimMin,
            sub: subDe.get(ev.item.id) ?? 0,
            total: Math.max(1, fimDaSub.length),
          });
        }
        grupo = [];
        maxFim = -1;
      };

      for (const ev of lista) {
        if (grupo.length > 0 && ev.inicioMin >= maxFim) fecharGrupo();
        grupo.push(ev);
        maxFim = Math.max(maxFim, ev.fimMin);
      }
      fecharGrupo();
    }

    const nFaixas = ocupado.length;
    return {
      faixas: deDiaInteiro,
      alturaFaixas: nFaixas > 0 ? nFaixas * 22 + 6 : 0,
      blocos: resultado,
      foraDaJanela: fora,
    };
  }, [agendados, dias, horaIni, horaFim]);

  // ---------------------------------------------------------------------
  // Arraste. O DndContext é da casca; aqui só escutamos o fim do gesto e
  // convertemos o deslocamento em pixels para dia + hora.
  // ---------------------------------------------------------------------
  const gradeRef = useRef<HTMLDivElement | null>(null);
  const { setNodeRef: setDropRef } = useDroppable({ id: "semana-grade" });
  const refGrade = (n: HTMLDivElement | null) => {
    gradeRef.current = n;
    setDropRef(n);
  };

  useDndMonitor({
    onDragEnd(e: DragEndEvent) {
      if (!onMover) return;
      if (e.over && e.over.id !== "semana-grade") return; // soltou noutro alvo
      const item = agendados.find((i) => i.id === String(e.active.id));
      if (!item) return;

      const largura = gradeRef.current?.getBoundingClientRect().width ?? 0;
      const larguraColuna = largura / 7;
      const dDias = larguraColuna > 0 ? Math.round(e.delta.x / larguraColuna) : 0;
      // Arredonda para 15 min: o corretor não precisa acertar o pixel.
      const dMin =
        Math.round(e.delta.y / PX_POR_MIN / PASSO_MIN) * PASSO_MIN;
      if (dDias === 0 && dMin === 0) return;

      // Somamos com os setters LOCAIS (setDate/setMinutes) e não em ms: assim
      // o horário de parede resultante é o que o usuário viu na grade.
      const nova = new Date(new Date(item.data_hora).getTime());
      nova.setDate(nova.getDate() + dDias);
      nova.setMinutes(nova.getMinutes() + dMin);
      onMover(item.id, nova.toISOString());
    },
  });

  const horas = useMemo(
    () => Array.from({ length: horaFim - horaIni }, (_, i) => horaIni + i),
    [horaIni, horaFim],
  );

  const colunaDeHoje = agora ? dias.findIndex((d) => mesmoDia(d, agora)) : -1;
  const minutoAgora = agora ? minutosDoDia(agora) : 0;
  const mostrarLinhaAgora =
    colunaDeHoje >= 0 && minutoAgora >= horaIni * 60 && minutoAgora <= horaFim * 60;

  // Semana vazia NÃO substitui a grade: sem grade não há alvo de soltura,
  // e ficaria impossível arrastar um cartão do painel lateral para um horário.
  const semanaVazia = agendados.length === 0;

  return (
    <div className="rounded-lg border bg-white">
      <BarraSuperior
        diaTodo={diaTodo}
        onDiaTodo={setDiaTodo}
        foraDaJanela={foraDaJanela}
        dias={dias}
      />
      {semanaVazia && (
        <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          Semana livre. Arraste um cartão do painel de não agendados para um
          horário, ou clique em Novo compromisso.
        </p>
      )}

      {/* Em tela estreita a semana rola na horizontal em vez de espremer as
          colunas a ponto de o título sumir. */}
      <div className="overflow-x-auto">
        <div className="min-w-[760px]">
          {/* Cabeçalho dos dias */}
          <div className="flex border-b">
            <div style={{ width: LARGURA_REGUA }} className="shrink-0 border-r" />
            <div className="grid flex-1 grid-cols-7">
              {dias.map((d) => {
                const eHoje = agora ? mesmoDia(d, agora) : false;
                return (
                  <div
                    key={chaveDia(d)}
                    className={`border-r px-1 py-1.5 text-center last:border-r-0 ${
                      eHoje ? "bg-arini/10" : ""
                    }`}
                  >
                    <div className="text-[11px] uppercase text-muted-foreground">
                      {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </div>
                    <div
                      className={`mx-auto mt-0.5 flex h-6 w-6 items-center justify-center rounded-full text-sm tabular-nums ${
                        eHoje ? "bg-arini font-semibold text-white" : "text-foreground"
                      }`}
                    >
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Faixa de dia inteiro / multi-dia */}
          {alturaFaixas > 0 && (
            <div className="flex border-b bg-muted/20">
              <div
                style={{ width: LARGURA_REGUA }}
                className="shrink-0 border-r py-1 pr-1 text-right text-[10px] uppercase text-muted-foreground"
              >
                Dia
              </div>
              <div className="relative flex-1" style={{ height: alturaFaixas }}>
                <div className="absolute inset-0 grid grid-cols-7">
                  {dias.map((d) => (
                    <div key={chaveDia(d)} className="border-r last:border-r-0" />
                  ))}
                </div>
                {faixas.map((f) => (
                  <BarraDiaInteiro
                    key={f.item.id}
                    faixa={f}
                    agente={
                      f.item.responsavel_id
                        ? agentePorId.get(f.item.responsavel_id)
                        : undefined
                    }
                    onAbrir={onAbrir}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Grade de horas */}
          <div className="flex">
            <div style={{ width: LARGURA_REGUA }} className="shrink-0 border-r">
              {horas.map((h) => (
                <div
                  key={h}
                  style={{ height: ALTURA_HORA }}
                  className="relative pr-1 text-right text-[11px] tabular-nums text-muted-foreground"
                >
                  <span className="absolute right-1 top-0 -translate-y-1/2 bg-white px-0.5">
                    {String(h).padStart(2, "0")}:00
                  </span>
                </div>
              ))}
            </div>

            <div
              ref={refGrade}
              className="relative flex-1"
              style={{ height: alturaGrade }}
            >
              {/* Linhas de hora */}
              {horas.map((h, i) => (
                <div
                  key={h}
                  className="absolute inset-x-0 border-t border-muted"
                  style={{ top: i * ALTURA_HORA }}
                />
              ))}
              {/* Colunas de dia (fundo + destaque em hoje) */}
              <div className="absolute inset-0 grid grid-cols-7">
                {dias.map((d, i) => (
                  <div
                    key={chaveDia(d)}
                    className={`border-r last:border-r-0 ${
                      i === colunaDeHoje ? "bg-arini/[0.04]" : ""
                    }`}
                  />
                ))}
              </div>

              {blocos.map((b) => (
                <BlocoView
                  key={b.item.id}
                  bloco={b}
                  horaIni={horaIni}
                  horaFim={horaFim}
                  agente={
                    b.item.responsavel_id
                      ? agentePorId.get(b.item.responsavel_id)
                      : undefined
                  }
                  onAbrir={onAbrir}
                />
              ))}

              {/* Linha da hora atual — só na coluna de hoje, para não sugerir
                  que "agora" tem algum significado nos outros dias. */}
              {mostrarLinhaAgora && (
                <div
                  className="pointer-events-none absolute z-20"
                  style={{
                    top: (minutoAgora - horaIni * 60) * PX_POR_MIN,
                    left: `${(colunaDeHoje / 7) * 100}%`,
                    width: `${(1 / 7) * 100}%`,
                  }}
                >
                  <div className="relative h-0 border-t-2 border-red-500">
                    <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-500" />
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function BarraSuperior({
  diaTodo,
  onDiaTodo,
  foraDaJanela,
  dias,
}: {
  diaTodo: boolean;
  onDiaTodo: (v: boolean) => void;
  foraDaJanela: number;
  dias: Date[];
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2">
      <span className="text-xs text-muted-foreground">
        {dias[0].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} –{" "}
        {dias[6].toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
      </span>
      <div className="flex items-center gap-2">
        {foraDaJanela > 0 && !diaTodo && (
          <span className="text-[11px] text-amber-600">
            {foraDaJanela} fora de {HORA_INICIO_PADRAO}h–{HORA_FIM_PADRAO}h
          </span>
        )}
        <button
          type="button"
          onClick={() => onDiaTodo(!diaTodo)}
          className={`flex items-center gap-1 rounded-md border px-2 py-1 text-xs transition ${
            diaTodo
              ? "border-arini bg-arini text-white"
              : "bg-white text-foreground hover:bg-muted"
          }`}
        >
          <Clock size={13} />
          {diaTodo ? "Horário comercial" : "Mostrar dia inteiro"}
        </button>
      </div>
    </div>
  );
}

function BlocoView({
  bloco,
  horaIni,
  horaFim,
  agente,
  onAbrir,
}: {
  bloco: Bloco;
  horaIni: number;
  horaFim: number;
  agente?: { nome: string; avatarUrl?: string | null };
  onAbrir?: (item: AgendaItem) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: bloco.item.id,
    data: { item: bloco.item },
  });

  const item = bloco.item;
  const cor = corDoItem(item);
  // Recorta nas bordas da janela visível para o bloco não vazar da grade.
  const topoMin = Math.max(bloco.inicioMin, horaIni * 60);
  const fimMin = Math.min(bloco.fimMin, horaFim * 60);
  const altura = Math.max(16, (fimMin - topoMin) * PX_POR_MIN);

  // Cada grupo de colisão divide a largura da coluna do dia entre os seus
  // eventos: `total` sub-colunas dentro de 1/7 da grade.
  const larguraCol = 100 / 7;
  const esquerda = bloco.coluna * larguraCol + (bloco.sub / bloco.total) * larguraCol;
  const largura = larguraCol / bloco.total;

  const detalhe = [
    `${formatarIntervalo(item.data_hora, item.duracao_min)} — ${item.titulo}`,
    `${AGENDA_TIPO_LABELS[item.tipo]} · ${AGENDA_STATUS_LABELS[item.status]}`,
    agente ? `Responsável: ${agente.nome}` : null,
    item.local ? `Local: ${item.local}` : null,
    item.lead_nome ? `Lead: ${item.lead_nome}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      title={detalhe}
      onClick={() => onAbrir?.(item)}
      className="absolute z-10 overflow-hidden rounded-md border-l-[3px] px-1 py-0.5 text-left text-[11px] leading-tight text-slate-800 shadow-sm transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-arini"
      style={{
        top: (topoMin - horaIni * 60) * PX_POR_MIN,
        height: altura,
        left: `calc(${esquerda}% + 1px)`,
        width: `calc(${largura}% - 2px)`,
        backgroundColor: comAlfa(cor, 0.18),
        borderLeftColor: cor,
        opacity: isDragging ? 0.35 : item.status === "cancelado" ? 0.5 : 1,
        textDecoration: item.status === "cancelado" ? "line-through" : undefined,
      }}
    >
      <span className="flex items-center gap-1">
        {agente && <MiniAvatar nome={agente.nome} url={agente.avatarUrl} />}
        <span className="truncate font-semibold tabular-nums text-slate-600">
          {formatarHora(item.data_hora)}
        </span>
      </span>
      {altura > 30 && <span className="block truncate font-medium">{item.titulo}</span>}
    </button>
  );
}

function BarraDiaInteiro({
  faixa,
  agente,
  onAbrir,
}: {
  faixa: FaixaDia;
  agente?: { nome: string; avatarUrl?: string | null };
  onAbrir?: (item: AgendaItem) => void;
}) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({
    id: faixa.item.id,
    data: { item: faixa.item },
  });
  const item = faixa.item;
  const cor = corDoItem(item);

  return (
    <button
      ref={setNodeRef}
      {...listeners}
      {...attributes}
      type="button"
      title={`${item.titulo}\n${AGENDA_TIPO_LABELS[item.tipo]} · ${
        AGENDA_STATUS_LABELS[item.status]
      }`}
      onClick={() => onAbrir?.(item)}
      className={`absolute flex items-center gap-1 overflow-hidden px-1 text-left text-[11px] leading-none text-slate-800 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-arini ${
        faixa.continuaAntes ? "rounded-l-none" : "rounded-l-md"
      } ${faixa.continuaDepois ? "rounded-r-none" : "rounded-r-md"}`}
      style={{
        left: `calc(${(faixa.col / 7) * 100}% + 2px)`,
        width: `calc(${(faixa.span / 7) * 100}% - 4px)`,
        top: 3 + faixa.faixa * 22,
        height: 18,
        backgroundColor: comAlfa(cor, 0.18),
        borderLeft: faixa.continuaAntes ? "none" : `3px solid ${cor}`,
        opacity: isDragging ? 0.35 : 1,
      }}
    >
      {agente && <MiniAvatar nome={agente.nome} url={agente.avatarUrl} />}
      <span className="truncate font-medium">{item.titulo}</span>
    </button>
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

/**
 * Versão pastel da cor do tipo: fundo claro + texto escuro, como na referência
 * do cliente. Bloco sólido saturado numa grade cheia vira ruído.
 */
function comAlfa(hex: string, alfa: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return hex;
  const n = parseInt(m[1], 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alfa})`;
}
