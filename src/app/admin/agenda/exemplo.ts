import type { AgendaItem, AgendaStatus, AgendaTipo } from "@/lib/types";
import type { Agente } from "./shared";

// =====================================================================
// Dados de EXEMPLO — só no navegador, nunca no banco.
//
// Por que existe: as duas tabelas da agenda estão zeradas, e um calendário
// vazio não mostra nada de barra multi-dia, sobreposição de horário ou
// painel de não agendados. Sem dado, não dá para julgar o resultado.
//
// Por que em memória e não um seed no banco: compromisso falso num CRM que
// a equipe usa de verdade é o tipo de coisa que alguém trata como real e
// vai a uma visita que não existe. Aqui os itens vivem só no estado do
// React — recarregar a página sem o modo ligado já os elimina, e não há
// nada para limpar depois.
//
// Os casos foram escolhidos para exercitar o que é difícil de acertar:
// dois compromissos no mesmo horário (sobreposição), um de três dias
// (barra que atravessa a virada de semana), status variados, item sem
// responsável (linha "Sem responsável" da timeline) e itens sem data
// (painel lateral).
// =====================================================================

/** Marca no id — é o que permite filtrar/ignorar exemplo em qualquer lugar. */
export const PREFIXO_EXEMPLO = "demo:";

export function ehExemplo(item: Pick<AgendaItem, "id">): boolean {
  return item.id.startsWith(PREFIXO_EXEMPLO);
}

type Molde = {
  titulo: string;
  tipo: AgendaTipo;
  status: AgendaStatus;
  /** Dias a partir de hoje. Ausente = item sem data (backlog). */
  dias?: number;
  hora?: number;
  minuto?: number;
  duracao: number;
  diaInteiro?: boolean;
  local?: string;
  /** Índice do agente na lista; -1 = sem responsável. */
  agente?: number;
};

const MOLDES: Molde[] = [
  // Mesmo horário, dois compromissos: é o caso que a grade de horas e a
  // timeline precisam resolver dividindo/empilhando.
  { titulo: "Visita — Casa no Jardim Europa", tipo: "visita", status: "confirmado", dias: 0, hora: 9, duracao: 60, local: "Rua das Acácias, 240", agente: 0 },
  { titulo: "Reunião de captação", tipo: "reuniao", status: "agendado", dias: 0, hora: 9, minuto: 30, duracao: 90, agente: 1 },
  { titulo: "Ligação de retorno — proposta", tipo: "ligacao", status: "agendado", dias: 0, hora: 14, duracao: 30, agente: -1 },

  { titulo: "Assinatura de contrato", tipo: "assinatura", status: "confirmado", dias: 1, hora: 10, duracao: 60, local: "Cartório do 2º Ofício", agente: 0 },
  { titulo: "Gravação de vídeo do imóvel", tipo: "gravacao", status: "agendado", dias: 1, hora: 15, duracao: 120, agente: 2 },

  // Três dias: barra contínua no mês, faixa de dia inteiro na semana.
  { titulo: "Feirão de imóveis", tipo: "outro", status: "confirmado", dias: 2, hora: 8, duracao: 60 * 24 * 3, diaInteiro: true, local: "Centro de Convenções", agente: 1 },

  { titulo: "Reunião semanal da equipe", tipo: "reuniao", status: "agendado", dias: 3, hora: 8, duracao: 60, agente: 0 },
  { titulo: "Visita — Apartamento Centro", tipo: "visita", status: "agendado", dias: 4, hora: 16, duracao: 45, agente: 2 },
  { titulo: "Retorno ao proprietário", tipo: "retorno", status: "concluido", dias: 5, hora: 11, duracao: 30, agente: 1 },

  // Passado: mostra como concluído, cancelado e não comparecido se distinguem.
  { titulo: "Visita cancelada pelo cliente", tipo: "visita", status: "cancelado", dias: -1, hora: 14, duracao: 60, agente: 0 },
  { titulo: "Cliente não compareceu", tipo: "visita", status: "nao_compareceu", dias: -2, hora: 10, duracao: 60, agente: 2 },
  { titulo: "Vistoria de entrega", tipo: "outro", status: "concluido", dias: -3, hora: 9, duracao: 90, agente: 1 },

  // Adiante: preenche a segunda metade do mês.
  { titulo: "Vistoria de entrega", tipo: "outro", status: "agendado", dias: 8, hora: 9, duracao: 90, agente: 0 },
  { titulo: "Reunião com investidor", tipo: "reuniao", status: "agendado", dias: 11, hora: 15, duracao: 60, agente: 1 },
  { titulo: "Visita — Chácara em Itu", tipo: "visita", status: "agendado", dias: 14, hora: 10, duracao: 180, agente: 2 },

  // Sem data: painel lateral.
  { titulo: "Avaliar imóvel na Vila Nova", tipo: "visita", status: "agendado", duracao: 60, agente: 0 },
  { titulo: "Retorno — cliente pediu para ligar depois", tipo: "retorno", status: "agendado", duracao: 30, agente: 1 },
  { titulo: "Fotografar fachada", tipo: "gravacao", status: "agendado", duracao: 45, agente: -1 },
  { titulo: "Reunião de alinhamento com o jurídico", tipo: "reuniao", status: "agendado", duracao: 60, agente: 2 },
];

/**
 * Monta os itens de exemplo ancorados em `dataBase`, e não em "hoje": se o
 * usuário navegar para outro mês, os exemplos acompanham — senão ele
 * trocaria de mês e veria a tela vazia de novo, que é justamente o que
 * este modo existe para evitar.
 */
export function itensDeExemplo(dataBase: Date, agentes: Agente[]): AgendaItem[] {
  const base = new Date(dataBase.getFullYear(), dataBase.getMonth(), dataBase.getDate());

  return MOLDES.map((m, i) => {
    let dataHora: string | null = null;
    if (m.dias !== undefined) {
      // Construtor local (não soma de ms) para não escorregar uma hora numa
      // virada de horário de verão.
      const d = new Date(
        base.getFullYear(), base.getMonth(), base.getDate() + m.dias,
        m.hora ?? 9, m.minuto ?? 0, 0, 0,
      );
      dataHora = d.toISOString();
    }

    const idxAgente = m.agente ?? -1;
    const responsavel =
      idxAgente >= 0 && agentes.length > 0 ? agentes[idxAgente % agentes.length]?.id ?? null : null;

    return {
      id: `${PREFIXO_EXEMPLO}${i}`,
      origem: "evento",
      rawId: `${PREFIXO_EXEMPLO}${i}`,
      titulo: m.titulo,
      tipo: m.tipo,
      status: m.status,
      data_hora: dataHora,
      duracao_min: m.duracao,
      dia_inteiro: m.diaInteiro === true,
      observacoes: null,
      local: m.local ?? null,
      cor: null,
      ordem: i,
      responsavel_id: responsavel,
      setor_destino: null,
      criado_por_sector: null,
      lead_id: null,
      lead_nome: null,
      property_id: null,
      property_codigo: null,
    } satisfies AgendaItem;
  });
}
