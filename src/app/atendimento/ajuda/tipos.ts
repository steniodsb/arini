// Tipos locais da Central de Ajuda. Ficam aqui (e não em lib/types.ts)
// porque só estas telas consomem as tabelas do 0032.

export type ArtigoStatus = "rascunho" | "publicado" | "arquivado";

export interface Portal {
  id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  cor: string;
  idioma: string;
  dominio_customizado: string | null;
  ativo: boolean;
  created_at: string;
}

export interface Categoria {
  id: string;
  portal_id: string;
  nome: string;
  slug: string;
  descricao: string | null;
  ordem: number;
  created_at: string;
}

export interface Artigo {
  id: string;
  portal_id: string;
  category_id: string | null;
  titulo: string;
  slug: string;
  resumo: string | null;
  conteudo: string | null;
  status: ArtigoStatus;
  autor_id: string | null;
  visualizacoes: number;
  ordem: number;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

/** Converte um título em slug kebab-case sem acento — usado em portais,
 *  categorias e artigos, por isso mora aqui. */
export function paraSlug(texto: string): string {
  return texto
    .normalize("NFD")
    // Remove os diacríticos separados pelo NFD (faixa combining marks).
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}
