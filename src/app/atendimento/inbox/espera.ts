import type { Conversation } from "@/lib/types";

// =====================================================================
// Tempo de espera na CAIXA CENTRAL.
//
// Na caixa central a métrica que importa não é "última atividade" (a
// coluna que ordena o resto do inbox) e sim HÁ QUANTO TEMPO O CLIENTE
// ESTÁ SEM RESPOSTA HUMANA. Uma conversa que chegou às 8h e recebeu 4
// mensagens do cliente até as 9h tem "última atividade: agora" e uma hora
// de abandono — o número que precisa aparecer em vermelho.
// =====================================================================

/** Acima disto a espera vira problema visível (vermelho na lista). */
export const LIMITE_ESPERA_MIN = 15;

/**
 * Desde quando a conversa espera triagem. `waiting_since` é preenchido
 * pelo SLA quando o cliente escreve; `created_at` é o piso — a conversa
 * nunca esperou menos do que existe.
 */
export function esperandoDesde(c: Conversation): string {
  return c.waiting_since ?? c.created_at;
}

export function minutosEsperando(c: Conversation): number {
  const ms = Date.now() - new Date(esperandoDesde(c)).getTime();
  return Math.max(0, Math.floor(ms / 60000));
}

/** "4 min", "2 h 10", "3 d" — curto o bastante para caber na lista. */
export function formatarEspera(min: number): string {
  if (min < 1) return "agora";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  if (h < 24) return resto ? `${h} h ${resto}` : `${h} h`;
  const d = Math.floor(h / 24);
  return `${d} d`;
}

export function esperaCritica(min: number): boolean {
  return min >= LIMITE_ESPERA_MIN;
}
