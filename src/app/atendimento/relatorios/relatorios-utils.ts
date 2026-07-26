import type { CSSProperties } from "react";
import type { AgentAvailability, ConversationChannel } from "@/lib/types";

// =====================================================================
// Helpers compartilhados pelas abas NOVAS de relatório ("Ao vivo" e
// "Bots").
//
// Por que um módulo à parte, e não reaproveitar o que já existe dentro de
// `RelatoriosPanel.tsx`: aquele arquivo IMPORTA estas abas. Se as abas
// importassem helpers de volta de lá, teríamos import circular — que o
// bundler até tolera, mas quebra de forma silenciosa e difícil de
// diagnosticar quando a ordem de avaliação muda. Duplicar 60 linhas de
// formatação é mais barato do que esse risco.
//
// As definições aqui espelham as de `RelatoriosPanel.tsx` de propósito:
// os dois relatórios precisam mostrar "1 h 12 min" e "12,5%" exatamente
// do mesmo jeito.
// =====================================================================

// ===== Paleta e estilo dos gráficos ==================================

// Mesma paleta fixa do painel principal — escolhida para ter contraste
// suficiente no tema claro E no escuro.
export const PALETA = [
  "#10b981", "#3b82f6", "#a855f7", "#f59e0b",
  "#ef4444", "#14b8a6", "#ec4899", "#6366f1", "#84cc16",
];

export const COR_EIXO = "hsl(var(--muted-foreground))";
export const COR_GRADE = "hsl(var(--border))";

export const ESTILO_TOOLTIP: CSSProperties = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  fontSize: 12,
};

// ===== Números e durações ============================================

/** Média que devolve null (e não 0) quando não há amostra — evita "0" mentiroso. */
export function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

/** Percentual com divisão por zero tratada: sem base, o resultado é 0, não NaN. */
export function percentual(parte: number, total: number): number {
  return total > 0 ? (parte / total) * 100 : 0;
}

export function numeroBr(valor: number, casas = 1): string {
  return valor.toLocaleString("pt-BR", {
    minimumFractionDigits: casas,
    maximumFractionDigits: casas,
  });
}

/**
 * Duração legível em português a partir de minutos.
 * "45 min", "1 h 12 min", "2 d 3 h". Nulo/negativo vira "—" porque
 * tempo negativo aqui só existe por dado sujo (relógio invertido).
 */
export function formatarDuracao(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 0) return "—";
  if (minutos < 1) return "menos de 1 min";
  const total = Math.round(minutos);
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const min = total % 60;
  if (dias > 0) return horas > 0 ? `${dias} d ${horas} h` : `${dias} d`;
  if (horas > 0) return min > 0 ? `${horas} h ${min} min` : `${horas} h`;
  return `${min} min`;
}

export function duracaoOuTraco(minutos: number | null): string {
  return minutos === null ? "—" : formatarDuracao(minutos);
}

/** Minutos entre dois instantes ISO. Nulo quando falta um lado ou o intervalo é negativo. */
export function minutosEntre(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null;
  const a = new Date(inicioIso).getTime();
  const b = new Date(fimIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = (b - a) / 60_000;
  return diff >= 0 ? diff : null;
}

/**
 * Cronômetro do painel ao vivo: "há 12 s", "há 3 min", "há 2 h 10 min".
 * Recebe `agoraMs` de fora justamente para que TODOS os contadores da
 * tela avancem no mesmo tique — se cada um chamasse Date.now() sozinho,
 * dois relógios lado a lado piscariam fora de sincronia.
 */
export function tempoDecorrido(desdeIso: string | null, agoraMs: number): string {
  if (!desdeIso) return "—";
  const t = new Date(desdeIso).getTime();
  if (!Number.isFinite(t)) return "—";
  const segundos = Math.max(0, Math.floor((agoraMs - t) / 1000));
  if (segundos < 60) return `${segundos} s`;
  const min = Math.floor(segundos / 60);
  if (min < 60) return `${min} min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  if (horas < 24) return resto > 0 ? `${horas} h ${resto} min` : `${horas} h`;
  const dias = Math.floor(horas / 24);
  return `${dias} d ${horas % 24} h`;
}

// ===== Datas (sempre no fuso local do navegador) =====================

export function chaveDia(d: Date): string {
  const mes = `${d.getMonth() + 1}`.padStart(2, "0");
  const dia = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

export function rotuloDia(chave: string): string {
  const [, mes, dia] = chave.split("-");
  return `${dia}/${mes}`;
}

// ===== Exportação CSV ================================================

export type CelulaCsv = string | number | null;

function campoCsv(valor: CelulaCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") {
    return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(".", ",");
  }
  const texto = String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Gera e baixa o CSV no próprio navegador. BOM + ";" para o Excel pt-BR abrir certo. */
export function baixarCsv(nomeArquivo: string, linhas: CelulaCsv[][]) {
  const texto = linhas.map((linha) => linha.map(campoCsv).join(";")).join("\r\n");
  const blob = new Blob([`﻿${texto}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// =====================================================================
// Contrato do painel AO VIVO
//
// Os tipos moram aqui (e não no `route.ts`) porque tanto a rota quanto o
// componente cliente precisam deles, e um `route.ts` do App Router deve
// exportar só os handlers HTTP e a config conhecida do Next.
// =====================================================================

/** Um agente com acesso ao atendimento e a carga que ele tem AGORA. */
export type AoVivoAgente = {
  id: string;
  nome: string;
  disponibilidade: AgentAvailability;
  /** Conversas com status "aberta" onde ele é o responsável. */
  abertas: number;
  /** Conversas "pendente" — não somam na carga, mas contam a história. */
  pendentes: number;
};

export type AoVivoCanal = {
  canal: ConversationChannel;
  abertas: number;
};

/** Mensagem recebida agora há pouco — alimenta o "Entrando agora". */
export type AoVivoEntrada = {
  id: string;
  conversationId: string;
  contato: string;
  canal: ConversationChannel | null;
  trecho: string;
  criadaEm: string;
};

/** A conversa aberta há mais tempo que ninguém respondeu. */
export type AoVivoEspera = {
  id: string;
  contato: string;
  canal: ConversationChannel | null;
  criadaEm: string;
  /** Prazo de 1ª resposta herdado da caixa (0033). Nulo = caixa sem SLA. */
  slaPrimeiraRespostaEm: string | null;
};

export type AoVivoSnapshot = {
  /** Carimbo do servidor — é a "hora da última atualização" mostrada na tela. */
  agora: string;
  abertas: number;
  naoAtribuidas: number;
  pendentes: number;
  aguardandoPrimeiraResposta: number;
  maisAntigaSemResposta: AoVivoEspera | null;
  agentes: AoVivoAgente[];
  canais: AoVivoCanal[];
  entrando: AoVivoEntrada[];
  /**
   * A varredura por agente/canal foi truncada pelo teto de linhas?
   * Quando true a tela avisa que os quadros de carga são aproximados —
   * os CONTADORES grandes continuam exatos (vêm de count/head).
   */
  amostraTruncada: boolean;
};
