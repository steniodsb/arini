"use client";

/**
 * Tabela padrão do CRM: a LINHA INTEIRA abre o registro em modal de leitura.
 *
 * Antes, abrir era um "Abrir →" minúsculo encostado na borda direita: em
 * tabela larga, o olho lia o nome do imóvel à esquerda e a mão precisava
 * atravessar a tela até um alvo de poucos pixels. A linha já tinha `hover`,
 * o que prometia clique e não cumpria.
 *
 * Agora: clique em qualquer lugar da linha (ou Enter/Espaço com o teclado)
 * abre o modal de visualização; de lá se decide editar. A seta continua à
 * direita, só que como pista visual, não como único alvo.
 */

import { useState, useMemo } from "react";
import { ChevronRight, Search } from "lucide-react";
import { ModalVisualizacao, type CampoVisualizacao } from "./ModalVisualizacao";

export type ColunaCrm<T> = {
  rotulo: string;
  /** conteúdo da célula */
  render: (linha: T) => React.ReactNode;
  /** classes da célula (alinhamento, fonte mono…) */
  classe?: string;
  /** esconde em telas estreitas, onde a tabela não cabe */
  ocultarNoCelular?: boolean;
};

export function TabelaCrm<T extends { id: string }>({
  linhas,
  colunas,
  titulo,
  subtitulo,
  etiqueta,
  campos,
  hrefEdicao,
  rotuloEdicao,
  extra,
  vazio = "Nada por aqui ainda.",
  busca,
  textoBusca,
}: {
  linhas: T[];
  colunas: ColunaCrm<T>[];
  /** título do modal */
  titulo: (linha: T) => string;
  subtitulo?: (linha: T) => React.ReactNode;
  etiqueta?: (linha: T) => React.ReactNode;
  campos: (linha: T) => CampoVisualizacao[];
  hrefEdicao?: (linha: T) => string;
  rotuloEdicao?: string;
  extra?: (linha: T) => React.ReactNode;
  vazio?: string;
  /** liga o campo de busca; `textoBusca` diz onde procurar em cada linha */
  busca?: string;
  textoBusca?: (linha: T) => string;
}) {
  const [aberta, setAberta] = useState<T | null>(null);
  const [filtro, setFiltro] = useState("");

  const visiveis = useMemo(() => {
    if (!busca || !textoBusca || !filtro.trim()) return linhas;
    const alvo = filtro.trim().toLowerCase();
    return linhas.filter((l) => textoBusca(l).toLowerCase().includes(alvo));
  }, [linhas, filtro, busca, textoBusca]);

  return (
    <>
      {busca && textoBusca && (
        <div className="relative mb-3 max-w-sm">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            placeholder={busca}
            className="w-full rounded-md border pl-9 pr-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-gold/40"
          />
        </div>
      )}

      <div className="rounded-lg border bg-card overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              {colunas.map((c, i) => (
                <th key={i} className={`px-4 py-3 font-medium ${c.ocultarNoCelular ? "hidden md:table-cell" : ""}`}>
                  {c.rotulo}
                </th>
              ))}
              <th className="px-4 py-3 w-10" />
            </tr>
          </thead>
          <tbody>
            {visiveis.map((linha) => (
              <tr
                key={linha.id}
                // `tabIndex`/`role` porque <tr> não é focável nem clicável por
                // natureza: sem isto, quem usa teclado ficaria sem caminho.
                tabIndex={0}
                role="button"
                aria-label={`Ver ${titulo(linha)}`}
                onClick={() => setAberta(linha)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setAberta(linha); }
                }}
                className="border-t cursor-pointer hover:bg-muted/40 focus:bg-muted/40
                           focus:outline-none focus-visible:ring-2 focus-visible:ring-inset
                           focus-visible:ring-gold/50 transition-colors group"
              >
                {colunas.map((c, i) => (
                  <td key={i} className={`px-4 py-3 ${c.classe ?? ""} ${c.ocultarNoCelular ? "hidden md:table-cell" : ""}`}>
                    {c.render(linha)}
                  </td>
                ))}
                <td className="px-4 py-3 text-right">
                  <ChevronRight
                    size={16}
                    aria-hidden
                    className="inline text-muted-foreground/40 group-hover:text-gold-dark
                               group-hover:translate-x-0.5 transition-all"
                  />
                </td>
              </tr>
            ))}
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={colunas.length + 1} className="py-10 text-center text-muted-foreground">
                  {filtro.trim() ? `Nada encontrado para “${filtro.trim()}”.` : vazio}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ModalVisualizacao
        aberto={!!aberta}
        aoFechar={() => setAberta(null)}
        titulo={aberta ? titulo(aberta) : ""}
        subtitulo={aberta && subtitulo ? subtitulo(aberta) : undefined}
        etiqueta={aberta && etiqueta ? etiqueta(aberta) : undefined}
        campos={aberta ? campos(aberta) : []}
        hrefEdicao={aberta && hrefEdicao ? hrefEdicao(aberta) : undefined}
        rotuloEdicao={rotuloEdicao}
        extra={aberta && extra ? extra(aberta) : undefined}
      />
    </>
  );
}
