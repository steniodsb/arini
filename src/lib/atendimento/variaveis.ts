import { horaBR } from "@/lib/fuso";

// =====================================================================
// VARIÁVEIS DA MENSAGEM AUTOMÁTICA
//
// Até aqui, a ação `enviar_mensagem` das automações mandava TEXTO
// LITERAL. Uma resposta automática não conseguia chamar o cliente pelo
// nome — e "Olá! Escolha uma opção" é exatamente o tom de robô que o
// menu de ramais precisa não ter.
//
// Este módulo é lógica pura de propósito: substituição de texto não
// precisa de banco, e assim dá para testar todas as armadilhas (nome
// vazio, nome que é telefone, pontuação órfã) sem subir nada.
//
// AS DUAS ARMADILHAS QUE DEFINIRAM O DESENHO
//
// 1. NOME VAZIO. No WhatsApp, contato sem nome salvo é a regra, não a
//    exceção. Substituir `{{primeiro_nome}}` por "" em "Olá, {{primeiro_nome}}!"
//    produz "Olá, !" — pior que não personalizar. Por isso existe o
//    passe de limpeza no fim, e por isso existe `{{saudacao_nome}}`, que
//    é dono da própria vírgula e some inteira quando não há nome.
//
// 2. NOME QUE É TELEFONE. Quando o contato não tem nome, o canal
//    costuma preencher com o número. "Boa tarde, 554891275655!" é o
//    mesmo problema com outra cara, então número é tratado como ausência
//    de nome.
//
// VARIÁVEL DESCONHECIDA FICA LITERAL, de propósito. Apagar `{{nomee}}`
// silenciosamente esconde o erro de digitação; deixá-lo visível faz
// alguém consertar. A tela avisa antes de salvar (`variaveisDesconhecidas`),
// que é onde o erro deve morrer.
// =====================================================================

/** O que a mensagem sabe sobre a conversa na hora do envio. */
export interface ContextoVariaveis {
  contatoNome?: string | null;
  contatoTelefone?: string | null;
  /** Nome da fila de destino. Só é lido quando o texto pede `{{fila}}`. */
  fila?: string | null;
  /** Rótulo do canal ("WhatsApp", "Instagram"…). */
  canal?: string | null;
  /** Injetável para teste; em produção é sempre "agora". */
  agora?: Date;
}

export interface VariavelDoc {
  chave: string;
  descricao: string;
  exemplo: string;
}

/** Catálogo exibido na tela de automações. Fonte única da verdade. */
export const VARIAVEIS: VariavelDoc[] = [
  { chave: "saudacao", descricao: "Bom dia / Boa tarde / Boa noite, pelo relógio de São Paulo", exemplo: "Boa tarde" },
  { chave: "saudacao_nome", descricao: "A saudação já com o nome e a vírgula — some sozinha quando não há nome", exemplo: "Boa tarde, Gabriel" },
  { chave: "nome", descricao: "Nome do contato como veio do canal", exemplo: "Gabriel Castro" },
  { chave: "primeiro_nome", descricao: "Só o primeiro nome do contato", exemplo: "Gabriel" },
  { chave: "fila", descricao: "Fila de destino da conversa", exemplo: "Locação" },
  { chave: "canal", descricao: "Canal por onde o cliente escreveu", exemplo: "WhatsApp" },
  { chave: "telefone", descricao: "Telefone do contato — útil em nota interna", exemplo: "(34) 99745-1400" },
];

const CHAVES = new Set(VARIAVEIS.map((v) => v.chave));

/** `{{ chave }}` com espaço opcional; a chave é sempre minúscula com `_`. */
const MARCADOR = /\{\{\s*([a-z_]+)\s*\}\}/g;

/**
 * Nome que na verdade é um número de telefone. O canal preenche
 * `contato_nome` com o número quando o contato não tem nome salvo, e
 * tratar isso como nome é o que produz "Boa tarde, 554891275655!".
 */
function ehTelefone(valor: string): boolean {
  const so = valor.replace(/[\s()+\-.]/g, "");
  return so.length >= 8 && /^\d+$/.test(so);
}

/** Nome utilizável, ou "" quando não há nome de verdade. */
function nomeLimpo(bruto: string | null | undefined): string {
  // O "~" é marcador de push name do WhatsApp em grupo, não faz parte do nome.
  const n = (bruto ?? "").replace(/^~\s*/, "").trim();
  if (!n || ehTelefone(n)) return "";
  return n;
}

/** Saudação pelo relógio de São Paulo — nunca pelo fuso de quem renderiza. */
export function saudacaoBR(agora: Date = new Date()): string {
  const h = horaBR(agora);
  if (h >= 5 && h < 12) return "Bom dia";
  if (h >= 12 && h < 18) return "Boa tarde";
  return "Boa noite";
}

/**
 * Remove os destroços que uma substituição VAZIA deixa: pontuação órfã e
 * o espaço que sobrou do buraco.
 *
 * Só é chamada quando alguma variável saiu vazia — senão o texto é
 * exatamente o que o usuário escreveu, com os nomes preenchidos, e não
 * há destroço nenhum para limpar. Essa condição não é detalhe: sem ela,
 * "1  —  Vendas" num menu alinhado à mão perderia o alinhamento só por
 * existir um `{{saudacao}}` três linhas acima.
 */
function limpar(texto: string): string {
  return texto
    // "Olá, !" → "Olá!"   |   "Boa tarde, ." → "Boa tarde."
    .replace(/\s*,\s*([!?.,;:])/g, "$1")
    // Vírgula sobrando no fim da linha: "Olá, {{nome}}," sem nome.
    .replace(/[ \t]*,[ \t]*$/gm, "")
    // Espaço duplicado que sobrou do buraco. Não toca em quebra de linha.
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+$/gm, "");
}

/** Troca os marcadores conhecidos pelos valores do contexto. */
export function aplicarVariaveis(texto: string, ctx: ContextoVariaveis = {}): string {
  if (!texto || !texto.includes("{{")) return texto;

  const agora = ctx.agora ?? new Date();
  const nome = nomeLimpo(ctx.contatoNome);
  const primeiro = nome ? nome.split(/\s+/)[0] : "";
  const saudacao = saudacaoBR(agora);

  const valores: Record<string, string> = {
    saudacao,
    saudacao_nome: primeiro ? `${saudacao}, ${primeiro}` : saudacao,
    nome,
    primeiro_nome: primeiro,
    fila: (ctx.fila ?? "").trim(),
    canal: (ctx.canal ?? "").trim(),
    telefone: (ctx.contatoTelefone ?? "").trim(),
  };

  // Só há destroço para limpar se alguma variável saiu vazia. Ver `limpar`.
  let houveBuraco = false;

  const trocado = texto.replace(MARCADOR, (literal, chave: string) => {
    // Desconhecida volta como veio — ver cabeçalho.
    if (!CHAVES.has(chave)) return literal;
    const valor = valores[chave] ?? "";
    if (!valor) houveBuraco = true;
    return valor;
  });

  return houveBuraco ? limpar(trocado) : trocado;
}

/** Marcadores presentes no texto, na ordem em que aparecem (sem repetir). */
export function variaveisUsadas(texto: string): string[] {
  const achadas = new Set<string>();
  for (const m of texto.matchAll(MARCADOR)) achadas.add(m[1]);
  return [...achadas];
}

/** O que a tela precisa avisar antes de salvar: `{{nomee}}` e afins. */
export function variaveisDesconhecidas(texto: string): string[] {
  return variaveisUsadas(texto).filter((v) => !CHAVES.has(v));
}

/** `true` quando vale a pena buscar o nome da fila no banco. */
export function precisaDaFila(texto: string): boolean {
  return variaveisUsadas(texto).includes("fila");
}
