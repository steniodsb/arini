"use client";

import { useEffect, useMemo, useState } from "react";
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
  mesmoDia,
} from "./shared";
import { UserRound } from "lucide-react";

/**
 * Linha do tempo (Gantt horizontal) da agenda.
 *
 * A pergunta que esta vista responde é "quem está ocupado quando?" — por isso
 * as LINHAS são pessoas e as COLUNAS são dias/horas. Ver o mesmo dado como
 * calendário (AgendaMes/AgendaSemana) não responde isso: lá os compromissos de
 * pessoas diferentes ficam misturados na mesma célula.
 */

/** Item que já tem data. A casca entrega itens sem data (`data_hora: null`)
 *  junto com o resto, mas eles pertencem ao painel lateral, não à grade. */
type ItemAgendado = AgendaItem & { data_hora: string };

/** Largura fixa da coluna de nomes (fica sticky durante a rolagem horizontal). */
const LARGURA_NOMES = 176;
/** Altura de cada faixa (nível de empilhamento) dentro de uma linha. */
const ALTURA_FAIXA = 26;
const ESPACO_FAIXA = 4;

type Escala = "dia" | "semana" | "quinzena";

/**
 * Pixels por hora em cada zoom. O nome da escala descreve *quanto período cabe
 * na tela*, não a largura: em "dia" um dia inteiro ocupa ~1000px (dá para ler o
 * título dentro da barra); em "quinzena" o dia vira ~130px e só sobra a cor.
 */
const PX_POR_HORA: Record<Escala, number> = {
  dia: 42,
  semana: 11,
  quinzena: 5.5,
};

const ESCALA_LABEL: Record<Escala, string> = {
  dia: "Dia",
  semana: "Semana",
  quinzena: "Quinzena",
};

/** Teto de colunas renderizadas — evita travar a tela se vier um range absurdo. */
const MAX_DIAS = 92;

/**
 * Converte a string de período (`inicio`/`fim`) em uma Date à MEIA-NOITE LOCAL.
 *
 * Cuidado de fuso: `new Date("2026-07-27")` é interpretado como UTC pelo JS, o
 * que no Brasil (UTC-3) devolve 26/07 às 21h — ou seja, o dia ERRADO. Por isso
 * uma data pura é quebrada na mão e montada com o construtor local; só quando a
 * string traz hora/fuso explícito é que confiamos no parser nativo.
 */
function diaLocal(valor: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor.trim());
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const d = new Date(valor);
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Barra já posicionada: minutos desde o início da grade + faixa de empilhamento. */
interface Barra {
  item: ItemAgendado;
  inicioMin: number;
  fimMin: number;
  faixa: number;
}

interface Linha {
  id: string;
  nome: string;
  avatarUrl?: string | null;
  barras: Barra[];
  faixas: number;
}

export function AgendaTimeline({ itens, inicio, fim, agentes, onAbrir }: VistaProps) {
  // `onMover` existe no contrato mas não é usado aqui de propósito: em zoom de
  // quinzena um dia inteiro cabe em ~130px, então arrastar erraria o alvo em
  // horas. Mover compromisso é da vista de Mês (por dia) e de Semana (por hora).
  const [escala, setEscala] = useState<Escala>("semana");

  /**
   * "Hoje" só é resolvido no cliente. O HTML do servidor é gerado no fuso do
   * servidor (UTC em produção); calcular no render faria a coluna destacada
   * divergir entre servidor e cliente depois das 21h e quebrar a hidratação.
   */
  const [hoje, setHoje] = useState<Date | null>(null);
  useEffect(() => setHoje(new Date()), []);

  const pxPorHora = PX_POR_HORA[escala];
  const larguraDia = pxPorHora * 24;

  /** Só entra na grade o que TEM data. Item sem data mora no painel lateral. */
  const agendados = useMemo(
    () => itens.filter((i): i is ItemAgendado => i.data_hora !== null),
    [itens],
  );

  const dias = useMemo(() => {
    const ini = diaLocal(inicio);
    const f = diaLocal(fim);
    // +1 porque queremos as duas pontas visíveis na grade.
    const total = Math.min(MAX_DIAS, Math.max(1, diasEntre(ini, f) + 1));
    return Array.from({ length: total }, (_, i) =>
      // Avançamos pelo construtor local (e não somando ms) para que uma
      // eventual virada de horário de verão não empurre o dia em 1h.
      new Date(ini.getFullYear(), ini.getMonth(), ini.getDate() + i),
    );
  }, [inicio, fim]);

  /** Índice da coluna a partir da chave do dia — evita varrer o array por item. */
  const indicePorDia = useMemo(() => {
    const m = new Map<string, number>();
    dias.forEach((d, i) => m.set(chaveDia(d), i));
    return m;
  }, [dias]);

  const linhas = useMemo<Linha[]>(() => {
    // Uma linha por agente + a linha coringa "Sem responsável" no fim. Sem ela,
    // compromisso sem dono some da tela e a agenda mente sobre a carga real.
    const base: { id: string; nome: string; avatarUrl?: string | null }[] = [
      ...agentes.map((a) => ({ id: a.id, nome: a.nome, avatarUrl: a.avatarUrl })),
      { id: "__sem__", nome: "Sem responsável", avatarUrl: null },
    ];

    const porLinha = new Map<string, Barra[]>();
    for (const b of base) porLinha.set(b.id, []);

    for (const item of agendados) {
      const d = new Date(item.data_hora);
      const idx = indicePorDia.get(chaveDia(d));
      if (idx === undefined) continue; // fora do período exibido

      const chaveLinha =
        item.responsavel_id && porLinha.has(item.responsavel_id)
          ? item.responsavel_id
          : "__sem__";

      // Posição em minutos desde a meia-noite local do PRIMEIRO dia da grade.
      // Usamos o índice do dia + getHours/getMinutes locais em vez de subtrair
      // timestamps: assim o horário desenhado é sempre o horário de parede.
      // Dia inteiro ignora a hora gravada e ocupa as 24h da coluna: é isso que
      // ele significa para quem lê a ocupação da pessoa.
      const inicioMin = item.dia_inteiro
        ? idx * 1440
        : idx * 1440 + d.getHours() * 60 + d.getMinutes();
      const dur = item.dia_inteiro ? 1440 : Math.max(15, item.duracao_min || 30);
      porLinha.get(chaveLinha)?.push({
        item,
        inicioMin,
        fimMin: inicioMin + dur,
        faixa: 0,
      });
    }

    return base.map((b) => {
      const barras = (porLinha.get(b.id) ?? []).sort((x, y) => x.inicioMin - y.inicioMin);

      // Empilhamento: dois compromissos que se cruzam no tempo vão para faixas
      // diferentes. Sem isso um esconde o outro e a linha do tempo diz que a
      // pessoa está livre quando ela tem dois compromissos sobrepostos.
      const fimDaFaixa: number[] = [];
      for (const barra of barras) {
        let f = fimDaFaixa.findIndex((fimAtual) => fimAtual <= barra.inicioMin);
        if (f === -1) {
          f = fimDaFaixa.length;
          fimDaFaixa.push(barra.fimMin);
        } else {
          fimDaFaixa[f] = barra.fimMin;
        }
        barra.faixa = f;
      }

      return { ...b, barras, faixas: Math.max(1, fimDaFaixa.length) };
    });
  }, [agendados, agentes, indicePorDia]);

  const larguraGrade = dias.length * larguraDia;

  // Período vazio mantém as faixas por responsável — uma timeline sem barras
  // ainda comunica "todo mundo livre", que é informação útil.
  const periodoVazio = agendados.length === 0;

  return (
    <div className="rounded-lg border bg-card">
      <BarraZoom escala={escala} onEscala={setEscala} />
      {periodoVazio && (
        <p className="border-b bg-muted/30 px-4 py-2 text-xs text-muted-foreground">
          Ninguém com compromisso marcado no período.
        </p>
      )}

      {/* O contêiner é o único com scroll: é ele que faz `sticky` funcionar
          tanto na coluna de nomes (left) quanto no cabeçalho de datas (top). */}
      <div className="max-h-[70vh] overflow-auto">
        <div style={{ width: LARGURA_NOMES + larguraGrade, minWidth: "100%" }}>
          {/* Cabeçalho de datas */}
          <div className="sticky top-0 z-30 flex border-b bg-card">
            <div
              className="sticky left-0 z-40 flex shrink-0 items-center gap-1.5 border-r bg-card px-3 py-2 text-xs font-medium uppercase tracking-wide text-muted-foreground"
              style={{ width: LARGURA_NOMES }}
            >
              <UserRound size={13} /> Responsável
            </div>
            <div className="flex" style={{ width: larguraGrade }}>
              {dias.map((d) => {
                const eHoje = hoje ? mesmoDia(d, hoje) : false;
                return (
                  <div
                    key={d.getTime()}
                    className={`shrink-0 border-r px-1 py-2 text-center ${
                      eHoje ? "bg-arini/10" : ""
                    }`}
                    style={{ width: larguraDia }}
                  >
                    <div
                      className={`truncate text-[11px] uppercase ${
                        eHoje ? "font-semibold text-arini" : "text-muted-foreground"
                      }`}
                    >
                      {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </div>
                    <div
                      className={`truncate text-xs ${
                        eHoje ? "font-semibold text-arini" : "text-foreground"
                      }`}
                    >
                      {d.toLocaleDateString("pt-BR", {
                        day: "2-digit",
                        month: "2-digit",
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Linhas de responsáveis */}
          {linhas.map((linha) => {
            const altura = linha.faixas * (ALTURA_FAIXA + ESPACO_FAIXA) + ESPACO_FAIXA;
            return (
              <div key={linha.id} className="flex border-b last:border-b-0">
                <div
                  className="sticky left-0 z-20 flex shrink-0 items-center gap-2 border-r bg-card px-3 py-2"
                  style={{ width: LARGURA_NOMES }}
                >
                  <Avatar nome={linha.nome} url={linha.avatarUrl} />
                  <span
                    className={`truncate text-sm ${
                      linha.id === "__sem__"
                        ? "italic text-muted-foreground"
                        : "font-medium text-arini"
                    }`}
                    title={linha.nome}
                  >
                    {linha.nome}
                  </span>
                  {linha.barras.length > 0 && (
                    <span className="ml-auto shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                      {linha.barras.length}
                    </span>
                  )}
                </div>

                <div className="relative" style={{ width: larguraGrade, height: altura }}>
                  {/* Fundo: uma faixa por dia, com destaque no dia de hoje. */}
                  {dias.map((d, i) => (
                    <div
                      key={d.getTime()}
                      className={`absolute bottom-0 top-0 border-r ${
                        hoje && mesmoDia(d, hoje) ? "bg-arini/[0.06]" : ""
                      }`}
                      style={{ left: i * larguraDia, width: larguraDia }}
                    />
                  ))}

                  {linha.barras.map((b) => {
                    const largura = Math.max(6, ((b.fimMin - b.inicioMin) / 60) * pxPorHora);
                    const cor = corDoItem(b.item);
                    const detalhe = detalheDoItem(b.item, linha.nome);

                    return (
                      <button
                        key={b.item.id}
                        type="button"
                        title={detalhe}
                        onClick={() => onAbrir?.(b.item)}
                        className="absolute flex items-center gap-1 overflow-hidden rounded-md px-1.5 text-left text-[11px] leading-none text-white shadow-sm ring-1 ring-black/10 transition hover:brightness-110 focus:outline-none focus:ring-2 focus:ring-arini"
                        style={{
                          left: (b.inicioMin / 60) * pxPorHora,
                          width: largura,
                          top: ESPACO_FAIXA + b.faixa * (ALTURA_FAIXA + ESPACO_FAIXA),
                          height: ALTURA_FAIXA,
                          backgroundColor: cor,
                          // Cancelado fica translúcido: continua ocupando espaço
                          // visual (o horário existiu) mas não compete com o ativo.
                          opacity: b.item.status === "cancelado" ? 0.45 : 1,
                        }}
                      >
                        {/* Só cabe texto quando o zoom dá largura; senão vira só cor. */}
                        {largura > 56 && (
                          <>
                            <span className="shrink-0 font-semibold tabular-nums">
                              {b.item.dia_inteiro
                                ? "Dia"
                                : formatarHora(b.item.data_hora)}
                            </span>
                            <span className="truncate opacity-90">{b.item.titulo}</span>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function detalheDoItem(item: ItemAgendado, responsavel: string): string {
  const quando = item.dia_inteiro
    ? "Dia inteiro"
    : formatarIntervalo(item.data_hora, item.duracao_min);
  return [
    `${quando} — ${item.titulo}`,
    `${AGENDA_TIPO_LABELS[item.tipo]} · ${AGENDA_STATUS_LABELS[item.status]}`,
    `Responsável: ${responsavel}`,
    item.local ? `Local: ${item.local}` : null,
    item.lead_nome ? `Lead: ${item.lead_nome}` : null,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Avatar circular do responsável: foto quando existe, iniciais quando não. */
function Avatar({ nome, url }: { nome: string; url?: string | null }) {
  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={url}
        alt={nome}
        className="h-6 w-6 shrink-0 rounded-full object-cover ring-1 ring-black/10"
      />
    );
  }
  return (
    <span
      className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-arini/10 text-[10px] font-semibold text-arini ring-1 ring-arini/20"
      title={nome}
    >
      {iniciais(nome)}
    </span>
  );
}

function BarraZoom({
  escala,
  onEscala,
}: {
  escala: Escala;
  onEscala: (e: Escala) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 border-b px-3 py-2">
      <span className="text-xs text-muted-foreground">Ocupação por responsável</span>
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-muted-foreground">Zoom</span>
        {(Object.keys(PX_POR_HORA) as Escala[]).map((e) => (
          <button
            key={e}
            type="button"
            onClick={() => onEscala(e)}
            className={`rounded-md border px-2 py-1 text-xs transition ${
              escala === e
                ? "border-arini bg-arini text-white"
                : "bg-white text-foreground hover:bg-muted"
            }`}
          >
            {ESCALA_LABEL[e]}
          </button>
        ))}
      </div>
    </div>
  );
}
