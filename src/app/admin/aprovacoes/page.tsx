import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatDateTimeBR } from "@/lib/utils";
import { ApprovalActions } from "./ApprovalActions";
import { AlertTriangle, Eye } from "lucide-react";

// SLA padrão (dias) para sinalizar atraso quando não há prazo explícito.
const SLA_DIAS = 3;

const WAITING_STATUSES = ["aguardando_aprovacao_captacao", "aguardando_aprovacao_marketing"] as const;

export default async function AprovacoesPage() {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();

  // A inbox é dirigida pelo STATUS do imóvel (robusto contra aprovações órfãs).
  const { data: properties } = await supabase
    .from("properties")
    .select("id, codigo, titulo, cidade, status, updated_at")
    .in("status", WAITING_STATUSES as unknown as string[])
    .order("updated_at", { ascending: true });

  const ids = (properties ?? []).map((p) => p.id);
  // Última aprovação por imóvel (para id + prazo + desde quando aguarda).
  const apprByProp: Record<string, { id: string; created_at: string; prazo: string | null; comentario: string | null }> = {};
  if (ids.length) {
    const { data: appr } = await supabase
      .from("approvals")
      .select("id, entity_id, created_at, prazo, comentario, status")
      .eq("entity_table", "properties")
      .in("entity_id", ids)
      .order("created_at", { ascending: false });
    for (const a of appr ?? []) {
      // pega a mais recente (primeira por ordenação desc) de cada imóvel
      if (!apprByProp[a.entity_id]) apprByProp[a.entity_id] = { id: a.id, created_at: a.created_at, prazo: a.prazo, comentario: a.comentario };
    }
  }

  const now = Date.now();
  const items = (properties ?? []).map((p) => {
    const appr = apprByProp[p.id];
    const stage = p.status === "aguardando_aprovacao_marketing" ? "marketing" : "captacao";
    const desde = appr?.created_at ?? p.updated_at;
    const diasAguardando = Math.floor((now - new Date(desde).getTime()) / (1000 * 60 * 60 * 24));
    const prazo = appr?.prazo ? new Date(appr.prazo) : null;
    const atrasado = (prazo && prazo.getTime() < now) || diasAguardando >= SLA_DIAS;
    return { p, appr, stage, desde, diasAguardando, atrasado };
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Aprovações</h1>
        <p className="text-muted-foreground mt-1">
          Inbox central de imóveis aguardando aprovação (captação e marketing).
        </p>
      </div>

      {items.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">Nada pendente. 🎉</CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map(({ p, appr, stage, desde, diasAguardando, atrasado }) => {
            const detailHref = stage === "marketing" ? `/admin/marketing/${p.id}` : `/admin/captacao/${p.id}`;
            return (
            <Card key={p.id} className={atrasado ? "border-red-300 bg-red-50" : ""}>
              <CardContent className="p-5 flex items-center justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 text-sm flex-wrap">
                    <Badge variant="gold">{stage}</Badge>
                    <Badge variant="outline">imóvel</Badge>
                    {atrasado && (
                      <Badge variant="danger" className="inline-flex items-center gap-1">
                        <AlertTriangle size={12} /> Atrasado ({diasAguardando}d)
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">aguardando desde {formatDateTimeBR(desde)}</span>
                  </div>
                  <Link
                    href={detailHref}
                    className="mt-2 inline-block font-semibold text-arini hover:text-gold-dark underline-offset-2 hover:underline"
                  >
                    {p.codigo} — {p.titulo ?? p.cidade ?? ""}
                  </Link>
                  {appr?.comentario && <p className="text-sm text-muted-foreground mt-1">{appr.comentario}</p>}
                </div>
                <div className="flex flex-col items-end gap-2 shrink-0">
                  <Button asChild variant="outline" size="sm">
                    <Link href={detailHref}><Eye size={14} /> Ver detalhes</Link>
                  </Button>
                  <ApprovalActions approvalId={appr?.id ?? null} entityTable="properties" entityId={p.id} stage={stage} />
                </div>
              </CardContent>
            </Card>
          );})}
        </div>
      )}
    </div>
  );
}
