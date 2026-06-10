import Link from "next/link";
import { requireUser, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock } from "lucide-react";
import { TIME_ENTRY_LABELS, type TimeEntry, type TimeEntryType } from "@/lib/types";
import { PunchClock } from "./PunchClock";

function fmt(ts: string) {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

function fmtHours(ms: number) {
  if (ms <= 0) return "—";
  const totalMin = Math.round(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h${String(m).padStart(2, "0")}`;
}

/**
 * Horas trabalhadas de um dia: (última saída − primeira entrada) menos o
 * intervalo (primeiro início → último fim). Se o dia está em aberto (sem
 * saída), considera até agora.
 */
function workedMs(entries: TimeEntry[]): { ms: number; aberto: boolean } {
  const sorted = [...entries].sort((a, b) => +new Date(a.registrado_em) - +new Date(b.registrado_em));
  const first = (t: TimeEntryType) => sorted.find((e) => e.tipo === t);
  const last = (t: TimeEntryType) => [...sorted].reverse().find((e) => e.tipo === t);
  const entrada = first("entrada");
  if (!entrada) return { ms: 0, aberto: false };
  const saida = last("saida");
  const fim = saida ? +new Date(saida.registrado_em) : Date.now();
  let ms = fim - +new Date(entrada.registrado_em);
  const pIni = first("intervalo_inicio");
  const pFim = last("intervalo_fim");
  if (pIni && pFim && +new Date(pFim.registrado_em) > +new Date(pIni.registrado_em)) {
    ms -= +new Date(pFim.registrado_em) - +new Date(pIni.registrado_em);
  }
  return { ms: Math.max(0, ms), aberto: !saida };
}

function groupByDay(entries: TimeEntry[]): Record<string, TimeEntry[]> {
  const byDay: Record<string, TimeEntry[]> = {};
  for (const e of entries) {
    const key = new Date(e.registrado_em).toLocaleDateString("pt-BR");
    (byDay[key] = byDay[key] ?? []).push(e);
  }
  return byDay;
}

export default async function PontoPage() {
  const { user, profile } = await requireUser();
  const supabase = createSupabaseServer();
  const admin = isDiretoria(profile) || profile?.sector === "administrativo";

  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();

  const { data: mine } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", user.id)
    .gte("registrado_em", monthStart)
    .order("registrado_em", { ascending: false })
    .limit(300);

  // Diretoria/administrativo: registros do mês de toda a equipe p/ somar horas.
  const { data: all } = admin
    ? await supabase
        .from("time_entries")
        .select("*, profiles(nome)")
        .gte("registrado_em", monthStart)
        .order("registrado_em", { ascending: false })
        .limit(2000)
    : { data: null };

  const myEntries = (mine ?? []) as TimeEntry[];
  const lastType = myEntries[0]?.tipo as TimeEntryType | undefined;

  // Minhas horas por dia (mês corrente)
  const myByDay = groupByDay(myEntries);
  const myDays = Object.entries(myByDay).map(([dia, list]) => ({ dia, ...workedMs(list), regs: list.length }));
  const myTotalMs = myDays.reduce((s, d) => s + d.ms, 0);

  // Horas da equipe por funcionário (mês corrente)
  type TeamEntry = TimeEntry & { profiles?: { nome: string } };
  const teamTotals: Record<string, { nome: string; ms: number; dias: number }> = {};
  if (admin && all) {
    const byUser: Record<string, TeamEntry[]> = {};
    for (const e of (all as TeamEntry[])) (byUser[e.user_id] = byUser[e.user_id] ?? []).push(e);
    for (const [uid, list] of Object.entries(byUser)) {
      const byDay = groupByDay(list);
      let ms = 0;
      for (const dayList of Object.values(byDay)) ms += workedMs(dayList).ms;
      teamTotals[uid] = { nome: list[0]?.profiles?.nome ?? "—", ms, dias: Object.keys(byDay).length };
    }
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Ponto</h1>
          <p className="text-muted-foreground mt-1">Registre entrada, intervalos e saída. Os horários não podem ser editados.</p>
        </div>
        {admin && (
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ponto/funcionarios"><Users size={14} /> Funcionários</Link>
          </Button>
        )}
      </div>

      <PunchClock userId={user.id} lastType={lastType} />

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Clock size={18} /> Minhas horas — mês atual</CardTitle>
          <p className="text-xs text-muted-foreground">Total no mês: <span className="font-semibold text-arini">{fmtHours(myTotalMs)}</span></p>
        </CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Dia</th><th>Registros</th><th>Horas trabalhadas</th></tr>
            </thead>
            <tbody>
              {myDays.map((d) => (
                <tr key={d.dia} className="border-t">
                  <td className="py-2">{d.dia}</td>
                  <td className="text-xs text-muted-foreground">{d.regs}</td>
                  <td className="font-medium">{fmtHours(d.ms)} {d.aberto && <Badge variant="warning">em aberto</Badge>}</td>
                </tr>
              ))}
              {myDays.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum registro este mês.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Meus registros</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Data / Hora</th><th>Tipo</th><th>Origem</th></tr>
            </thead>
            <tbody>
              {myEntries.slice(0, 50).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2">{fmt(t.registrado_em)}</td>
                  <td><Badge variant="outline">{TIME_ENTRY_LABELS[t.tipo] ?? t.tipo}</Badge></td>
                  <td className="text-xs text-muted-foreground">{t.origem}</td>
                </tr>
              ))}
              {myEntries.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum registro ainda.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {admin && (
        <Card>
          <CardHeader>
            <CardTitle>Horas da equipe — mês atual</CardTitle>
            <p className="text-xs text-muted-foreground">Soma por funcionário (entrada → saída, descontando intervalo).</p>
          </CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Funcionário</th><th>Dias com registro</th><th>Total de horas</th></tr>
              </thead>
              <tbody>
                {Object.entries(teamTotals).map(([uid, t]) => (
                  <tr key={uid} className="border-t">
                    <td className="py-2">{t.nome}</td>
                    <td>{t.dias}</td>
                    <td className="font-medium text-arini">{fmtHours(t.ms)}</td>
                  </tr>
                ))}
                {Object.keys(teamTotals).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem registros no mês.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
