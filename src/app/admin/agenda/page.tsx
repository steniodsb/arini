import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Calendar as CalendarIcon, Phone, MessageCircle, Home, FileSignature, Users, type LucideIcon } from "lucide-react";
import { formatDateTimeBR } from "@/lib/utils";

interface Appt {
  id: string;
  lead_id: string;
  tipo: string;
  data_hora: string;
  confirmado: boolean;
  observacoes: string | null;
  leads: { nome: string; whatsapp: string | null; telefone: string | null } | null;
}

const TIPO_ICON: Record<string, LucideIcon> = {
  visita: Home,
  reuniao: Users,
  ligacao: Phone,
  retorno: MessageCircle,
  assinatura: FileSignature,
};

const TIPO_COLOR: Record<string, string> = {
  visita: "bg-purple-500",
  reuniao: "bg-blue-500",
  ligacao: "bg-amber-500",
  retorno: "bg-pink-500",
  assinatura: "bg-emerald-500",
};

function startOfWeek(d: Date) {
  const date = new Date(d);
  date.setHours(0, 0, 0, 0);
  const day = date.getDay();
  date.setDate(date.getDate() - day);
  return date;
}

export default async function AgendaPage({ searchParams }: { searchParams: { date?: string } }) {
  await requireSector(["recepcao", "administrativo", "admin_central"]);
  const baseDate = searchParams.date ? new Date(searchParams.date) : new Date();
  const weekStart = startOfWeek(baseDate);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 7);

  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("lead_appointments")
    .select("*, leads(nome, whatsapp, telefone)")
    .gte("data_hora", weekStart.toISOString())
    .lt("data_hora", weekEnd.toISOString())
    .order("data_hora", { ascending: true });
  const appointments = (data ?? []) as Appt[];

  // Agrupa por dia
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart);
    d.setDate(weekStart.getDate() + i);
    return d;
  });

  const apptsByDay: Record<string, Appt[]> = {};
  for (const a of appointments) {
    const key = new Date(a.data_hora).toDateString();
    apptsByDay[key] = apptsByDay[key] ?? [];
    apptsByDay[key].push(a);
  }

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
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CalendarIcon size={18} />
            Semana de {weekStart.toLocaleDateString("pt-BR")} a {new Date(weekEnd.getTime() - 1).toLocaleDateString("pt-BR")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-3">
            {days.map((d) => {
              const dayAppts = apptsByDay[d.toDateString()] ?? [];
              const isToday = d.toDateString() === new Date().toDateString();
              const isPast = d < new Date(new Date().setHours(0,0,0,0));
              return (
                <div key={d.toISOString()} className={`min-h-[200px] rounded-lg border p-2 ${isToday ? "border-gold bg-gold/5" : isPast ? "bg-muted/30" : ""}`}>
                  <div className="text-center pb-2 border-b">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {d.toLocaleDateString("pt-BR", { weekday: "short" })}
                    </div>
                    <div className={`text-xl font-semibold ${isToday ? "text-gold-dark" : "text-arini"}`}>
                      {d.getDate()}
                    </div>
                  </div>
                  <div className="mt-2 space-y-1">
                    {dayAppts.length === 0 && (
                      <div className="text-[10px] text-muted-foreground/60 italic text-center py-3">Vazio</div>
                    )}
                    {dayAppts.map((a) => {
                      const Icon = TIPO_ICON[a.tipo] ?? CalendarIcon;
                      const color = TIPO_COLOR[a.tipo] ?? "bg-arini";
                      const time = new Date(a.data_hora).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
                      return (
                        <Link key={a.id} href={`/admin/leads/${a.lead_id}`}
                              className="block p-1.5 rounded bg-white border hover:border-gold transition-colors">
                          <div className="flex items-center gap-1">
                            <span className={`w-1.5 h-1.5 rounded-full ${color}`} />
                            <span className="text-[10px] text-muted-foreground">{time}</span>
                          </div>
                          <div className="text-[11px] font-medium text-arini truncate">
                            {a.leads?.nome ?? "—"}
                          </div>
                          <div className="text-[10px] text-muted-foreground flex items-center gap-1">
                            <Icon size={10} /> {a.tipo}
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

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
