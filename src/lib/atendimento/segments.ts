import type { AutomationCondition } from "@/lib/types";

// =====================================================================
// SEGMENTOS SALVOS — tradução de um filtro guardado em jsonb para uma
// consulta do Supabase.
//
// Por que um módulo próprio: a mesma lista de condições é executada em
// dois momentos (a contagem "Resultados" da tabela e a pré-visualização
// do modal) e, no futuro, na filtragem do inbox. Se cada tela montasse a
// query do seu jeito, o mesmo segmento devolveria números diferentes.
//
// Deliberadamente NÃO usamos `any`: a consulta entra como um genérico
// preso a uma interface mínima (só os métodos que usamos), então qualquer
// query builder do Supabase serve e o encadeamento continua tipado.
// =====================================================================

export type SegmentTipo = "conversa" | "contato";

/** Origem das opções do campo de valor — espelha a tela de automações. */
export type FonteOpcoesSegmento =
  | "texto"
  | "status"
  | "prioridade"
  | "canal"
  | "agentes"
  | "equipes"
  | "etiquetas"
  | "caixas"
  | "empresas"
  | "estagio"
  | "origem"
  | "sim_nao";

export interface CampoSegmento {
  campo: string;
  label: string;
  fonte: FonteOpcoesSegmento;
  /** Coluna é array no Postgres (tags) — comparação usa `contains`. */
  array?: boolean;
  /** Coluna é boolean — o valor "sim"/"nao" vira true/false. */
  booleano?: boolean;
}

/** Tabela consultada por tipo de segmento. */
export const TABELA_SEGMENTO: Record<SegmentTipo, string> = {
  conversa: "conversations",
  contato: "leads",
};

export const SEGMENT_TIPO_LABELS: Record<SegmentTipo, string> = {
  conversa: "Conversas",
  contato: "Contatos",
};

/**
 * Campos filtráveis por tipo. Os nomes precisam ser colunas REAIS das
 * tabelas acima — o filtro vai direto para o PostgREST.
 */
export const CAMPOS_SEGMENTO: Record<SegmentTipo, CampoSegmento[]> = {
  conversa: [
    { campo: "status", label: "Status da conversa", fonte: "status" },
    { campo: "prioridade", label: "Prioridade", fonte: "prioridade" },
    { campo: "canal", label: "Canal", fonte: "canal" },
    { campo: "responsavel_id", label: "Responsável", fonte: "agentes" },
    { campo: "team_id", label: "Equipe", fonte: "equipes" },
    { campo: "tags", label: "Etiquetas", fonte: "etiquetas", array: true },
    { campo: "inbox_id", label: "Caixa de entrada", fonte: "caixas" },
  ],
  contato: [
    { campo: "stage", label: "Etapa do funil", fonte: "estagio" },
    { campo: "origem", label: "Origem", fonte: "origem" },
    { campo: "company_id", label: "Empresa", fonte: "empresas" },
    { campo: "bloqueado", label: "Bloqueado", fonte: "sim_nao", booleano: true },
  ],
};

/** Definição de um campo (ou undefined se o filtro guardou lixo). */
export function campoDoSegmento(tipo: SegmentTipo, campo: string): CampoSegmento | undefined {
  return CAMPOS_SEGMENTO[tipo].find((c) => c.campo === campo);
}

/** Operadores que dispensam valor — o campo some do formulário. */
export function operadorSemValor(operador: AutomationCondition["operador"]): boolean {
  return operador === "existe" || operador === "nao_existe";
}

/**
 * Interface mínima de uma query filtrável do Supabase — só os métodos que
 * este módulo encadeia.
 *
 * Não usamos `Q extends QueryFiltravel` como restrição do genérico: o
 * PostgrestFilterBuilder tem dezenas de overloads e o compilador estoura
 * ("type instantiation is excessively deep") ao tentar casar todos. Por
 * isso `construirConsulta` recebe o builder como genérico livre e o trata
 * internamente por esta interface — o único ponto de conversão do arquivo.
 */
export interface QueryFiltravel {
  eq(column: string, value: unknown): QueryFiltravel;
  neq(column: string, value: unknown): QueryFiltravel;
  ilike(column: string, pattern: string): QueryFiltravel;
  is(column: string, value: boolean | null): QueryFiltravel;
  not(column: string, operator: string, value: unknown): QueryFiltravel;
  contains(
    column: string,
    value: string | readonly unknown[] | Record<string, unknown>,
  ): QueryFiltravel;
}

/** "sim"/"true"/"1" → true. Qualquer outra coisa → false. */
function paraBooleano(valor: string): boolean {
  return /^(sim|true|1|yes)$/i.test(valor.trim());
}

/**
 * `%` e `_` são curingas do LIKE. Sem escapar, buscar por "50%" traria
 * qualquer coisa começando com 50.
 */
function escaparLike(valor: string): string {
  return valor.replace(/[%_\\]/g, (c) => `\\${c}`);
}

/**
 * Aplica as condições de um segmento sobre uma query já iniciada.
 *
 * Todas as condições são combinadas com E (mesma semântica das regras de
 * automação). Condições malformadas — campo desconhecido para o tipo, ou
 * valor vazio num operador que exige valor — são IGNORADAS em vez de
 * quebrarem a consulta: um segmento salvo pela metade não pode derrubar a
 * tela que só queria contar resultados.
 */
export function construirConsulta<Q>(
  query: Q,
  filtros: AutomationCondition[],
  tipo: SegmentTipo = "conversa",
): Q {
  // Ponto ÚNICO de conversão do módulo: por dentro trabalhamos pela
  // interface mínima e, na saída, devolvemos o mesmo objeto com o tipo do
  // chamador — os métodos do PostgREST sempre retornam o próprio builder,
  // então o objeto é literalmente o mesmo que entrou.
  let q = query as unknown as QueryFiltravel;

  for (const filtro of filtros ?? []) {
    const def = campoDoSegmento(tipo, filtro.campo);
    if (!def) continue;

    const coluna = def.campo;
    const valor = (filtro.valor ?? "").trim();

    // ----- operadores sem valor -----
    if (filtro.operador === "existe") {
      q = q.not(coluna, "is", null);
      continue;
    }
    if (filtro.operador === "nao_existe") {
      q = q.is(coluna, null);
      continue;
    }

    if (!valor) continue;

    // ----- coluna boolean -----
    if (def.booleano) {
      const b = paraBooleano(valor);
      q = filtro.operador === "diferente" || filtro.operador === "nao_contem"
        ? q.not(coluna, "is", b)
        : q.is(coluna, b);
      continue;
    }

    // ----- coluna array (tags): "contém" é o operador natural -----
    if (def.array) {
      // O PostgREST espera o array no formato {a,b}; a vírgula dentro do
      // valor quebraria o literal, então trocamos por espaço.
      const literal = `{${valor.replace(/,/g, " ")}}`;
      q = filtro.operador === "diferente" || filtro.operador === "nao_contem"
        ? q.not(coluna, "cs", literal)
        : q.contains(coluna, [valor]);
      continue;
    }

    // ----- texto / id -----
    switch (filtro.operador) {
      case "igual":
        q = q.eq(coluna, valor);
        break;
      case "diferente":
        q = q.neq(coluna, valor);
        break;
      case "contem":
        q = q.ilike(coluna, `%${escaparLike(valor)}%`);
        break;
      case "nao_contem":
        q = q.not(coluna, "ilike", `%${escaparLike(valor)}%`);
        break;
    }
  }

  return q as unknown as Q;
}
