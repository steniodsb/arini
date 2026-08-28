// =====================================================================
// Cálculo de horas do ponto.
//
// Estava dentro de `app/admin/ponto/page.tsx`, onde só a própria página
// alcançava. Saiu para cá quando nasceu o relatório individual: duas
// cópias da regra de "quanto a pessoa trabalhou" divergiriam no primeiro
// ajuste, e o relatório é justamente o lugar onde a divergência apareceria
// como acusação de hora faltando.
// =====================================================================

import type { TimeEntry, TimeEntryType, Colaborador } from "./types";

export function fmtHours(ms: number): string {
  if (ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/** Igual a fmtHours, mas com sinal — para saldo, onde "-1h30" é a informação. */
export function fmtSaldo(ms: number): string {
  if (Math.abs(ms) < 60000) return "0h00";
  const sinal = ms < 0 ? "-" : "+";
  return sinal + fmtHours(Math.abs(ms));
}

/**
 * Horas de um dia: (última saída − primeira entrada) menos o intervalo
 * (primeiro início → último fim). Dia sem saída conta até agora.
 */
export function workedMs(entries: TimeEntry[]): { ms: number; aberto: boolean } {
  const sorted = [...entries].sort(
    (a, b) => +new Date(a.registrado_em) - +new Date(b.registrado_em),
  );
  const first = (t: TimeEntryType) => sorted.find((e) => e.tipo === t);
  const last = (t: TimeEntryType) => [...sorted].reverse().find((e) => e.tipo === t);
  const entrada = first("entrada");
  if (!entrada) return { ms: 0, aberto: false };
  const saida = last("saida");
  const fim = saida ? +new Date(saida.registrado_em) : Date.now();
  let ms = fim - +new Date(entrada.registrado_em);
  const pIni = first("intervalo_inicio");
  const pFim = last("intervalo_fim");
  if (pIni && pFim && +new Date(pFim.registrado_em) > +new Date(pIni.registrado_em)) {
    ms -= +new Date(pFim.registrado_em) - +new Date(pIni.registrado_em);
  }
  return { ms: Math.max(0, ms), aberto: !saida };
}

/** Chave "dd/mm/aaaa" — a mesma que a tela mostra, para bater com o olho. */
export function groupByDay(entries: TimeEntry[]): Record<string, TimeEntry[]> {
  const byDay: Record<string, TimeEntry[]> = {};
  for (const e of entries) {
    const key = new Date(e.registrado_em).toLocaleDateString("pt-BR");
    (byDay[key] = byDay[key] ?? []).push(e);
  }
  return byDay;
}

/**
 * Quantos dias de escala caem no período — o denominador do "cumpriu ou
 * não". Conta pelos dias da SEMANA do colaborador, não por dias corridos:
 * quem trabalha seg–sex não deve horas pelo domingo.
 *
 * Feriado não entra na conta (o sistema não tem calendário de feriados).
 * Um feriado no meio do mês aparece como saldo negativo de um dia — está
 * documentado aqui para ninguém tratar isso como bug depois.
 */
export function diasDeEscalaNoPeriodo(dias: number[], de: Date, ate: Date): number {
  const set = new Set(dias);
  let n = 0;
  const cur = new Date(de.getFullYear(), de.getMonth(), de.getDate());
  const fim = new Date(ate.getFullYear(), ate.getMonth(), ate.getDate());
  while (cur <= fim) {
    if (set.has(cur.getDay())) n++;
    cur.setDate(cur.getDate() + 1);
  }
  return n;
}

export type ResumoPonto = {
  trabalhadoMs: number;
  esperadoMs: number;
  saldoMs: number;
  diasComRegistro: number;
  diasDeEscala: number;
  diasEmAberto: number;
  porDia: { dia: string; ms: number; aberto: boolean; regs: number }[];
};

/** O relatório individual: quanto era esperado, quanto foi feito, e a diferença. */
export function resumoDoPeriodo(
  entries: TimeEntry[],
  colaborador: Pick<Colaborador, "carga_horaria_min" | "dias_semana">,
  de: Date,
  ate: Date,
): ResumoPonto {
  const byDay = groupByDay(entries);
  const porDia = Object.entries(byDay)
    .map(([dia, list]) => ({ dia, ...workedMs(list), regs: list.length }))
    // "dd/mm/aaaa" não ordena como string; vira Date para ordenar.
    .sort((a, b) => {
      const p = (s: string) => { const [d, m, y] = s.split("/").map(Number); return +new Date(y, m - 1, d); };
      return p(b.dia) - p(a.dia);
    });

  const trabalhadoMs = porDia.reduce((s, d) => s + d.ms, 0);
  const diasDeEscala = diasDeEscalaNoPeriodo(colaborador.dias_semana, de, ate);
  const esperadoMs = diasDeEscala * colaborador.carga_horaria_min * 60_000;

  return {
    trabalhadoMs,
    esperadoMs,
    saldoMs: trabalhadoMs - esperadoMs,
    diasComRegistro: porDia.length,
    diasDeEscala,
    diasEmAberto: porDia.filter((d) => d.aberto).length,
    porDia,
  };
}

/** "8h00" a partir dos minutos guardados em `carga_horaria_min`. */
export function fmtCarga(min: number): string {
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, "0")}`;
}
