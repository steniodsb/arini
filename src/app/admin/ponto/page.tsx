import { requireUser, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TIME_ENTRY_LABELS, type TimeEntry, type TimeEntryType } from "@/lib/types";
import { PunchClock } from "./PunchClock";

function fmt(ts: string) {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export default async function PontoPage() {
  const { user, profile } = await requireUser();
  const supabase = createSupabaseServer();
  const admin = isDiretoria(profile) || profile?.sector === "administrativo";

  const { data: mine } = await supabase
    .from("time_entries")
    .select("*")
    .eq("user_id", user.id)
    .order("registrado_em", { ascending: false })
    .limit(50);

  // Diretoria/administrativo veem todos os registros recentes da equipe.
  const { data: all } = admin
    ? await supabase
        .from("time_entries")
        .select("*, profiles(nome)")
        .order("registrado_em", { ascending: false })
        .limit(100)
    : { data: null };

  const lastType = (mine ?? [])[0]?.tipo as TimeEntryType | undefined;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Ponto</h1>
        <p className="text-muted-foreground mt-1">Registre entrada, intervalos e saída.</p>
      </div>

      <PunchClock userId={user.id} lastType={lastType} />

      <Card>
        <CardHeader><CardTitle>Meus registros</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Data / Hora</th><th>Tipo</th><th>Origem</th></tr>
            </thead>
            <tbody>
              {((mine ?? []) as TimeEntry[]).map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="py-2">{fmt(t.registrado_em)}</td>
                  <td><Badge variant="outline">{TIME_ENTRY_LABELS[t.tipo] ?? t.tipo}</Badge></td>
                  <td className="text-xs text-muted-foreground">{t.origem}</td>
                </tr>
              ))}
              {(mine ?? []).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum registro ainda.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {admin && (
        <Card>
          <CardHeader><CardTitle>Registros da equipe</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Funcionário</th><th>Data / Hora</th><th>Tipo</th></tr>
              </thead>
              <tbody>
                {(all ?? []).map((t: TimeEntry & { profiles?: { nome: string } }) => (
                  <tr key={t.id} className="border-t">
                    <td className="py-2">{t.profiles?.nome ?? "—"}</td>
                    <td>{fmt(t.registrado_em)}</td>
                    <td><Badge variant="outline">{TIME_ENTRY_LABELS[t.tipo] ?? t.tipo}</Badge></td>
                  </tr>
                ))}
                {(all ?? []).length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Sem registros.</td></tr>}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
