import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AgendaAgrupamento, AgendaVista, Sector } from "@/lib/types";
import { AgendaShell } from "./AgendaShell";
import {
  DIA_MS,
  chaveDia,
  inicioDaSemana,
  inicioDoDia,
  inicioDoMes,
  normalizarItens,
  somarDias,
  type Agente,
  type AgendamentoRow,
  type EventoRow,
} from "./shared";

const VISTAS: AgendaVista[] = ["kanban", "timeline", "mes", "semana", "lista"];
const AGRUPAMENTOS: AgendaAgrupamento[] = ["dia", "status", "tipo", "setor", "responsavel"];

/** Colunas lidas de `agenda_events`. Espelha `EventoRow`. */
const COLUNAS_EVENTO =
  "id, titulo, tipo, data_hora, duracao_min, dia_inteiro, status, ordem, cor, local, observacoes, responsavel_id, setor_destino, criado_por_sector, property_id, properties(codigo)";

/** Colunas lidas de `lead_appointments`. Espelha `AgendamentoRow`. */
const COLUNAS_AGENDAMENTO =
  "id, lead_id, tipo, data_hora, duracao_min, dia_inteiro, status, ordem, local, observacoes, responsavel_id, property_id, leads(nome), properties(codigo)";

/**
 * Quantos dias cada vista precisa ter em mãos.
 * O servidor carrega o período INTEIRO da vista (com uma folga de um dia
 * em cada ponta) e deixa a vista recortar. Fazer o recorte no cliente é o
 * que permite trocar de filtro sem refazer a consulta, e a folga evita que
 * um compromisso das 23h suma da borda por diferença de fuso entre o
 * filtro (UTC, no banco) e o agrupamento (local, na tela).
 */
function periodoDaVista(vista: AgendaVista, base: Date): { inicio: Date; dias: number } {
  switch (vista) {
    case "kanban":
    case "semana":
      return { inicio: inicioDaSemana(base), dias: 7 };
    case "mes":
      // 6 semanas: um mês nunca ocupa mais que isso numa grade dominical.
      return { inicio: inicioDaSemana(inicioDoMes(base)), dias: 42 };
    case "timeline":
      return { inicio: inicioDoDia(base), dias: 14 };
    case "lista":
      return { inicio: inicioDoDia(base), dias: 30 };
  }
}

/**
 * "2026-07-26" → Date local ao MEIO-DIA.
 * Meio-dia (e não meia-noite) porque essa data só serve de âncora para
 * calcular períodos; ancorar no meio do dia deixa qualquer soma/subtração
 * imune a horário de verão, caso ele volte algum dia.
 */
function lerDataBase(valor: string | undefined): Date {
  if (!valor) return new Date();
  const partes = valor.split("-").map(Number);
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) return new Date();
  return new Date(partes[0], partes[1] - 1, partes[2], 12, 0, 0, 0);
}

export default async function AgendaPage({
  searchParams,
}: {
  searchParams: { vista?: string; data?: string; agrupar?: string };
}) {
  // Agenda aberta a todos os setores: cada um vê a sua + o que foi delegado.
  const { user, profile } = await requireUser();
  const sector = (profile?.sector ?? "recepcao") as Sector;
  const isLeadSector =
    ["recepcao", "administrativo", "admin_central"].includes(sector) || !!profile?.is_admin_central;

  // A vista da URL vence; sem ela, abre na última que o usuário usou
  // (`profiles.agenda_vista`), que é o motivo dessa coluna existir.
  const vistaPreferida = (profile as { agenda_vista?: string } | null)?.agenda_vista;
  const vista: AgendaVista = VISTAS.includes(searchParams.vista as AgendaVista)
    ? (searchParams.vista as AgendaVista)
    : VISTAS.includes(vistaPreferida as AgendaVista)
      ? (vistaPreferida as AgendaVista)
      : "kanban";

  const agrupamento: AgendaAgrupamento = AGRUPAMENTOS.includes(
    searchParams.agrupar as AgendaAgrupamento,
  )
    ? (searchParams.agrupar as AgendaAgrupamento)
    : "dia";

  const base = lerDataBase(searchParams.data);
  const { inicio, dias } = periodoDaVista(vista, base);
  const fim = somarDias(inicio, dias);

  // Folga de um dia em cada ponta (ver comentário de `periodoDaVista`).
  const consultaDe = new Date(inicio.getTime() - DIA_MS).toISOString();
  const consultaAte = new Date(fim.getTime() + DIA_MS).toISOString();

  const supabase = createSupabaseServer();
  const semAgendamentos = Promise.resolve({ data: [] });

  const [eventosRes, agendamentosRes, eventosSemDataRes, agendamentosSemDataRes, agentesRes] =
    await Promise.all([
      // Compromissos próprios e delegados (RLS: criador, setor destino, diretoria).
      supabase
        .from("agenda_events")
        .select(COLUNAS_EVENTO)
        .gte("data_hora", consultaDe)
        .lt("data_hora", consultaAte)
        .order("data_hora", { ascending: true }),
      // Agendamentos de leads — só setores com acesso a leads (RLS também filtra).
      isLeadSector
        ? supabase
            .from("lead_appointments")
            .select(COLUNAS_AGENDAMENTO)
            .gte("data_hora", consultaDe)
            .lt("data_hora", consultaAte)
            .order("data_hora", { ascending: true })
        : semAgendamentos,
      // Backlog: `data_hora is null` NÃO entra num filtro por intervalo
      // (comparação com null é sempre "unknown" em SQL), então precisa de
      // consulta própria. O índice parcial de 0039 atende exatamente isto.
      supabase
        .from("agenda_events")
        .select(COLUNAS_EVENTO)
        .is("data_hora", null)
        .order("ordem", { ascending: true })
        .limit(300),
      isLeadSector
        ? supabase
            .from("lead_appointments")
            .select(COLUNAS_AGENDAMENTO)
            .is("data_hora", null)
            .order("ordem", { ascending: true })
            .limit(300)
        : semAgendamentos,
      // Perfis ativos: alimentam o filtro de responsável e os avatares.
      supabase.from("profiles").select("id, nome, avatar_url").eq("ativo", true).order("nome"),
    ]);

  const itens = normalizarItens(
    (eventosRes.data ?? []) as unknown as EventoRow[],
    (agendamentosRes.data ?? []) as unknown as AgendamentoRow[],
  );

  const semData = normalizarItens(
    (eventosSemDataRes.data ?? []) as unknown as EventoRow[],
    (agendamentosSemDataRes.data ?? []) as unknown as AgendamentoRow[],
  );

  const agentes: Agente[] = (
    (agentesRes.data ?? []) as { id: string; nome: string; avatar_url: string | null }[]
  ).map((a) => ({ id: a.id, nome: a.nome, avatarUrl: a.avatar_url }));

  return (
    <AgendaShell
      vista={vista}
      agrupamento={agrupamento}
      dataBase={chaveDia(base)}
      inicio={inicio.toISOString()}
      fim={fim.toISOString()}
      itens={itens}
      semData={semData}
      agentes={agentes}
      userId={user.id}
      sector={sector}
    />
  );
}
