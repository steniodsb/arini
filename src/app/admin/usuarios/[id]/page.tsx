import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { SECTOR_LABELS, type Profile } from "@/lib/types";
import { formatDateBR } from "@/lib/utils";
import { ArrowLeft } from "lucide-react";
import { HistoryTimeline } from "@/components/crm/HistoryTimeline";
import { buildBrokerHistory } from "@/lib/history";

export default async function CorretorDetailPage({ params }: { params: { id: string } }) {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();

  const { data: profile } = await supabase.from("profiles").select("*").eq("id", params.id).single();
  if (!profile) notFound();
  const u = profile as Profile;

  const history = await buildBrokerHistory(supabase, u.id);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
          <Link href="/admin/usuarios"><ArrowLeft size={14} /> Voltar para usuários</Link>
        </Button>
        <div className="flex items-start justify-between">
          <div>
            <h1 className="font-display text-3xl text-arini">{u.nome}</h1>
            <div className="mt-2 flex gap-2">
              {u.is_admin_central ? (
                <Badge variant="gold">Admin Central</Badge>
              ) : (
                <Badge variant="outline">{SECTOR_LABELS[u.sector]}</Badge>
              )}
              <Badge variant={u.ativo ? "success" : "muted"}>{u.ativo ? "Ativo" : "Inativo"}</Badge>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2 text-sm">
          <div>E-mail: {u.email ?? "—"}</div>
          <div>Telefone: {u.telefone ?? "—"}</div>
          <div>Setor: {SECTOR_LABELS[u.sector]}</div>
          <div>Cadastrado em: {formatDateBR(u.created_at)}</div>
        </CardContent>
      </Card>

      <HistoryTimeline
        events={history}
        title="Histórico do corretor"
        emptyLabel="Nenhum imóvel, comissão ou lead vinculado a este corretor ainda."
      />
    </div>
  );
}
