import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/utils";

export default async function AuditoriaPage() {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("audit_log")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(500);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Auditoria</h1>
        <p className="text-muted-foreground mt-1">Histórico completo de ações no sistema.</p>
      </div>
      <Card>
        <CardHeader><CardTitle>Eventos recentes</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Data</th><th>Setor</th><th>Ação</th><th>Entidade</th><th>ID</th></tr>
            </thead>
            <tbody>
              {(data ?? []).map((l) => (
                <tr key={l.id} className="border-t">
                  <td className="py-2">{formatDateTimeBR(l.created_at)}</td>
                  <td><Badge variant="outline">{l.sector ?? "—"}</Badge></td>
                  <td><Badge variant={l.action === "DELETE" ? "danger" : l.action === "INSERT" ? "success" : "gold"}>{l.action}</Badge></td>
                  <td className="font-mono text-xs">{l.entity_table}</td>
                  <td className="font-mono text-xs text-muted-foreground">{l.entity_id?.slice(0, 8)}…</td>
                </tr>
              ))}
              {(data ?? []).length === 0 && <tr><td colSpan={5} className="py-10 text-center text-muted-foreground">Sem eventos registrados ainda.</td></tr>}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
