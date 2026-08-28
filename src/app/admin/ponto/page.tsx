import Link from "next/link";
import { requireUser, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Users, Clock, MonitorSmartphone, FileText } from "lucide-react";
import { TIME_ENTRY_LABELS, type TimeEntry, type TimeEntryType } from "@/lib/types";
import { fmtHours, workedMs, groupByDay } from "@/lib/ponto";
import { PunchClock } from "./PunchClock";

function fmt(ts: string) {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
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

  // Colaborador ligado a este login, se houver. `maybeSingle` porque o
  // vínculo é opcional: quem só tem login (e não bate ponto) não tem linha.
  const { data: meuColab } = await supabase
    .from("colaboradores")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  const meuColaborador = (meuColab?.id as string | undefined) ?? null;

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
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="gold" size="sm">
              <Link href="/admin/ponto/terminal"><MonitorSmartphone size={14} /> Terminal</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/ponto/colaboradores"><Users size={14} /> Colaboradores</Link>
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href="/admin/ponto/relatorio"><FileText size={14} /> Relatório</Link>
            </Button>
          </div>
        )}
      </div>

      {admin && !meuColaborador && (
        <Card className="border-amber-500/40 bg-amber-500/5">
          <CardContent className="pt-6 text-sm">
            Este login não está ligado a nenhum colaborador, então o que você bater aqui
            não entra no relatório individual.{" "}
            <Link href="/admin/ponto/colaboradores" className="underline text-arini">
              Vincule em Colaboradores
            </Link>.
          </CardContent>
        </Card>
      )}

      <PunchClock userId={user.id} lastType={lastType} colaboradorId={meuColaborador} />

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
