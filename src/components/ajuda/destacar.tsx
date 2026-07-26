// Destaque do termo buscado dentro de um trecho de texto.
//
// Fatiamos a string e devolvemos nós React (<mark>) em vez de montar HTML e
// injetar com dangerouslySetInnerHTML: o termo vem da query string, ou seja,
// é entrada do visitante. Assim o React escapa tudo e não existe caminho de
// XSS refletido — o clássico "?q=<script>" não tem por onde passar.

import type { ReactNode } from "react";

export function destacarTermo(texto: string, termo: string): ReactNode {
  const t = termo.trim();
  if (!t || t.length < 2) return texto;

  const alvo = texto.toLowerCase();
  const busca = t.toLowerCase();
  const partes: ReactNode[] = [];
  let pos = 0;
  let achou = alvo.indexOf(busca);
  let chave = 0;

  while (achou >= 0) {
    if (achou > pos) partes.push(texto.slice(pos, achou));
    partes.push(
      <mark key={`m${chave++}`} className="ajuda-marca-busca">
        {texto.slice(achou, achou + t.length)}
      </mark>,
    );
    pos = achou + t.length;
    achou = alvo.indexOf(busca, pos);
  }

  if (pos === 0) return texto;
  if (pos < texto.length) partes.push(texto.slice(pos));
  return partes;
}
