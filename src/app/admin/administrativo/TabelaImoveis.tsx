"use client";

import { TabelaCrm } from "@/components/crm/TabelaCrm";
import { LinkExterno } from "@/components/crm/ModalVisualizacao";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { formatCurrencyBRL, formatDateBR, formatArea } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

const nomeDo = (p: Property) => p.titulo || PROPERTY_TYPE_LABELS[p.type];

export function TabelaImoveis({ linhas }: { linhas: Property[] }) {
  return (
    <TabelaCrm<Property>
      linhas={linhas}
      busca="Buscar por código, imóvel ou cidade…"
      textoBusca={(p) => [p.codigo, p.titulo, p.cidade, PROPERTY_TYPE_LABELS[p.type]].filter(Boolean).join(" ")}
      vazio="Sem imóveis ainda."
      colunas={[
        { rotulo: "Código", classe: "font-mono whitespace-nowrap", render: (p) => p.codigo },
        {
          rotulo: "Imóvel",
          render: (p) => (
            <>
              <span className="font-medium text-arini">{nomeDo(p)}</span>
              <div className="text-xs text-muted-foreground">{p.cidade}</div>
            </>
          ),
        },
        { rotulo: "Categoria", ocultarNoCelular: true, render: (p) => CATEGORY_LABELS[p.category] },
        { rotulo: "Valor", classe: "whitespace-nowrap", render: (p) => formatCurrencyBRL(p.valor) },
        { rotulo: "Status", render: (p) => <StatusBadge status={p.status} /> },
        { rotulo: "Entrada", ocultarNoCelular: true, classe: "whitespace-nowrap", render: (p) => formatDateBR(p.data_entrada) },
      ]}
      titulo={nomeDo}
      subtitulo={(p) => (
        <span className="font-mono text-xs">{p.codigo}</span>
      )}
      etiqueta={(p) => <StatusBadge status={p.status} />}
      campos={(p) => [
        { rotulo: "Categoria", valor: CATEGORY_LABELS[p.category] },
        { rotulo: "Tipo", valor: PROPERTY_TYPE_LABELS[p.type] },
        { rotulo: "Valor", valor: formatCurrencyBRL(p.valor) },
        { rotulo: "Entrada", valor: formatDateBR(p.data_entrada) },
        { rotulo: "Cidade / UF", valor: [p.cidade, p.uf].filter(Boolean).join(" / ") },
        { rotulo: "Bairro", valor: p.bairro },
        { rotulo: "Área total", valor: formatArea(p.area_total, p.type) },
        { rotulo: "Área construída", valor: p.area_construida ? `${p.area_construida.toLocaleString("pt-BR")} m²` : null },
        {
          rotulo: "Dormitórios / suítes / banheiros / vagas",
          valor: [p.dormitorios, p.suites, p.banheiros, p.vagas].some((v) => v != null)
            ? [p.dormitorios, p.suites, p.banheiros, p.vagas].map((v) => v ?? "—").join(" / ")
            : null,
        },
        { rotulo: "Exclusividade", valor: p.exclusividade ? `Sim${p.exclusividade_prazo ? ` — até ${formatDateBR(p.exclusividade_prazo)}` : ""}` : "Não" },
        { rotulo: "Endereço", largo: true, valor: p.endereco },
        { rotulo: "Descrição", largo: true, valor: p.descricao },
      ]}
      hrefEdicao={(p) => `/admin/captacao/${p.id}`}
      extra={(p) => (
        <div className="flex flex-wrap gap-4 pt-1 border-t">
          <div className="pt-3"><LinkExterno href={`/admin/financeiro-imovel?imovel=${p.id}`}>Financeiro do imóvel</LinkExterno></div>
          {p.status === "publicado" && (
            <div className="pt-3"><LinkExterno href={`/imoveis/${p.codigo}`}>Ver anúncio publicado</LinkExterno></div>
          )}
        </div>
      )}
    />
  );
}
