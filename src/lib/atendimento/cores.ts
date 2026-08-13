// =====================================================================
// Paletas do Atendimento.
//
// Uma paleta troca DUAS coisas: a cor de ação (botão, link, foco) e a
// bolha da mensagem enviada. Nada mais. Fundo, texto e bordas continuam
// neutros — branco no tema claro, quase-preto no escuro — e a sidebar
// continua verde Arini em qualquer paleta.
//
// A cor efetiva sai de três camadas, nesta ordem:
//   1. `profiles.atendimento_cor`        — a escolha do agente
//   2. `atendimento_settings.cor_padrao` — o padrão da conta (diretoria)
//   3. PALETA_PADRAO                     — o fallback do código
//
// Os hex daqui são só para os quadradinhos de amostra na tela; quem
// pinta a interface é o CSS (`globals.css`, seletor `[data-cor="…"]`).
// Se mudar um, mude o outro.
// =====================================================================

export type PaletaAtendimento =
  | "whatsapp"
  | "verde_arini"
  | "grafite"
  | "azul"
  | "dourado";

export const PALETA_PADRAO: PaletaAtendimento = "whatsapp";

export type AmostraPaleta = {
  /** Cor de botão/link. */
  acao: string;
  /** Bolha da mensagem enviada. */
  bolha: string;
  /** Bolha da mensagem recebida — contexto para a amostra não mentir. */
  recebida: string;
  /** Fundo da thread. */
  fundo: string;
};

export const PALETAS: {
  chave: PaletaAtendimento;
  nome: string;
  descricao: string;
  claro: AmostraPaleta;
  escuro: AmostraPaleta;
}[] = [
  {
    chave: "whatsapp",
    nome: "WhatsApp",
    descricao: "As cores do próprio WhatsApp. Quem atende reconhece na hora.",
    claro: { acao: "#008069", bolha: "#D9FDD3", recebida: "#FFFFFF", fundo: "#EFEAE2" },
    escuro: { acao: "#00A884", bolha: "#005C4B", recebida: "#202C33", fundo: "#0B141A" },
  },
  {
    chave: "verde_arini",
    nome: "Verde Arini",
    descricao: "O verde da marca também nos botões e nas suas mensagens.",
    claro: { acao: "#0E3622", bolha: "#0E3622", recebida: "#FFFFFF", fundo: "#EFEAE2" },
    escuro: { acao: "#3B9367", bolha: "#1E4934", recebida: "#202C33", fundo: "#0B141A" },
  },
  {
    chave: "grafite",
    nome: "Grafite",
    descricao: "Sem cor nenhuma além da sidebar: preto no claro, branco no escuro.",
    claro: { acao: "#1C1C1C", bolha: "#212121", recebida: "#FFFFFF", fundo: "#EFEAE2" },
    escuro: { acao: "#F5F5F5", bolha: "#37373D", recebida: "#202C33", fundo: "#0B141A" },
  },
  {
    chave: "azul",
    nome: "Azul",
    descricao: "Azul de aplicativo de mensagem — separa bem quem falou o quê.",
    claro: { acao: "#1D4FD8", bolha: "#1D4FD8", recebida: "#FFFFFF", fundo: "#EFEAE2" },
    escuro: { acao: "#3B82F6", bolha: "#25457E", recebida: "#202C33", fundo: "#0B141A" },
  },
  {
    chave: "dourado",
    nome: "Dourado (anterior)",
    descricao: "O visual que o atendimento tinha antes, com bolha dourada.",
    claro: { acao: "#092316", bolha: "#092316", recebida: "#FFFFFF", fundo: "#EFEAE2" },
    escuro: { acao: "#F8BF32", bolha: "#F8BF32", recebida: "#202C33", fundo: "#0B141A" },
  },
];

const CHAVES = new Set<string>(PALETAS.map((p) => p.chave));

/** Aceita o que vier do banco (inclusive lixo antigo) sem quebrar a tela. */
export function paletaValida(valor: unknown): PaletaAtendimento | null {
  return typeof valor === "string" && CHAVES.has(valor)
    ? (valor as PaletaAtendimento)
    : null;
}

/** Agente > conta > padrão do código. */
export function corEfetiva(
  doAgente: unknown,
  daConta: unknown,
): PaletaAtendimento {
  return paletaValida(doAgente) ?? paletaValida(daConta) ?? PALETA_PADRAO;
}

export function nomeDaPaleta(chave: PaletaAtendimento): string {
  return PALETAS.find((p) => p.chave === chave)?.nome ?? chave;
}

/** Chave do localStorage — espelha a do tema (ver ThemeProvider). */
export const COR_STORAGE_KEY = "arini-atendimento-cor";

/** "auto" = sem escolha pessoal, segue o padrão da conta. */
export type EscolhaAgente = PaletaAtendimento | "auto";

/** Pinta agora, sem esperar recarregar a página. */
export function aplicarCorNoDocumento(cor: PaletaAtendimento): void {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-cor", cor);
}

/**
 * Guarda a escolha do agente no navegador. É o que evita o pisca-pisca:
 * o script inline do <head> lê daqui antes da hidratação. O banco continua
 * sendo a fonte da verdade entre navegadores.
 */
export function guardarEscolhaDoAgente(escolha: EscolhaAgente): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COR_STORAGE_KEY, escolha);
}

/** O que este navegador tem guardado (null quando nunca escolheram). */
export function escolhaGuardada(): EscolhaAgente | null {
  if (typeof window === "undefined") return null;
  const v = window.localStorage.getItem(COR_STORAGE_KEY);
  if (v === "auto") return "auto";
  return paletaValida(v);
}
