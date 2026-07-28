/**
 * =====================================================================
 * AGENDA — contrato compartilhado entre todas as visualizações.
 * =====================================================================
 *
 * Este módulo é DELIBERADAMENTE puro: nada de React, nada de imports de
 * servidor (`next/headers`, supabase/server) e nada de "use client".
 * O motivo é que ele é consumido dos dois lados da fronteira — a página
 * server-side normaliza os dados com `normalizarItens`, e as vistas
 * (client components) usam os mesmos helpers de data para desenhar. Se
 * este arquivo importasse qualquer coisa de servidor, o bundle do cliente
 * quebraria; se importasse React, a página server não poderia usá-lo em
 * paz. Manter puro é o que permite que os dois lados compartilhem a
 * mesma verdade sobre "que dia é este item".
 */

import {
  AGENDA_TIPO_COR,
  type AgendaItem,
  type AgendaStatus,
  type AgendaTipo,
  type Sector,
} from "@/lib/types";

/** Um dia em milissegundos. Toda aritmética de data da agenda passa por aqui. */
export const DIA_MS = 24 * 60 * 60 * 1000;

/** Id do droppable do painel lateral. Soltar aqui = remover a data. */
export const ID_BACKLOG = "backlog";

// =====================================================================
// 1. O contrato que TODA vista recebe
// =====================================================================

/** Perfil resumido, do jeito que as vistas precisam (avatar + inicial). */
export interface Agente {
  id: string;
  nome: string;
  avatarUrl?: string | null;
}

/**
 * Props que `AgendaKanban`, `AgendaLista`, `AgendaTimeline`, `AgendaMes` e
 * `AgendaSemana` recebem. A casca (`AgendaShell`) já entrega os itens
 * FILTRADOS e o período resolvido; cada vista só recorta o que precisa
 * (a lista mostra 30 dias, a semana só 7 do mesmo array, e assim por diante).
 *
 * Os itens que chegam aqui SEMPRE têm `data_hora`. Os sem data vivem no
 * painel lateral (`AgendaBacklog`), não nas vistas de calendário.
 */
export interface VistaProps {
  /** Itens já unificados e já filtrados pela barra de filtros da casca. */
  itens: AgendaItem[];
  /** Início do período carregado (ISO). Inclusivo. */
  inicio: string;
  /** Fim do período carregado (ISO). Exclusivo. */
  fim: string;
  /** Perfis ativos, para avatares e seletores de responsável. */
  agentes: Agente[];
  /** Reagendar um item para outro instante (ISO). Otimista na casca. */
  onMover?: (id: string, novaData: string) => void;
  /**
   * Agendar ou DESAGENDAR. `null` remove a data e devolve o item ao
   * painel lateral — é o caminho de volta do arraste principal da tela.
   */
  onAgendar?: (id: string, dataISO: string | null) => void;
  /** Abrir o painel de detalhes do item. */
  onAbrir?: (item: AgendaItem) => void;
}

// ---------------------------------------------------------------------
// Estilo visual do calendário mensal
// ---------------------------------------------------------------------

/**
 * O mês tem DOIS visuais, e o usuário escolhe:
 *
 * - `compacto`: pílulas pastel de uma linha (referência ClickUp/Wrike). Cabe
 *   mais compromisso por célula — é o melhor para quem tem a agenda cheia.
 * - `cartoes`: cartão branco com chip de etiqueta e avatar (referência do
 *   Calendar Power-Up do Trello). Ocupa mais espaço vertical, mas o título é
 *   muito mais legível e a leitura fica próxima da do quadro.
 *
 * Mora aqui (e não em `@/lib/types`) de propósito: é preferência de
 * APRESENTAÇÃO de uma única vista, não um conceito do domínio da agenda.
 * `types.ts` descreve o que o banco guarda; isto só descreve como a tela
 * desenha.
 */
export type EstiloMes = "compacto" | "cartoes";

export const ESTILO_MES_LABELS: Record<EstiloMes, string> = {
  compacto: "Compacto (pílulas)",
  cartoes: "Cartões (estilo Trello)",
};

/**
 * Chave do `localStorage` onde a casca guarda a escolha.
 *
 * Não vira coluna em `profiles`: é preferência de visual do navegador, não
 * dado de negócio — ninguém mais precisa dela, ela não entra em relatório e
 * criar migration (mais RLS, mais round-trip a cada troca) para guardar um
 * enum de duas opções custa mais do que vale. Se um dia o cliente pedir "meu
 * estilo me acompanha em qualquer computador", aí sim vira coluna.
 */
export const CHAVE_ESTILO_MES = "arini-agenda-estilo-mes";

/** Valida o que veio do `localStorage` — lá qualquer string é possível. */
export function ehEstiloMes(valor: unknown): valor is EstiloMes {
  return valor === "compacto" || valor === "cartoes";
}

/**
 * Valores que o "+ Adicionar cartão" de uma coluna já leva prontos para o
 * diálogo de criação. Quem clica em "+" na coluna de sexta espera que o
 * compromisso nasça na sexta — sem isso, o botão da coluna não vale mais
 * que o botão global.
 */
export interface PrefillCartao {
  /** "AAAA-MM-DDTHH:mm" (local, formato do input datetime-local). */
  data?: string | null;
  status?: AgendaStatus;
  responsavelId?: string | null;
  tipo?: AgendaTipo;
  setor?: Sector | null;
}

// =====================================================================
// 2. Normalização — duas tabelas, um só tipo
// =====================================================================

/**
 * O PostgREST devolve o embed (`leads(nome)`) como objeto quando a relação
 * é para-um e como array quando ele não consegue inferir a cardinalidade.
 * Em vez de brigar com o tipo gerado, aceitamos os dois formatos.
 */
type Embed<T> = T | T[] | null | undefined;

function um<T>(valor: Embed<T>): T | null {
  if (!valor) return null;
  return Array.isArray(valor) ? valor[0] ?? null : valor;
}

/** Linha crua de `agenda_events` como a página carrega. */
export interface EventoRow {
  id: string;
  titulo: string;
  tipo: string | null;
  data_hora: string | null;
  duracao_min: number | null;
  dia_inteiro: boolean | null;
  status: string | null;
  ordem: number | null;
  cor: string | null;
  local: string | null;
  observacoes: string | null;
  responsavel_id: string | null;
  setor_destino: Sector | null;
  criado_por_sector: Sector | null;
  property_id: string | null;
  properties?: Embed<{ codigo: string }>;
}

/** Linha crua de `lead_appointments` como a página carrega. */
export interface AgendamentoRow {
  id: string;
  lead_id: string;
  tipo: string | null;
  data_hora: string | null;
  duracao_min: number | null;
  dia_inteiro: boolean | null;
  status: string | null;
  ordem: number | null;
  local: string | null;
  observacoes: string | null;
  responsavel_id: string | null;
  property_id: string | null;
  leads?: Embed<{ nome: string }>;
  properties?: Embed<{ codigo: string }>;
}

const TIPOS_VALIDOS: AgendaTipo[] = [
  "visita", "reuniao", "ligacao", "retorno", "assinatura", "gravacao", "outro",
];

/**
 * `lead_appointments.tipo` tem um CHECK mais restrito que o de
 * `agenda_events` — não aceita 'gravacao' nem 'outro'. Quem for mudar o
 * tipo de um agendamento (arrastar entre colunas no quadro) precisa
 * respeitar isso, senão o banco recusa o UPDATE.
 */
export const TIPOS_DE_AGENDAMENTO: AgendaTipo[] = [
  "visita", "reuniao", "ligacao", "retorno", "assinatura",
];

const STATUS_VALIDOS: AgendaStatus[] = [
  "agendado", "confirmado", "concluido", "cancelado", "nao_compareceu",
];

export function normalizarTipo(valor: string | null | undefined): AgendaTipo {
  return TIPOS_VALIDOS.includes(valor as AgendaTipo) ? (valor as AgendaTipo) : "outro";
}

export function normalizarStatus(valor: string | null | undefined): AgendaStatus {
  return STATUS_VALIDOS.includes(valor as AgendaStatus) ? (valor as AgendaStatus) : "agendado";
}

/**
 * Junta as duas tabelas num único `AgendaItem[]`, ordenado por data.
 *
 * O prefixo no `id` (`evt:` / `apt:`) existe porque as duas tabelas têm
 * UUIDs independentes e nada impede uma colisão visual no React (`key`) ou
 * no dnd-kit. `rawId` guarda o id puro, que é o que vai no `.eq("id", ...)`.
 *
 * Itens sem `data_hora` (backlog) passam por aqui do mesmo jeito — só a
 * ordenação precisa saber que eles existem, e eles vão para o fim.
 */
export function normalizarItens(
  eventos: EventoRow[] | null | undefined,
  agendamentos: AgendamentoRow[] | null | undefined,
): AgendaItem[] {
  const doEvento: AgendaItem[] = (eventos ?? []).map((e) => ({
    id: `evt:${e.id}`,
    origem: "evento",
    rawId: e.id,
    titulo: e.titulo,
    tipo: normalizarTipo(e.tipo),
    status: normalizarStatus(e.status),
    data_hora: e.data_hora ?? null,
    duracao_min: e.duracao_min ?? 60,
    dia_inteiro: e.dia_inteiro ?? false,
    observacoes: e.observacoes ?? null,
    local: e.local ?? null,
    cor: e.cor ?? null,
    ordem: e.ordem ?? 0,
    responsavel_id: e.responsavel_id ?? null,
    setor_destino: e.setor_destino ?? null,
    criado_por_sector: e.criado_por_sector ?? null,
    lead_id: null,
    lead_nome: null,
    property_id: e.property_id ?? null,
    property_codigo: um(e.properties)?.codigo ?? null,
  }));

  const doAgendamento: AgendaItem[] = (agendamentos ?? []).map((a) => {
    const lead = um(a.leads);
    return {
      id: `apt:${a.id}`,
      origem: "agendamento",
      rawId: a.id,
      // Agendamento de lead não tem título próprio: quem nomeia é o lead.
      titulo: lead?.nome ?? "Lead sem nome",
      tipo: normalizarTipo(a.tipo),
      status: normalizarStatus(a.status),
      data_hora: a.data_hora ?? null,
      duracao_min: a.duracao_min ?? 60,
      dia_inteiro: a.dia_inteiro ?? false,
      observacoes: a.observacoes ?? null,
      local: a.local ?? null,
      // `lead_appointments` não tem coluna `cor` — a cor sai do tipo.
      cor: null,
      ordem: a.ordem ?? 0,
      responsavel_id: a.responsavel_id ?? null,
      setor_destino: null,
      criado_por_sector: null,
      lead_id: a.lead_id,
      lead_nome: lead?.nome ?? null,
      property_id: a.property_id ?? null,
      property_codigo: um(a.properties)?.codigo ?? null,
    };
  });

  // Sem data vai para o fim: a ordenação por string trataria `null` de
  // forma imprevisível, então o desempate é explícito.
  return [...doEvento, ...doAgendamento].sort((a, b) => {
    if (!a.data_hora && !b.data_hora) return a.ordem - b.ordem;
    if (!a.data_hora) return 1;
    if (!b.data_hora) return -1;
    return a.data_hora.localeCompare(b.data_hora) || a.ordem - b.ordem;
  });
}

/** Estreita o tipo para os itens que realmente têm data (os do calendário). */
export function temData(item: AgendaItem): item is AgendaItem & { data_hora: string } {
  return typeof item.data_hora === "string" && item.data_hora.length > 0;
}

// =====================================================================
// 3. Datas — tudo LOCAL, nunca UTC
// =====================================================================

function paraData(d: string | Date): Date {
  return typeof d === "string" ? new Date(d) : d;
}

/**
 * Chave de agrupamento por dia, no formato AAAA-MM-DD, **no fuso local**.
 *
 * ⚠️ NÃO use `toISOString().slice(0,10)` para isso. `toISOString` converte
 * para UTC, e o Brasil está a UTC-3: um compromisso das 21h de 26/07 vira
 * "2026-07-27" em UTC e cai na coluna do dia seguinte. Como a agenda é
 * cheia de compromissos de fim de tarde/noite, esse bug apareceria todo
 * dia. Montar a string a partir de getFullYear/getMonth/getDate mantém a
 * chave no mesmo dia que o usuário vê no relógio.
 */
export function chaveDia(d: string | Date): string {
  const data = paraData(d);
  const ano = data.getFullYear();
  const mes = String(data.getMonth() + 1).padStart(2, "0");
  const dia = String(data.getDate()).padStart(2, "0");
  return `${ano}-${mes}-${dia}`;
}

/** Inverso de `chaveDia`: "2026-07-26" → Date local à meia-noite. */
export function dataDaChave(chave: string): Date {
  const [ano, mes, dia] = chave.split("-").map(Number);
  return new Date(ano, (mes ?? 1) - 1, dia ?? 1, 0, 0, 0, 0);
}

/** Meia-noite local do dia informado. */
export function inicioDoDia(d: string | Date): Date {
  const data = paraData(d);
  return new Date(data.getFullYear(), data.getMonth(), data.getDate(), 0, 0, 0, 0);
}

/**
 * Domingo (00:00 local) da semana do dia informado. Domingo porque é o
 * primeiro dia da semana no calendário brasileiro impresso, que é a
 * referência que a imobiliária usa.
 */
export function inicioDaSemana(d: string | Date): Date {
  const data = inicioDoDia(d);
  data.setDate(data.getDate() - data.getDay());
  return data;
}

/** Dia 1 (00:00 local) do mês do dia informado. */
export function inicioDoMes(d: string | Date): Date {
  const data = paraData(d);
  return new Date(data.getFullYear(), data.getMonth(), 1, 0, 0, 0, 0);
}

/** Mesmo dia do calendário? Compara pela chave local, não pelo instante. */
export function mesmoDia(a: string | Date, b: string | Date): boolean {
  return chaveDia(a) === chaveDia(b);
}

/**
 * Diferença em DIAS DE CALENDÁRIO entre dois instantes (b − a).
 * Normaliza os dois para meia-noite local antes de subtrair, senão
 * "hoje 23h → amanhã 01h" daria 0 dias em vez de 1.
 */
export function diasEntre(a: string | Date, b: string | Date): number {
  const de = dataDaChave(chaveDia(a)).getTime();
  const ate = dataDaChave(chaveDia(b)).getTime();
  return Math.round((ate - de) / DIA_MS);
}

/**
 * Soma dias a um instante preservando a hora do relógio.
 * A soma é feita em milissegundos sobre o timestamp — é assim que o
 * kanban reagenda sem "reinterpretar" o instante no fuso do navegador.
 */
export function somarDias(d: string | Date, dias: number): Date {
  return new Date(paraData(d).getTime() + dias * DIA_MS);
}

/**
 * Número ISO-8601 da semana (1–53). A referência visual do cliente mostra
 * esse número na lateral de cada linha do mês.
 *
 * Regra ISO: a semana começa na SEGUNDA e a semana 1 é a que contém a
 * primeira quinta-feira do ano. Por isso o cálculo desloca a data para a
 * quinta da própria semana antes de comparar — é o truque padrão que
 * resolve a virada de ano sem casos especiais.
 */
export function numeroDaSemanaISO(d: string | Date): number {
  const alvo = inicioDoDia(d);
  const diaISO = (alvo.getDay() + 6) % 7; // 0 = segunda … 6 = domingo
  alvo.setDate(alvo.getDate() - diaISO + 3); // quinta-feira desta semana

  const quintaDaSemana1 = new Date(alvo.getFullYear(), 0, 4);
  const diaISO1 = (quintaDaSemana1.getDay() + 6) % 7;
  quintaDaSemana1.setDate(quintaDaSemana1.getDate() - diaISO1 + 3);

  return 1 + Math.round((alvo.getTime() - quintaDaSemana1.getTime()) / (7 * DIA_MS));
}

/**
 * Intervalo ocupado por um item, em dias de calendário — é o que as vistas
 * de mês/semana usam para desenhar a barra de um compromisso multi-dia.
 *
 * Devolve `null` quando o item ainda não tem data (backlog): não há
 * intervalo a desenhar, e devolver uma data inventada faria a barra
 * aparecer num dia qualquer. Quem desenha calendário deve filtrar por
 * `temData` antes, e o `null` aqui é a rede de segurança.
 *
 * `dia_inteiro` força no mínimo 24h de ocupação, senão uma "viagem" de dia
 * inteiro cadastrada com 60min viraria uma pílula de uma hora.
 */
export function intervaloEmDias(
  item: Pick<AgendaItem, "data_hora" | "duracao_min" | "dia_inteiro">,
): { inicio: Date; fim: Date; dias: number } | null {
  if (!item.data_hora) return null;
  const inicio = item.dia_inteiro ? inicioDoDia(item.data_hora) : new Date(item.data_hora);
  const duracao = item.dia_inteiro
    ? Math.max(item.duracao_min, 24 * 60)
    : Math.max(item.duracao_min, 1);
  // −1ms: um compromisso que termina exatamente à meia-noite pertence ao
  // dia que acabou, não ao seguinte.
  const fim = new Date(inicio.getTime() + duracao * 60_000 - 1);
  return { inicio, fim, dias: diasEntre(inicio, fim) + 1 };
}

/** "14:00" */
export function formatarHora(d: string | Date): string {
  return paraData(d).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

/** "14:00 – 15:00" (o fim sai da duração em minutos). */
export function formatarIntervalo(d: string | Date, duracaoMin: number): string {
  const inicio = paraData(d);
  const fim = new Date(inicio.getTime() + Math.max(0, duracaoMin) * 60_000);
  return `${formatarHora(inicio)} – ${formatarHora(fim)}`;
}

/** "26/07" */
export function formatarDiaCurto(d: string | Date): string {
  return paraData(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

/** "quinta, 26 de julho" */
export function formatarDiaLongo(d: string | Date): string {
  return paraData(d).toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

/** "qui" — cabeçalho de coluna do quadro. */
export function formatarDiaSemanaCurto(d: string | Date): string {
  return paraData(d)
    .toLocaleDateString("pt-BR", { weekday: "short" })
    .replace(".", "");
}

/** "Julho de 2026" */
export function formatarMesAno(d: string | Date): string {
  const texto = paraData(d).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return texto.charAt(0).toUpperCase() + texto.slice(1);
}

/** Duração legível: 90 → "1h30". */
export function formatarDuracao(min: number): string {
  if (min < 60) return `${min}min`;
  const horas = Math.floor(min / 60);
  const resto = min % 60;
  return resto === 0 ? `${horas}h` : `${horas}h${String(resto).padStart(2, "0")}`;
}

/**
 * Rótulo curto de faixa para o cartão do painel lateral: "24 – 25 set",
 * "24 set" ou, quando o item nem data tem, a duração prevista ("2 dias").
 */
export function formatarFaixaDatas(
  item: Pick<AgendaItem, "data_hora" | "duracao_min" | "dia_inteiro">,
): string | null {
  const intervalo = intervaloEmDias(item);
  if (!intervalo) {
    // Sem data: o que dá para dizer é quanto tempo o compromisso ocupa.
    if (item.dia_inteiro || item.duracao_min >= 24 * 60) {
      const dias = Math.max(1, Math.round(item.duracao_min / (24 * 60)));
      return dias === 1 ? "1 dia" : `${dias} dias`;
    }
    return formatarDuracao(item.duracao_min);
  }
  const dia = (d: Date) =>
    d.toLocaleDateString("pt-BR", { day: "numeric", month: "short" }).replace(".", "");
  if (intervalo.dias <= 1) return dia(intervalo.inicio);
  return `${intervalo.inicio.getDate()} – ${dia(intervalo.fim)}`;
}

// =====================================================================
// 4. Cor
// =====================================================================

/**
 * Cor do item: a cor manual vence, senão cai na cor do tipo.
 * Hex (e não classe Tailwind) porque a cor pode vir do banco, e o
 * Tailwind não gera classe que ele não viu em tempo de build.
 */
export function corDoItem(item: Pick<AgendaItem, "cor" | "tipo">): string {
  return item.cor ?? AGENDA_TIPO_COR[item.tipo] ?? AGENDA_TIPO_COR.outro;
}

/** Iniciais para o avatar circular do responsável. */
export function iniciais(nome: string | null | undefined): string {
  if (!nome) return "?";
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
