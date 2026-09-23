import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AgendaAgrupamento, AgendaVista, Sector } from "@/lib/types";
import { AgendaShell } from "@/app/admin/agenda/AgendaShell";
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
} from "@/app/admin/agenda/shared";
import { isoDiaBR } from "@/lib/fuso";

// =====================================================================
// AGENDA DENTRO DO ATENDIMENTO
//
// Relatado em 23/09: "não está aparecendo a opção de agendamento
// vinculada ao sistema". Ela existia — em crm.<domínio>/admin/agenda,
// que é OUTRO host, com OUTRO login (a sessão é por subdomínio) e sem
// nenhum link a partir daqui. Para quem vive no atendimento, era como se
// não existisse.
//
// Esta página é a MESMA agenda (mesmas tabelas, mesma RLS, mesma casca
// `AgendaShell`), só que servida no host do atendimento e com a sessão
// do atendimento. O que difere do `admin/agenda/page.tsx`:
//   · a guarda é `requireAtendimentoUser` (flag de acesso ao atendimento);
//   · `basePath` aponta para cá, senão trocar de semana jogaria a
//     pessoa no CRM.
// A leitura dos dados é idêntica de propósito — duas agendas que
// divergem seria pior que nenhuma.
// =====================================================================

export const dynamic = "force-dynamic";

const VISTAS: AgendaVista[] = ["kanban", "timeline", "mes", "semana", "lista"];
const AGRUPAMENTOS: AgendaAgrupamento[] = ["dia", "status", "tipo", "setor", "responsavel"];

const COLUNAS_EVENTO =
  "id, titulo, tipo, data_hora, duracao_min, dia_inteiro, status, ordem, cor, local, observacoes, responsavel_id, setor_destino, criado_por_sector, property_id, properties(codigo)";
const COLUNAS_AGENDAMENTO =
  "id, lead_id, tipo, data_hora, duracao_min, dia_inteiro, status, ordem, local, observacoes, responsavel_id, property_id, leads(nome), properties(codigo)";

function periodoDaVista(vista: AgendaVista, base: Date): { inicio: Date; dias: number } {
  switch (vista) {
    case "kanban":
    case "semana":
      return { inicio: inicioDaSemana(base), dias: 7 };
    case "mes":
      return { inicio: inicioDaSemana(inicioDoMes(base)), dias: 42 };
    case "timeline":
      return { inicio: inicioDoDia(base), dias: 14 };
    case "lista":
      return { inicio: inicioDoDia(base), dias: 30 };
  }
}

function lerDataBase(valor: string | undefined): Date {
  const partes = (valor || isoDiaBR()).split("-").map(Number);
  if (partes.length !== 3 || partes.some((n) => Number.isNaN(n))) return inicioDoDia(new Date());
  return new Date(partes[0], partes[1] - 1, partes[2], 12, 0, 0, 0);
}

export default async function AgendaAtendimentoPage({
  searchParams,
}: {
  searchParams: { vista?: string; data?: string; agrupar?: string };
}) {
  const { user, profile } = await requireAtendimentoUser();
  const sector = (profile.sector ?? "recepcao") as Sector;
  const isLeadSector =
    ["recepcao", "administrativo", "admin_central"].includes(sector) || !!profile.is_admin_central;

  const vistaPreferida = (profile as { agenda_vista?: string } | null)?.agenda_vista;
  const vista: AgendaVista = VISTAS.includes(searchParams.vista as AgendaVista)
    ? (searchParams.vista as AgendaVista)
    : VISTAS.includes(vistaPreferida as AgendaVista)
      ? (vistaPreferida as AgendaVista)
      : "semana";

  const agrupamento: AgendaAgrupamento = AGRUPAMENTOS.includes(
    searchParams.agrupar as AgendaAgrupamento,
  )
    ? (searchParams.agrupar as AgendaAgrupamento)
    : "dia";

  const base = lerDataBase(searchParams.data);
  const { inicio, dias } = periodoDaVista(vista, base);
  const fim = somarDias(inicio, dias);
  const consultaDe = new Date(inicio.getTime() - DIA_MS).toISOString();
  const consultaAte = new Date(fim.getTime() + DIA_MS).toISOString();

  const supabase = createSupabaseServer();
  const semAgendamentos = Promise.resolve({ data: [] });

  const [eventosRes, agendamentosRes, eventosSemDataRes, agendamentosSemDataRes, agentesRes] =
    await Promise.all([
      supabase
        .from("agenda_events")
        .select(COLUNAS_EVENTO)
        .gte("data_hora", consultaDe)
        .lt("data_hora", consultaAte)
        .order("data_hora", { ascending: true }),
      isLeadSector
        ? supabase
            .from("lead_appointments")
            .select(COLUNAS_AGENDAMENTO)
            .gte("data_hora", consultaDe)
            .lt("data_hora", consultaAte)
            .order("data_hora", { ascending: true })
        : semAgendamentos,
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
    <div className="h-full overflow-y-auto">
      <div className="p-4 md:p-6">
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
          basePath="/atendimento/agenda"
        />
      </div>
    </div>
  );
}
