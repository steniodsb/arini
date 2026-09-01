import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrencyBRL(value: number | null | undefined) {
  if (value == null) return "—";
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatDateBR(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
  }).format(date);
}

export function formatDateTimeBR(d: string | Date | null | undefined) {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(date);
}

/**
 * Extrai uma mensagem legível de qualquer erro — inclusive dos erros do
 * Supabase/Postgrest, que são objetos simples ({message, details, hint, code})
 * e NÃO instâncias de Error (o que faz `String(e)` virar "[object Object]").
 */
export function errMessage(e: unknown): string {
  if (e == null) return "Erro desconhecido.";
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  if (typeof e === "object") {
    const o = e as Record<string, unknown>;
    const parts = [o.message, o.details, o.hint]
      .filter((p): p is string => typeof p === "string" && p.length > 0);
    if (parts.length) return parts.join(" — ");
    try {
      return JSON.stringify(e);
    } catch {
      return "Erro desconhecido.";
    }
  }
  return String(e);
}

/**
 * Unidade da área total conforme o tipo do imóvel.
 *
 * O cadastro sempre pediu HECTARE para terra ("Área total (ha)" em
 * NovaCaptacaoForm), mas a regra vivia só naquele formulário: todo lugar que
 * EXIBIA a área escrevia "m²" fixo. Uma fazenda de 147,62 ha aparecia como
 * "147,62 m²" — no detalhe do imóvel, no card e no anúncio público.
 *
 * A regra é a mesma de `caracConfig` no formulário de captação; se um tipo
 * novo entrar lá, entra aqui também.
 */
export function unidadeArea(type: string): "ha" | "m²" {
  return ["rural", "terreno", "fazenda", "sitio", "chacara", "rancho"].includes(type) ? "ha" : "m²";
}

/** Área já formatada com a unidade certa para o tipo. */
export function formatArea(valor: number | null | undefined, type: string) {
  if (valor == null) return null;
  return `${valor.toLocaleString("pt-BR", { maximumFractionDigits: 2 })} ${unidadeArea(type)}`;
}
