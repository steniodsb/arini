"use client";

// =====================================================================
// Conta a leitura do artigo.
//
// Por que no cliente e não no Server Component: a página tem
// `revalidate = 300`, ou seja, é servida do cache — o código do servidor
// não roda a cada leitor e um incremento ali contaria só 1 a cada 5 min.
// Além disso, escrever no banco durante o render de uma página estática é
// efeito colateral em lugar errado (e o Next reclamaria).
//
// Uma vez por SESSÃO (não por render): o React 18 em modo estrito monta o
// efeito duas vezes em dev, e o usuário pode voltar ao artigo várias vezes
// na mesma visita. O guard fica no sessionStorage.
// =====================================================================

import { useEffect } from "react";
import { marcarVisualizacaoDaSessao } from "./visitante";

export function RegistroVisualizacao({
  portalSlug,
  articleId,
}: {
  portalSlug: string;
  articleId: string;
}) {
  useEffect(() => {
    if (!marcarVisualizacaoDaSessao(articleId)) return;

    // `keepalive` para a contagem sobreviver se a pessoa fechar a aba logo
    // depois de abrir. Falha silenciosa: métrica não vale um erro na tela.
    fetch(`/api/ajuda/${encodeURIComponent(portalSlug)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ acao: "visualizacao", articleId }),
      keepalive: true,
    }).catch(() => {});
  }, [portalSlug, articleId]);

  return null;
}
