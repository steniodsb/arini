// =====================================================================
// Rodapé do portal público.
//
// SOBRE `rodape_html`: apesar do nome da coluna, renderizamos o conteúdo
// como TEXTO ESCAPADO, nunca com dangerouslySetInnerHTML. Motivos:
//   1. O campo é gravado pelo admin do Atendimento sem nenhuma sanitização
//      no caminho — um <script> ali viraria XSS ARMAZENADO servido para
//      todo visitante anônimo do portal, que é a superfície mais exposta
//      do sistema (sem login, indexada, aberta no celular do cliente).
//   2. Quem edita o portal não é necessariamente quem administra o sistema:
//      um atendente com acesso à Central de Ajuda passaria a poder injetar
//      script no domínio público — escalada de privilégio via conteúdo.
//   3. O restante da Central já trata conteúdo de autor como texto: o
//      renderizador de markdown escapa tudo antes de gerar HTML. Abrir uma
//      exceção só no rodapé quebraria essa garantia.
// Se um dia o rodapé precisar mesmo de HTML, o caminho é sanitizar na
// gravação com uma allowlist — não confiar no campo aqui.
// =====================================================================

import Link from "next/link";
import type { PortalPublico } from "./dados";

export function RodapePortal({ portal }: { portal: PortalPublico }) {
  const ano = new Date().getFullYear();

  return (
    <footer className="mt-16 border-t border-border bg-muted/40">
      <div className="mx-auto max-w-5xl space-y-4 px-4 py-10 sm:px-6">
        {portal.rodapeTexto && (
          <p className="whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {portal.rodapeTexto}
          </p>
        )}

        <div className="flex flex-col gap-2 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <span>
            © {ano} {portal.nome}
          </span>
          <Link
            href={`/ajuda/${portal.slug}`}
            className="underline underline-offset-4 hover:opacity-80"
            style={{ color: "var(--ajuda-link)" }}
          >
            Voltar para a Central de Ajuda
          </Link>
        </div>
      </div>
    </footer>
  );
}
