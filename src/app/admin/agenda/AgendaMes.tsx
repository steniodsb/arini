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
import type { EstiloMes, VistaProps } from "./shared";
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
 *
 * ---------------------------------------------------------------------
 * DOIS ESTILOS (prop `estilo`)
 * ---------------------------------------------------------------------
 * O MOTOR é o mesmo nos dois: recorte em segmentos de semana, empilhamento
 * em faixas sem sobreposição, quebra na virada de semana e número ISO. O que
 * muda é só a CAMADA DE APRESENTAÇÃO do segmento e a métrica vertical:
 *
 * - `compacto`: pílula pastel de uma linha (o que já existia).
 * - `cartoes`: cartão branco com chip de etiqueta, título em duas linhas e
 *   avatares empilhados (Calendar Power-Up do Trello). Aqui as faixas
 *   multi-dia ganham uma região própria no TOPO da linha da semana, e os
 *   cartões de um dia só vêm abaixo — é assim que a referência se organiza.
 */

/** Item que já tem data. Sem data (`data_hora: null`) é do painel lateral. */
type ItemAgendado = AgendaItem & { data_hora: string };

/** Pessoa como os avatares precisam. Sem id: a chave sai do índice na pilha. */
interface Pessoa {
  nome: string;
  avatarUrl?: string | null;
}

const NOMES_SEMANA = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

/**
 * Métricas verticais de cada estilo, em px.
 *
 * Elas ficam numa tabela (e não em constantes soltas) porque o corte do
 * "+N mais" é DERIVADO delas: quantas linhas cabem é uma conta, não um
 * número mágico. Assim, mexer na altura do cartão ajusta o corte sozinho e
 * o layout não "pula" nem corta cartão pela metade ao trocar de estilo.
 */
interface Metricas {
  alturaCelula: number;
  /** Espaço reservado no topo da célula para o número do dia. */
  topo: number;
  /** Espaço reservado embaixo para o botão "+N mais". */
  rodape: number;
  /** Passo e altura útil da faixa multi-dia. */
  slotBarra: number;
  alturaBarra: number;
  /** Passo e altura útil do cartão/pílula de um dia só. */
  slotCartao: number;
  alturaCartao: number;
  /** Teto de faixas no compacto (onde barra e pílula dividem o mesmo passo). */
  maxLinhas: number;
  /** Teto de faixas multi-dia no estilo de cartões. */
  maxBarras: number;
}

const METRICAS: Record<EstiloMes, Metricas> = {
  // Igual ao que já estava em produção — nada aqui deve mudar de aparência.
  compacto: {
    alturaCelula: 132,
    topo: 26,
    rodape: 20,
    slotBarra: 20,
    alturaBarra: 18,
    slotCartao: 20,
    alturaCartao: 18,
    maxLinhas: 3,
    maxBarras: 3,
  },
  // O cartão precisa de: 12px de padding vertical + 6px do chip + 4px de
  // respiro + 2 linhas de título a 15px = 52px. 54 dá folga de 2px para o
  // arredondamento do navegador, e o passo de 58 abre o "gutter" entre
  // cartões que o Trello tem.
  cartoes: {
    alturaCelula: 200,
    topo: 28,
    rodape: 20,
    slotBarra: 30,
    alturaBarra: 26,
    slotCartao: 58,
    alturaCartao: 54,
    maxLinhas: 3,
    maxBarras: 3,
  },
};

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
  /** Deslocamento vertical final, em px, já resolvido pelas métricas. */
  top: number;
  /** Falso quando o segmento caiu abaixo do corte e virou "+N mais". */
  visivel: boolean;
}

/**
 * Empilha os segmentos de UMA semana em faixas sem sobreposição e devolve
 * quantas faixas foram usadas.
 *
 * É exatamente o algoritmo que já estava aqui (barras longas primeiro, que é
 * como o olho lê o mês, depois por coluna e horário) — só foi extraído para
 * função porque o estilo de cartões precisa rodá-lo DUAS vezes: uma para as
 * faixas multi-dia (que ocupam o topo da linha) e outra para os cartões de um
 * dia só (que vêm abaixo). Sem essa separação, uma faixa fina de 26px e um
 * cartão de 54px disputariam o mesmo slot e um cobriria o outro.
 */
function empilharEmFaixas(linha: Segmento[]): number {
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
  return ocupado.length;
}

export function AgendaMes({
  itens,
  inicio,
  agentes,
  onMover,
  onAbrir,
  estilo = "compacto",
}: VistaProps & {
  /**
   * Visual da grade. Padrão `compacto` para que qualquer chamador antigo
   * (e os testes de olho já feitos) continuem vendo exatamente o mesmo mês.
   */
  estilo?: EstiloMes;
}) {
  const m = METRICAS[estilo];
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
          top: 0,
          visivel: true,
        });
      }
    }

    // Empilhamento por semana: barras longas primeiro (é como o olho lê o mês),
    // depois por horário. Sem isso duas barras do mesmo dia se sobrepõem e o
    // calendário esconde compromisso.
    const porSemana: Segmento[][] = Array.from({ length: 6 }, () => []);
    for (const s of segmentos) porSemana[s.semana]?.push(s);

    for (const linha of porSemana) {
      if (estilo === "compacto") {
        // Um passo só: pílula e barra têm a mesma altura, então uma passagem
        // de empilhamento resolve as duas.
        empilharEmFaixas(linha);
        for (const s of linha) {
          s.top = s.faixa * m.slotCartao;
          s.visivel = s.faixa < m.maxLinhas;
        }
        continue;
      }

      // Estilo Trello: as faixas multi-dia ficam ACIMA dos cartões do dia,
      // em duas regiões independentes. Cada região empilha sozinha.
      const barras = linha.filter((s) => s.barra);
      const cartoes = linha.filter((s) => !s.barra);

      const faixasUsadas = empilharEmFaixas(barras);
      empilharEmFaixas(cartoes);

      const faixasBarra = Math.min(faixasUsadas, m.maxBarras);
      const alturaBarras = faixasBarra * m.slotBarra;
      // Quantos cartões cabem depende de quanta altura as faixas comeram —
      // por isso o corte é calculado por semana, e não fixo. Semana sem
      // multi-dia mostra mais cartões; semana com três faixas mostra menos.
      const linhasCartao = Math.max(
        0,
        Math.floor((m.alturaCelula - m.topo - m.rodape - alturaBarras) / m.slotCartao),
      );

      for (const s of barras) {
        s.top = s.faixa * m.slotBarra;
        s.visivel = s.faixa < faixasBarra;
      }
      for (const s of cartoes) {
        s.top = alturaBarras + s.faixa * m.slotCartao;
        s.visivel = s.faixa < linhasCartao;
      }
    }

    // Quantos itens de cada dia ficaram abaixo do corte (vira "+N mais").
    const ocultos = new Map<string, number>();
    for (const linha of porSemana) {
      for (const s of linha) {
        if (s.visivel) continue;
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
  }, [agendados, celulas, estilo, m]);

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

  /**
   * Coluna (0 = domingo … 6 = sábado) do dia de hoje, para destacar a coluna
   * inteira como na referência — não só o número do dia.
   *
   * Só vale quando hoje está DENTRO das 42 células desenhadas: destacar a
   * coluna de quarta enquanto o usuário folheia março de 2027 afirmaria
   * "hoje é aqui" sobre um dia que não é hoje. Como `hoje` nasce `null` e só
   * é resolvido no efeito, o SSR não destaca nada e a hidratação bate.
   */
  const colunaDeHoje = useMemo(() => {
    if (!hoje) return null;
    const d = diasEntre(celulas[0], hoje);
    return d >= 0 && d <= 41 ? hoje.getDay() : null;
  }, [hoje, celulas]);

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
        <CabecalhoSemana colunaDeHoje={colunaDeHoje} />

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

              <div className="relative flex-1" style={{ height: m.alturaCelula }}>
                {/* Camada 1: as 7 células (fundo, número do dia, alvo de drop). */}
                <div className="grid h-full grid-cols-7">
                  {diasDaSemana.map((dia, col) => {
                    const k = chaveDia(dia);
                    const foraDoMes = dia.getMonth() !== mesAtual;
                    const eHoje = hoje ? mesmoDia(dia, hoje) : false;
                    // A coluna inteira de hoje recebe fundo azul claro (nas seis
                    // linhas), como na referência — o dia de hoje em si ainda
                    // ganha o pastilhão no número.
                    const naColunaDeHoje = colunaDeHoje !== null && col === colunaDeHoje;
                    const ocultos = ocultosPorDia.get(k) ?? 0;

                    return (
                      <Celula
                        key={k}
                        id={`dia:${k}`}
                        foraDoMes={foraDoMes}
                        naColunaDeHoje={naColunaDeHoje}
                      >
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
                  style={{ top: m.topo }}
                >
                  {segmentos
                    .filter((s) => s.visivel)
                    .map((s) => {
                      const responsavel = s.item.responsavel_id
                        ? agentePorId.get(s.item.responsavel_id)
                        : undefined;
                      return (
                        <SegmentoView
                          key={s.chave}
                          seg={s}
                          estilo={estilo}
                          metricas={m}
                          // Uma LISTA, mesmo com um só responsável — ver
                          // `PilhaAvatares`.
                          pessoas={responsavel ? [responsavel] : []}
                          onAbrir={onAbrir}
                        />
                      );
                    })}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Cabeçalho da grade: "DOM SEG TER…" em maiúsculas e cinza, com a coluna do
 * dia de hoje realçada. O número do dia mora DENTRO da célula (nunca aqui) —
 * é o que separa este calendário de uma tabela de horários.
 */
function CabecalhoSemana({ colunaDeHoje }: { colunaDeHoje: number | null }) {
  return (
    <div className="flex border-b bg-muted/40">
      <div className="w-9 shrink-0 border-r py-1.5 text-center text-[10px] font-medium uppercase text-muted-foreground">
        Sem
      </div>
      <div className="grid flex-1 grid-cols-7">
        {NOMES_SEMANA.map((n, col) => {
          const ehColunaDeHoje = col === colunaDeHoje;
          return (
            <div
              key={n}
              className={`px-2 py-1.5 text-center text-[11px] font-medium uppercase tracking-wide ${
                ehColunaDeHoje
                  ? "bg-sky-100/70 font-semibold text-sky-700"
                  : "text-muted-foreground"
              }`}
            >
              {n}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Célula do dia: altura fixa e alvo de drop do dnd-kit (contexto vem da casca). */
function Celula({
  id,
  foraDoMes,
  naColunaDeHoje,
  children,
}: {
  id: string;
  foraDoMes: boolean;
  naColunaDeHoje: boolean;
  children: React.ReactNode;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  // A coluna de hoje vence o cinza de "fora do mês": o destaque é o que o
  // olho procura primeiro ao abrir o mês, e perdê-lo na primeira/última
  // semana seria justamente onde ele mais ajuda.
  const fundo = naColunaDeHoje
    ? foraDoMes
      ? "bg-sky-50/60"
      : "bg-sky-50"
    : foraDoMes
      ? "bg-muted/25"
      : "bg-white";
  return (
    <div
      ref={setNodeRef}
      className={`relative border-r last:border-r-0 ${fundo} ${
        isOver ? "ring-2 ring-inset ring-arini/60" : ""
      }`}
    >
      {children}
    </div>
  );
}

function SegmentoView({
  seg,
  estilo,
  metricas,
  pessoas,
  onAbrir,
}: {
  seg: Segmento;
  estilo: EstiloMes;
  metricas: Metricas;
  pessoas: Pessoa[];
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
  const cartao = estilo === "cartoes";
  const hora = item.dia_inteiro
    ? "Dia inteiro"
    : formatarIntervalo(item.data_hora, item.duracao_min);

  // No estilo de cartões a HORA não aparece na grade (o Trello não mostra) —
  // ela vive só aqui, no tooltip. Foi decisão deliberada: com o chip de
  // etiqueta em cima e duas linhas de título, uma terceira linha de hora
  // estouraria os 54px do cartão e deixaria o título com uma linha só. Numa
  // agenda imobiliária, saber DE QUE é o compromisso importa mais do que a
  // hora exata, que está a um clique no detalhe.
  const detalhe = [
    hora,
    item.titulo,
    `${AGENDA_TIPO_LABELS[item.tipo]} · ${AGENDA_STATUS_LABELS[item.status]}`,
    pessoas.length > 0 ? `Responsável: ${pessoas.map((p) => p.nome).join(", ")}` : null,
    item.local ? `Local: ${item.local}` : null,
  ]
    .filter(Boolean)
    .join("\n");

  const altura = cartao && seg.barra ? metricas.alturaBarra : metricas.alturaCartao;
  const opacidade = isDragging ? 0.35 : item.status === "cancelado" ? 0.5 : 1;
  const riscado = item.status === "cancelado" ? "line-through" : undefined;

  // Cantos "abertos" quando o pedaço continua na semana anterior/seguinte —
  // o raio muda com o estilo (Trello usa cantos bem discretos, ~3px).
  const raio = cartao
    ? `${seg.continuaAntes ? "rounded-l-none" : "rounded-l-[3px]"} ${
        seg.continuaDepois ? "rounded-r-none" : "rounded-r-[3px]"
      }`
    : `${seg.continuaAntes ? "rounded-l-none" : "rounded-l-md"} ${
        seg.continuaDepois ? "rounded-r-none" : "rounded-r-md"
      }`;

  return (
    <div
      className={`pointer-events-auto absolute ${cartao ? "px-1" : "px-0.5"}`}
      style={{
        left: `${(seg.col / 7) * 100}%`,
        width: `${(seg.span / 7) * 100}%`,
        top: seg.top,
        height: altura,
      }}
    >
      {cartao ? (
        <button
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          type="button"
          title={detalhe}
          onClick={() => onAbrir?.(item)}
          className={`flex h-full w-full overflow-hidden border border-slate-200 bg-white text-left shadow-[0_1px_1px_rgba(9,30,66,0.15)] transition hover:border-slate-300 hover:shadow-[0_3px_6px_rgba(9,30,66,0.18)] focus:outline-none focus:ring-2 focus:ring-arini ${raio} ${
            // Faixa multi-dia: uma linha só, tudo centrado na vertical.
            // Cartão de um dia: chip em cima, título embaixo, avatar à direita.
            seg.barra ? "items-center gap-2 px-2" : "items-start gap-1.5 px-2 py-1.5"
          }`}
          style={{ opacity: opacidade, textDecoration: riscado }}
        >
          {seg.barra ? (
            <>
              <span
                className="h-1.5 w-8 shrink-0 rounded-full"
                style={{ backgroundColor: cor }}
              />
              <span className="min-w-0 flex-1 truncate text-[12px] font-medium text-slate-800">
                {item.titulo}
              </span>
              <PilhaAvatares pessoas={pessoas} tamanho={20} />
            </>
          ) : (
            <>
              <span className="min-w-0 flex-1">
                {/* Chip de etiqueta ACIMA do título: é o elemento que dá o
                    visual do Trello e o que permite reconhecer o tipo do
                    compromisso sem ler nada. */}
                <span
                  className="block h-1.5 w-8 rounded-full"
                  style={{ backgroundColor: cor }}
                />
                {/* Sem `block` aqui de propósito: `line-clamp-2` precisa de
                    `display: -webkit-box` para cortar, e a utilitária `block`
                    ganharia dela na folha de estilo — o título passaria de
                    duas linhas e vazaria para fora do cartão. */}
                <span className="mt-1 text-[12px] font-medium leading-[15px] text-slate-800 line-clamp-2">
                  {item.titulo}
                </span>
              </span>
              {/* `self-end` alinha o avatar pelo RODAPÉ do cartão (o botão é o
                  container flex e tem altura cheia), como no Trello — e não
                  pela primeira linha do título, que é onde ele cairia com o
                  `items-start` do container. */}
              <span className="self-end">
                <PilhaAvatares pessoas={pessoas} tamanho={20} />
              </span>
            </>
          )}
        </button>
      ) : (
        <button
          ref={setNodeRef}
          {...listeners}
          {...attributes}
          type="button"
          title={detalhe}
          onClick={() => onAbrir?.(item)}
          className={`flex h-full w-full items-center gap-1 overflow-hidden px-1 text-left text-[11px] leading-none text-slate-800 transition hover:brightness-95 focus:outline-none focus:ring-2 focus:ring-arini ${raio}`}
          style={{
            backgroundColor: comAlfa(cor, 0.16),
            // A borda esquerda some quando o pedaço é continuação da semana
            // anterior: é o que sinaliza "isto começou antes".
            borderLeft: seg.continuaAntes ? "none" : `3px solid ${cor}`,
            opacity: opacidade,
            textDecoration: riscado,
          }}
        >
          {pessoas[0] && <MiniAvatar nome={pessoas[0].nome} url={pessoas[0].avatarUrl} />}
          {!seg.barra && (
            <span className="shrink-0 font-semibold tabular-nums text-slate-600">
              {formatarHora(item.data_hora)}
            </span>
          )}
          <span className="truncate font-medium">{item.titulo}</span>
          {seg.continuaDepois && <span className="ml-auto shrink-0 opacity-60">›</span>}
        </button>
      )}
    </div>
  );
}

/**
 * Avatares empilhados à direita, sobrepostos e com anel branco — o canto
 * inferior direito do cartão do Trello.
 *
 * Recebe uma LISTA de propósito. Hoje um compromisso tem no máximo UM
 * responsável (`AgendaItem.responsavel_id`), então na prática só um avatar é
 * desenhado; mas o corte em 3 + "+N" já está pronto, de modo que o dia em que
 * a agenda ganhar uma tabela de participantes só muda quem CHAMA este
 * componente, não o componente nem o layout do cartão.
 */
function PilhaAvatares({ pessoas, tamanho }: { pessoas: Pessoa[]; tamanho: number }) {
  if (pessoas.length === 0) return null;
  const visiveis = pessoas.slice(0, 3);
  const extras = pessoas.length - visiveis.length;

  return (
    <span className="flex shrink-0 items-center">
      {visiveis.map((p, i) => (
        // A chave usa o índice porque `Pessoa` não carrega id — e a ordem da
        // pilha é estável (vem da mesma lista de responsáveis do item).
        <span key={`${p.nome}-${i}`} className={i > 0 ? "-ml-2" : ""}>
          <MiniAvatar nome={p.nome} url={p.avatarUrl} tamanho={tamanho} anel />
        </span>
      ))}
      {extras > 0 && (
        <span
          className="-ml-2 flex items-center justify-center rounded-full bg-slate-200 text-[9px] font-bold text-slate-600 ring-2 ring-white"
          style={{ height: tamanho, width: tamanho }}
          title={pessoas
            .slice(3)
            .map((p) => p.nome)
            .join(", ")}
        >
          +{extras}
        </span>
      )}
    </span>
  );
}

/** Avatar circular do responsável: foto quando existe, iniciais quando não. */
function MiniAvatar({
  nome,
  url,
  tamanho = 16,
  anel = false,
}: {
  nome: string;
  url?: string | null;
  /** Lado em px. Padrão 16 = o tamanho que a pílula compacta sempre usou. */
  tamanho?: number;
  /** Anel branco grosso (só faz sentido quando os avatares se sobrepõem). */
  anel?: boolean;
}) {
  const contorno = anel ? "ring-2 ring-white" : "ring-1 ring-black/10";
  // Sobre o cartão branco, o fundo translúcido das iniciais sumiria — na
  // pilha ele vira cinza sólido.
  const fundoIniciais = anel ? "bg-slate-200" : "bg-white/70";
  const dimensao = { height: tamanho, width: tamanho };

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={nome}
        title={nome}
        style={dimensao}
        className={`shrink-0 rounded-full object-cover ${contorno}`}
      />
    );
  }
  return (
    <span
      title={nome}
      style={dimensao}
      className={`flex shrink-0 items-center justify-center rounded-full text-[8px] font-bold text-slate-600 ${fundoIniciais} ${contorno}`}
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
