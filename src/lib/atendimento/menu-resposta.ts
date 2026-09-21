// =====================================================================
// MENU DE RAMAIS — a parte PURA: ler a resposta do cliente e montar o
// texto do menu.
//
// Separada de `menu.ts` de propósito. Lá dentro há Supabase, envio pelo
// canal e escrita no banco; aqui não há nada disso, e é justamente esta
// metade que precisa de teste minucioso — interpretar errado manda o
// cliente para o setor errado, e ele só descobre depois de contar o caso
// inteiro para quem não é do assunto.
//
// (`scripts/testes/menu-ramais.mjs` importa este arquivo direto.)
// =====================================================================

export interface OpcaoMenu {
  id: string;
  chave: string;
  rotulo: string;
  team_id?: string | null;
  responsavel_id?: string | null;
  etiqueta?: string | null;
  confirmacao?: string | null;
}

/** Sem acento e em minúsculas, para comparar o que o cliente escreveu. */
function dobrar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Palavras que as pessoas põem em volta do número sem mudar o sentido:
 * "quero a 2", "opção 3", "o 5 por favor". Tudo já sem acento.
 *
 * Só isto sai. Qualquer outra palavra que sobre significa que a mensagem
 * fala de outra coisa — ver a regra 2 de `interpretarResposta`.
 */
const ENCHIMENTO = new Set([
  "a", "o", "as", "os", "um", "uma",
  "opcao", "opcoes", "numero", "n", "item", "alternativa",
  "quero", "queria", "gostaria", "prefiro", "escolho", "escolha", "seria", "e", "eh",
  "por", "favor", "pf", "pfv", "obrigado", "obrigada", "ok", "sim",
  "de", "do", "da", "no", "na", "em",
]);

/**
 * Qual opção o cliente escolheu — ou null.
 *
 * O CUIDADO QUE DEFINE ESTA FUNÇÃO: não basta procurar um dígito no
 * texto. "Meu CPF é 123..." tem um "1" dentro, e roteá-lo para o ramal 1
 * é pior do que não entender. Por isso só três formas contam:
 *
 *   1. a mensagem É a chave ("1", "1.", "1️⃣");
 *   2. tirando as palavras de enchimento, sobra EXATAMENTE a chave
 *      ("opção 1", "quero a 2", "o 5 por favor");
 *   3. a mensagem cita o rótulo do ramal ("locação e administração").
 *
 * A regra 2 já foi "mensagem curta com um dígito dentro", e estava errada:
 * "2 quartos" tem nove caracteres e um dígito solto, é uma frase que
 * cliente de imobiliária manda o tempo todo, e iria para o ramal 2.
 * Exigir que NADA sobre além do número é o que separa uma resposta de
 * menu de uma frase que por acaso tem número.
 *
 * Qualquer outra coisa é "não entendi" — que repete o menu, custa uma
 * mensagem e não manda ninguém para o setor errado. Na dúvida, o erro
 * barato é não entender.
 */
export function interpretarResposta(
  texto: string | null | undefined,
  opcoes: OpcaoMenu[],
): OpcaoMenu | null {
  // Emoji de tecla ("1️⃣") é o dígito + variation selector + keycap.
  const bruto = (texto ?? "").replace(/[️⃣]/g, "").trim();
  if (!bruto) return null;

  const limpo = dobrar(bruto).replace(/[.,;:!?)\]]+$/g, "");

  // 1. Igual à chave.
  const exato = opcoes.find((o) => dobrar(o.chave) === limpo);
  if (exato) return exato;

  // 2. Tirando o enchimento, sobra só a chave.
  const restantes = limpo
    .split(/[\s,.;:!?()[\]/-]+/)
    .filter(Boolean)
    .filter((t) => !ENCHIMENTO.has(t));
  if (restantes.length === 1) {
    const unica = opcoes.find((o) => dobrar(o.chave) === restantes[0]);
    if (unica) return unica;
  }

  // 3. Citou o rótulo. Exige rótulo com mais de 3 letras para um rótulo
  //    curto não casar com qualquer frase.
  const porRotulo = opcoes.find((o) => {
    const r = dobrar(o.rotulo);
    return r.length > 3 && limpo.includes(r);
  });
  return porRotulo ?? null;
}

/** Monta o texto do menu: saudação + cabeçalho + as opções numeradas. */
export function montarTextoMenu(
  menu: { saudacao: string; cabecalho: string },
  saudacaoDaCaixa: string | null,
  opcoes: OpcaoMenu[],
): string {
  // Saudação vazia no menu = a caixa é a dona da frase (ver migration 0052).
  const saudacao = menu.saudacao.trim() || (saudacaoDaCaixa ?? "").trim();
  const linhas = opcoes.map((o) => `${o.chave} — ${o.rotulo}`).join("\n");
  return [saudacao, menu.cabecalho.trim(), linhas].filter(Boolean).join("\n\n");
}
