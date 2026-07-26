// =====================================================================
// Renderizador de markdown MÍNIMO (títulos, negrito, itálico, código,
// listas, links e parágrafos).
//
// Por que caseiro em vez de biblioteca: a pré-visualização do editor de
// artigos precisa de um subconjunto pequeno e previsível, e não vale
// puxar dependência nova (+ superfície de segurança) para isso.
//
// SEGURANÇA: todo o texto é escapado ANTES de virar HTML, então nenhuma
// tag vinda do autor sobrevive — só as tags que nós mesmos geramos.
// =====================================================================

function escaparHtml(texto: string): string {
  return texto
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Marcações que valem dentro de uma linha. Ordem importa: código antes
 *  de negrito/itálico para não formatar o que está entre crases. */
function inline(texto: string): string {
  return texto
    .replace(
      /`([^`]+)`/g,
      '<code class="rounded bg-muted px-1 py-0.5 text-[0.85em] font-mono">$1</code>',
    )
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_todo, rotulo: string, url: string) => {
      // Só deixamos passar http(s), mailto e caminhos relativos — bloqueia
      // javascript: e data: mesmo com o texto já escapado.
      const seguro = /^(https?:\/\/|mailto:|\/)/i.test(url) ? url : "#";
      return `<a href="${seguro}" target="_blank" rel="noopener noreferrer" class="text-arini dark:text-gold underline underline-offset-2">${rotulo}</a>`;
    });
}

export function markdownParaHtml(markdown: string): string {
  const linhas = escaparHtml(markdown ?? "").split(/\r?\n/);
  const saida: string[] = [];
  let paragrafo: string[] = [];
  let lista: "ul" | "ol" | null = null;

  function fecharParagrafo() {
    if (paragrafo.length) {
      saida.push(`<p class="my-2 leading-relaxed">${inline(paragrafo.join(" "))}</p>`);
      paragrafo = [];
    }
  }
  function fecharLista() {
    if (lista) {
      saida.push(`</${lista}>`);
      lista = null;
    }
  }
  function abrirLista(tipo: "ul" | "ol") {
    if (lista === tipo) return;
    fecharLista();
    lista = tipo;
    saida.push(
      tipo === "ul"
        ? '<ul class="list-disc pl-5 my-2 space-y-1">'
        : '<ol class="list-decimal pl-5 my-2 space-y-1">',
    );
  }

  for (const linha of linhas) {
    const l = linha.trimEnd();

    if (!l.trim()) {
      fecharParagrafo();
      fecharLista();
      continue;
    }

    const titulo = /^(#{1,3})\s+(.*)$/.exec(l);
    if (titulo) {
      fecharParagrafo();
      fecharLista();
      const nivel = titulo[1].length;
      const cls =
        nivel === 1
          ? "text-lg font-semibold mt-4 mb-2"
          : nivel === 2
            ? "text-base font-semibold mt-3 mb-1.5"
            : "text-sm font-semibold mt-3 mb-1";
      saida.push(`<h${nivel} class="${cls}">${inline(titulo[2])}</h${nivel}>`);
      continue;
    }

    const itemUl = /^[-*]\s+(.*)$/.exec(l.trim());
    if (itemUl) {
      fecharParagrafo();
      abrirLista("ul");
      saida.push(`<li>${inline(itemUl[1])}</li>`);
      continue;
    }

    const itemOl = /^\d+\.\s+(.*)$/.exec(l.trim());
    if (itemOl) {
      fecharParagrafo();
      abrirLista("ol");
      saida.push(`<li>${inline(itemOl[1])}</li>`);
      continue;
    }

    fecharLista();
    paragrafo.push(l.trim());
  }

  fecharParagrafo();
  fecharLista();
  return saida.join("\n");
}
