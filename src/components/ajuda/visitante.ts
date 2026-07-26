// =====================================================================
// Identidade anônima do visitante do portal.
//
// Guardamos um token aleatório no localStorage do navegador e NUNCA o IP:
// o objetivo é só "já votou neste artigo?" e "não conte a mesma visita duas
// vezes". Um IP identificaria a pessoa (dado pessoal, LGPD) sem melhorar
// nada nessa conta. O token não é ligado a nenhum cadastro, some se o
// visitante limpar o navegador, e é isso mesmo que queremos.
// =====================================================================

const CHAVE_TOKEN = "arini_ajuda_visitante";

function novoToken(): string {
  // crypto.randomUUID não existe em contexto inseguro (http://ip) nem em
  // navegadores antigos — o fallback só precisa evitar colisão prática.
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `v-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

/** Lê (ou cria) o token do visitante. Só pode ser chamada no navegador. */
export function obterVisitanteToken(): string {
  try {
    const existente = window.localStorage.getItem(CHAVE_TOKEN);
    if (existente) return existente;
    const token = novoToken();
    window.localStorage.setItem(CHAVE_TOKEN, token);
    return token;
  } catch {
    // Modo privado / storage bloqueado: seguimos com um token efêmero em vez
    // de derrubar a página — o voto ainda funciona, só não é lembrado.
    return novoToken();
  }
}

export function jaVotou(articleId: string): boolean {
  try {
    return window.localStorage.getItem(`arini_ajuda_voto_${articleId}`) !== null;
  } catch {
    return false;
  }
}

export function marcarComoVotado(articleId: string): void {
  try {
    window.localStorage.setItem(`arini_ajuda_voto_${articleId}`, "1");
  } catch {
    /* storage indisponível — o servidor ainda deduplica pelo token */
  }
}

/**
 * Marca a visualização como já contada NESTA sessão e devolve `true` se era
 * a primeira vez. sessionStorage (e não localStorage) porque uma volta ao
 * artigo semanas depois é uma visita nova e legítima.
 */
export function marcarVisualizacaoDaSessao(articleId: string): boolean {
  const chave = `arini_ajuda_view_${articleId}`;
  try {
    if (window.sessionStorage.getItem(chave)) return false;
    window.sessionStorage.setItem(chave, "1");
    return true;
  } catch {
    return false;
  }
}
