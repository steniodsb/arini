// =====================================================================
// Fuso horário do app: TUDO que vira texto para o usuário é America/Sao_Paulo.
//
// Por que este arquivo existe: o banco guarda instantes em `timestamptz`
// (correto), mas quem FORMATAVA era o `toLocaleString()` sem `timeZone` —
// que usa o fuso de quem está rodando. No navegador do Brasil dá certo por
// acidente; no servidor (Vercel/Node roda em UTC) dá +3h. Foi assim que a
// batida de 10:25 apareceu como 13:25 na tela do Ponto e das Movimentações.
//
// Regra: nenhuma tela usa `toLocaleString`/`toLocaleDateString` direto num
// instante do banco. Usa os helpers daqui, que fixam o fuso e por isso dão o
// MESMO resultado no servidor, no navegador e em qualquer máquina.
// =====================================================================

export const TZ_BR = "America/Sao_Paulo";

/** Data pura ("2026-09-10"), sem hora — não pode virar `new Date()` cru. */
const SO_DATA = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Quanto o relógio de São Paulo está adiantado em relação ao UTC, em ms,
 * NAQUELE instante. Hoje é fixo (−3h, o Brasil não tem mais horário de
 * verão), mas se voltar a ter, a conta continua certa sozinha.
 */
export function offsetBR(d: Date = new Date()): number {
  try {
    const nome = new Intl.DateTimeFormat("en-US", { timeZone: TZ_BR, timeZoneName: "longOffset" })
      .formatToParts(d)
      .find((p) => p.type === "timeZoneName")?.value;
    const m = nome ? /GMT([+-])(\d{2}):(\d{2})/.exec(nome) : null;
    if (!m) return -3 * 3_600_000;
    return (m[1] === "-" ? -1 : 1) * (Number(m[2]) * 3_600_000 + Number(m[3]) * 60_000);
  } catch {
    return -3 * 3_600_000;
  }
}

/**
 * Aceita o que vem do banco: `timestamptz` ISO, Date, ou coluna `date`.
 * Para coluna `date` ("2026-09-10") devolve o meio-dia de SP daquele dia —
 * meio-dia porque aí nenhuma formatação consegue virar o dia para trás ou
 * para frente. `new Date("2026-09-10")` seria meia-noite UTC = 21:00 do dia
 * ANTERIOR em São Paulo, que é o bug clássico de "venceu um dia antes".
 */
export function paraInstante(valor: string | number | Date | null | undefined): Date | null {
  if (valor == null || valor === "") return null;
  if (valor instanceof Date) return isNaN(+valor) ? null : valor;
  if (typeof valor === "number") return new Date(valor);
  const so = SO_DATA.exec(valor);
  if (so) return emSaoPaulo(valor, 12, 0, 0, 0);
  const d = new Date(valor);
  return isNaN(+d) ? null : d;
}

/**
 * O instante em que o relógio de São Paulo marca essa data e hora.
 * `emSaoPaulo("2026-09-01", 0, 0)` → 2026-09-01T03:00:00Z.
 */
export function emSaoPaulo(isoDia: string, h = 0, min = 0, s = 0, ms = 0): Date {
  const [y, m, d] = isoDia.split("-").map(Number);
  const chute = Date.UTC(y, m - 1, d, h, min, s, ms);
  return new Date(chute - offsetBR(new Date(chute)));
}

/** Partes do relógio de São Paulo naquele instante. */
function partesBR(d: Date) {
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ_BR,
    year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const get = (t: string) => p.find((x) => x.type === t)?.value ?? "00";
  return { ano: get("year"), mes: get("month"), dia: get("day"), hora: get("hour"), min: get("minute") };
}

/** "2026-09-10" — o dia em São Paulo, para filtros e `<input type="date">`. */
export function isoDiaBR(d: Date = new Date()): string {
  const { ano, mes, dia } = partesBR(d);
  return `${ano}-${mes}-${dia}`;
}

/** Primeiro instante do dia em São Paulo. */
export function inicioDoDiaBR(dia: string | Date = new Date()): Date {
  return emSaoPaulo(typeof dia === "string" ? dia : isoDiaBR(dia), 0, 0, 0, 0);
}

/** Último instante do dia em São Paulo (23:59:59.999). */
export function fimDoDiaBR(dia: string | Date = new Date()): Date {
  return emSaoPaulo(typeof dia === "string" ? dia : isoDiaBR(dia), 23, 59, 59, 999);
}

/** Primeiro instante do mês em São Paulo — o "mês atual" do Ponto. */
export function inicioDoMesBR(ref: Date = new Date()): Date {
  const { ano, mes } = partesBR(ref);
  return emSaoPaulo(`${ano}-${mes}-01`, 0, 0, 0, 0);
}

/** Instante N dias atrás, contado a partir da meia-noite de SP. */
export function inicioDeDiasAtrasBR(dias: number, ref: Date = new Date()): Date {
  return new Date(inicioDoDiaBR(ref).getTime() - dias * 86_400_000);
}

/**
 * "aaaa-mm-dd" do primeiro dia do mês em São Paulo, opcionalmente N meses
 * atrás. É o formato que as colunas `date` do banco esperam.
 */
export function primeiroDiaDoMesBR(mesesAtras = 0, ref: Date = new Date()): string {
  const { ano, mes } = partesBR(ref);
  const d = new Date(Date.UTC(Number(ano), Number(mes) - 1 - mesesAtras, 1, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

/** "aaaa-mm-dd" do último dia do mês em São Paulo. */
export function ultimoDiaDoMesBR(ref: Date = new Date()): string {
  const { ano, mes } = partesBR(ref);
  const d = new Date(Date.UTC(Number(ano), Number(mes), 0, 12));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

/** Dia da semana (0 = domingo) no calendário de São Paulo. */
export function diaSemanaBR(d: Date): number {
  const nome = new Intl.DateTimeFormat("en-US", { timeZone: TZ_BR, weekday: "short" }).format(d);
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(nome.slice(0, 3));
}

/** Meia-noite de SP do dia seguinte — anda no calendário sem depender do fuso local. */
export function proximoDiaBR(d: Date): Date {
  return inicioDoDiaBR(new Date(inicioDoDiaBR(d).getTime() + 26 * 3_600_000));
}

/** "10/09/2026" no relógio de São Paulo. Serve de chave de dia também. */
export function fmtDiaBR(valor: string | number | Date | null | undefined): string {
  const d = paraInstante(valor);
  if (!d) return "—";
  const { ano, mes, dia } = partesBR(d);
  return `${dia}/${mes}/${ano}`;
}

/** "10/09/2026, 10:25" no relógio de São Paulo. */
export function fmtDataHoraBR(valor: string | number | Date | null | undefined): string {
  const d = paraInstante(valor);
  if (!d) return "—";
  const { ano, mes, dia, hora, min } = partesBR(d);
  return `${dia}/${mes}/${ano}, ${hora}:${min}`;
}

/** "10:25" no relógio de São Paulo. */
export function fmtHoraBR(valor: string | number | Date | null | undefined): string {
  const d = paraInstante(valor);
  if (!d) return "—";
  const { hora, min } = partesBR(d);
  return `${hora}:${min}`;
}

/**
 * `toLocaleDateString`/`toLocaleString` com o fuso já fixado — para os casos
 * com opções próprias (mês por extenso, dia da semana, etc.).
 */
export function fmtBR(
  valor: string | number | Date | null | undefined,
  opts: Intl.DateTimeFormatOptions,
): string {
  const d = paraInstante(valor);
  if (!d) return "—";
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ_BR, ...opts }).format(d);
}
