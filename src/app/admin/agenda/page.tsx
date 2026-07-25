import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon } from "lucide-react";
import { formatDateTimeBR } from "@/lib/utils";
import { SECTOR_LABELS, type Sector } from "@/lib/types";
import { NewEventDialog } from "./NewEventDialog";
import { AgendaKanban } from "./AgendaKanban";

interface Appt {
  id: string;
  lead_id: string;
  tipo: string;
  data_hora: string;
  confirmado: boolean;
  observacoes: string | null;
  leads: { nome: string; whatsapp: string | null; telefone: string | null } | null;
}

interface AgendaEvent {
  id: string;
  titulo: string;
  tipo: string;
  data_hora: string;
  setor_destino: Sector | null;
  criado_por_sector: Sector | null;
  observacoes: string | null;
  confirmado: boolean;
}

function startOfWeek(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

export default async function AgendaPage({ searchParams }: { searchParams: { date?: string } }) {
  // Agenda aberta a todos os setores: cada um vê a sua + o que foi delegado.
  const { user, profile } = await requireUser();
  const sector = (profile?.sector ?? "recepcao") as Sector;
  const isLeadSector = ["recepcao", "administrativo", "admin_central"].includes(sector) || profile?.is_admin_central;
  const baseDate = searchParams.date ? new Date(searchParams.date) : new Date();
  const weekStart = startOfWeek(baseDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const supabase = createSupabaseServer();
  // Agendamentos de leads (setores com acesso a leads) — RLS também filtra.
  const { data } = isLeadSector
    ? await supabase
        .from("lead_appointments")
        .select("*, leads(nome, whatsapp, telefone)")
        .gte("data_hora", weekStart.toISOString())
        .lt("data_hora", weekEnd.toISOString())
        .order("data_hora", { ascending: true })
    : { data: [] };
  const appointments = (data ?? []) as Appt[];

  // Compromissos próprios e delegados (RLS: criador, setor destino, diretoria).
  const { data: eventsData } = await supabase
    .from("agenda_events")
    .select("*")
    .gte("data_hora", weekStart.toISOString())
    .lt("data_hora", weekEnd.toISOString())
    .order("data_hora", { ascending: true });
  const events = (eventsData ?? []) as AgendaEvent[];

  // Agrupa por dia
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const prevWeek = new Date(weekStart);
  prevWeek.setDate(weekStart.getDate() - 7);
  const nextWeek = new Date(weekStart);
  nextWeek.setDate(weekStart.getDate() + 7);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Agenda</h1>
          <p className="text-muted-foreground mt-1">
            Visitas, reuniões, ligações, retornos e assinaturas agendadas.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/admin/agenda?date=${prevWeek.toISOString().slice(0, 10)}`}
                className="px-3 py-2 rounded-md border hover:bg-muted text-sm">← Semana anterior</Link>
          <Link href={`/admin/agenda?date=${new Date().toISOString().slice(0, 10)}`}
                className="px-3 py-2 rounded-md border hover:bg-muted text-sm">Hoje</Link>
          <Link href={`/admin/agenda?date=${nextWeek.toISOString().slice(0, 10)}`}
                className="px-3 py-2 rounded-md border hover:bg-muted text-sm">Próxima semana →</Link>
          <NewEventDialog userId={user.id} sector={sector} />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon size={18} />
            Semana de {weekStart.toLocaleDateString("pt-BR")} a {new Date(weekEnd.getTime() - 1).toLocaleDateString("pt-BR")}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Arraste um cartão para outro dia para reagendar.</p>
        </CardHeader>
        <CardContent>
          <AgendaKanban
            weekStart={weekStart.toISOString()}
            dayLabels={days.map((d) => ({ label: d.toLocaleDateString("pt-BR", { weekday: "short" }), dayNum: d.getDate() }))}
            initialAppointments={appointments}
            initialEvents={events}
          />
        </CardContent>
      </Card>

      {events.length > 0 && (
        <Card>
          <CardHeader><CardTitle>Compromissos da semana ({events.length})</CardTitle></CardHeader>
          <CardContent>
            <ul className="divide-y">
              {events.map((e) => (
                <li key={e.id} className="py-3 flex items-center justify-between">
                  <div className="flex-1">
                    <div className="text-arini font-medium">{e.titulo}</div>
                    <div className="text-xs text-muted-foreground">
                      {e.criado_por_sector && `De ${SECTOR_LABELS[e.criado_por_sector]}`}
                      {e.setor_destino && ` → para ${SECTOR_LABELS[e.setor_destino]}`}
                      {e.observacoes && ` · ${e.observacoes}`}
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{e.tipo}</Badge>
                    <span className="text-sm text-arini font-mono">{formatDateTimeBR(e.data_hora)}</span>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Próximos agendamentos da semana ({appointments.length})</CardTitle></CardHeader>
        <CardContent>
          {appointments.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-6">Nenhum agendamento esta semana.</p>
          ) : (
            <ul className="divide-y">
              {appointments.map((a) => (
                <li key={a.id} className="py-3 flex items-center justify-between">
                  <Link href={`/admin/leads/${a.lead_id}`} className="flex-1 hover:text-gold-dark">
                    <div className="text-arini font-medium">{a.leads?.nome ?? "—"}</div>
                    <div className="text-xs text-muted-foreground">{a.observacoes ?? "Sem observações"}</div>
                  </Link>
                  <div className="flex items-center gap-3">
                    <Badge variant="outline">{a.tipo}</Badge>
                    {a.confirmado ? <Badge variant="success">Confirmado</Badge> : <Badge variant="warning">A confirmar</Badge>}
                    <span className="text-sm text-arini font-mono">{formatDateTimeBR(a.data_hora)}</span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
