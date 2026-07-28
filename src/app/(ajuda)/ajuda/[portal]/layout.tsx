// =====================================================================
// Layout compartilhado do PORTAL PÚBLICO da Central de Ajuda.
//
// O grupo de rotas `(ajuda)` existe para este layout NÃO herdar o
// cabeçalho/rodapé institucional de `(public)`: aqui o visitante está
// resolvendo um problema, não navegando no site imobiliário.
//
// O `<div data-ajuda>` é o gancho do CSS em `ajuda.css` — é nele que os
// tokens do tema escuro são redeclarados por preferência do sistema e onde
// a cor de marca do portal vira uma custom property.
// =====================================================================

import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { CabecalhoPortal } from "@/components/ajuda/CabecalhoPortal";
import { RodapePortal } from "@/components/ajuda/RodapePortal";
import { carregarPortal } from "@/components/ajuda/dados";
import "@/components/ajuda/ajuda.css";

export default async function LayoutAjuda({
  children,
  params,
}: {
  children: React.ReactNode;
  params: { portal: string };
}) {
  const portal = await carregarPortal(params.portal);
  // Portal inexistente ou desativado: 404 já no layout, para nenhuma página
  // filha precisar repetir a checagem antes de renderizar cabeçalho.
  if (!portal) notFound();

  return (
    <div
      data-ajuda
      lang={portal.idioma || "pt-BR"}
      className="flex min-h-screen flex-col bg-background text-foreground"
      // Valor dinâmico (vem do banco, um por portal) e já validado como hex
      // em `corSegura` — o Tailwind não gera classe para cor de runtime.
      style={{ "--ajuda-marca": portal.corDestaque } as CSSProperties}
    >
      <a
        href="#conteudo-ajuda"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-background focus:px-4 focus:py-2 focus:text-sm focus:shadow"
      >
        Pular para o conteúdo
      </a>

      <CabecalhoPortal portal={portal} />

      <main id="conteudo-ajuda" className="flex-1">
        {children}
      </main>

      <RodapePortal portal={portal} />
    </div>
  );
}
