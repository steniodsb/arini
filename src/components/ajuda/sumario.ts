// =====================================================================
// Sumário (índice lateral) do artigo.
//
// O renderizador de markdown que reusamos (`src/app/atendimento/ajuda/markdown.ts`)
// não emite `id` nos títulos — ele foi feito para a PRÉ-VISUALIZAÇÃO do editor,
// onde âncora não serve para nada. Como não podemos editá-lo, extraímos os
// `##` do markdown ORIGINAL e injetamos os `id` no HTML já renderizado.
//
// Isso é seguro porque a ordem é a mesma nos dois lados: o markdown produz um
// `<h2 ...>` por linha `## …`, na mesma sequência. E é seguro contra injeção
// porque só acrescentamos um atributo cujo valor nós geramos (slug a-z0-9-).
// =====================================================================

import { paraSlug } from "@/app/atendimento/ajuda/tipos";

export interface ItemSumario {
  id: string;
  texto: string;
}

/** Remove marcações inline (**, *, `, links) para o rótulo do sumário. */
function textoLimpo(bruto: string): string {
  return bruto
    .replace(/\[([^\]]+)\]\([^)\s]*\)/g, "$1")
    .replace(/[*`]/g, "")
    .trim();
}

/** Lê os títulos de nível 2 (`## …`) na ordem em que aparecem. */
export function extrairSumario(markdown: string | null): ItemSumario[] {
  if (!markdown) return [];
  const itens: ItemSumario[] = [];
  const usados = new Set<string>();

  for (const linha of markdown.split(/\r?\n/)) {
    const m = /^##\s+(.*)$/.exec(linha.trimEnd());
    if (!m) continue;
    const texto = textoLimpo(m[1]);
    if (!texto) continue;

    // Slug pode repetir se dois títulos forem iguais — desempata com sufixo,
    // senão o link levaria sempre para a primeira seção.
    const base = paraSlug(texto) || `secao-${itens.length + 1}`;
    let id = base;
    let n = 2;
    while (usados.has(id)) id = `${base}-${n++}`;
    usados.add(id);

    itens.push({ id, texto });
  }
  return itens;
}

/**
 * Injeta os `id` nos `<h2>` do HTML renderizado, na ordem do sumário.
 * Só o nível 2 recebe âncora — é o que o sumário lista.
 */
export function aplicarAncoras(html: string, itens: ItemSumario[]): string {
  if (itens.length === 0) return html;
  let i = 0;
  return html.replace(/<h2 /g, () => {
    const item = itens[i++];
    return item ? `<h2 id="${item.id}" ` : "<h2 ";
  });
}

/**
 * Rebaixa `<h1>` do corpo para `<h2>`.
 *
 * O título do artigo já é o único `<h1>` da página. Se o autor começou o
 * markdown com `# Alguma coisa`, teríamos dois h1 e a hierarquia que o leitor
 * de tela usa para navegar quebraria. Como não podemos tocar no renderizador
 * compartilhado, corrigimos no HTML de saída.
 *
 * Roda DEPOIS de `aplicarAncoras`: senão os h2 recém-criados entrariam na
 * contagem e as âncoras cairiam nas seções erradas. É seguro contra injeção
 * porque o markdown escapa `<` do autor antes — só as tags que nós geramos
 * existem aqui.
 */
export function rebaixarTitulos(html: string): string {
  return html.replace(/<h1(\s|>)/g, "<h2$1").replace(/<\/h1>/g, "</h2>");
}
