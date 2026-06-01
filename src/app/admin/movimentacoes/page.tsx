import { requireDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function fmt(ts: string) {
  return new Date(ts).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

const ACTION_LABELS: Record<string, string> = {
  INSERT: "Criou", UPDATE: "Atualizou", DELETE: "Removeu",
};

export default async function MovimentacoesPage() {
  await requireDiretoria();
  const supabase = createSupabaseServer();

  const [{ data: audit }, { data: approvals }, { data: props }] = await Promise.all([
    supabase.from("audit_log").select("*").order("created_at", { ascending: false }).limit(150),
    supabase.from("approvals").select("*").order("created_at", { ascending: false }).limit(80),
    supabase.from("properties").select("id, codigo, titulo, status, updated_at").order("updated_at", { ascending: false }).limit(40),
  ]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Movimentações</h1>
        <p className="text-muted-foreground mt-1">Histórico de etapas e ações — visão da diretoria.</p>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle>Imóveis por etapa</CardTitle></CardHeader>
          <CardContent>
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Código</th><th>Status</th><th>Atualizado</th></tr></thead>
              <tbody>
                {(props ?? []).map((p: { id: string; codigo: string; status: string; updated_at: string }) => (
                  <tr key={p.id} className="border-t">
                    <td className="py-2 font-mono text-xs">{p.codigo}</td>
                    <td><Badge variant="outline">{p.status}</Badge></td>
                    <td className="text-xs text-muted-foreground">{fmt(p.updated_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Aprovações recentes</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {(approvals ?? []).map((a: { id: string; stage: string; status: string; created_at: string }) => (
              <div key={a.id} className="flex items-center justify-between border-b pb-2 text-sm">
                <div><span className="font-semibold">{a.stage}</span> · <Badge variant={a.status === "aprovado" ? "success" : a.status === "reprovado" ? "danger" : "muted"}>{a.status}</Badge></div>
                <div className="text-xs text-muted-foreground">{fmt(a.created_at)}</div>
              </div>
            ))}
            {(approvals ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem aprovações.</p>}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Linha do tempo (auditoria)</CardTitle></CardHeader>
        <CardContent className="space-y-2">
          {(audit ?? []).map((a: { id: number; action: string; entity_table: string; created_at: string; sector: string | null }) => (
            <div key={a.id} className="flex items-center justify-between border-b pb-2 text-sm">
              <div>
                <span className="text-muted-foreground">{ACTION_LABELS[a.action] ?? a.action}</span>{" "}
                <Badge variant="outline">{a.entity_table}</Badge>
                {a.sector && <span className="ml-2 text-xs text-muted-foreground">({a.sector})</span>}
              </div>
              <div className="text-xs text-muted-foreground">{fmt(a.created_at)}</div>
            </div>
          ))}
          {(audit ?? []).length === 0 && <p className="text-sm text-muted-foreground">Sem movimentações registradas.</p>}
        </CardContent>
      </Card>
    </div>
  );
}
