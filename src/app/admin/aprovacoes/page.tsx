import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/utils";
import { ApprovalActions } from "./ApprovalActions";

export default async function AprovacoesPage() {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: approvals } = await supabase
    .from("approvals")
    .select("*")
    .eq("status", "pendente")
    .order("created_at", { ascending: true });

  // Enriquecer com property data quando entity_table = properties
  const ids = (approvals ?? []).filter((a) => a.entity_table === "properties").map((a) => a.entity_id);
  const propsById: Record<string, { codigo: string; titulo: string | null; cidade: string | null }> = {};
  if (ids.length) {
    const { data } = await supabase.from("properties").select("id, codigo, titulo, cidade").in("id", ids);
    for (const p of data ?? []) propsById[p.id] = p;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Aprovações</h1>
        <p className="text-muted-foreground mt-1">
          Inbox central de aprovações pendentes de todos os setores.
        </p>
      </div>

      {(approvals ?? []).length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Nada pendente. 🎉</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {(approvals ?? []).map((a) => {
            const prop = a.entity_table === "properties" ? propsById[a.entity_id] : null;
            return (
              <Card key={a.id}>
                <CardContent className="p-5 flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="gold">{a.stage}</Badge>
                      <Badge variant="outline">{a.entity_table}</Badge>
                      <span className="text-xs text-muted-foreground">{formatDateTimeBR(a.created_at)}</span>
                    </div>
                    <div className="mt-2 font-semibold text-arini">
                      {prop ? `${prop.codigo} — ${prop.titulo ?? prop.cidade ?? ""}` : `Entidade ${a.entity_id.slice(0, 8)}…`}
                    </div>
                    {a.comentario && <p className="text-sm text-muted-foreground mt-1">{a.comentario}</p>}
                  </div>
                  <ApprovalActions approvalId={a.id} entityTable={a.entity_table} entityId={a.entity_id} stage={a.stage} />
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
