import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";
import { Plus } from "lucide-react";

export default async function CaptacaoListPage() {
  const { profile } = await requireSector(["captacao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  let q = supabase.from("properties").select("*").order("created_at", { ascending: false });
  if (profile.sector === "captacao" && !profile.is_admin_central) {
    q = q.eq("captador_id", profile.id);
  }
  const { data: properties } = await q.limit(100);
  const list = (properties ?? []) as Property[];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Captação</h1>
          <p className="text-muted-foreground mt-1">
            Imóveis captados e em fluxo de aprovação.
          </p>
        </div>
        <Button asChild variant="gold">
          <Link href="/admin/captacao/novo"><Plus size={16} /> Nova captação</Link>
        </Button>
      </div>

      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Tipo</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Cidade / Bairro</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Entrada</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhuma captação ainda.</td></tr>
            )}
            {list.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-mono text-arini">{p.codigo}</td>
                <td className="px-4 py-3">{PROPERTY_TYPE_LABELS[p.type]}</td>
                <td className="px-4 py-3">{CATEGORY_LABELS[p.category]}</td>
                <td className="px-4 py-3">{p.cidade ?? "—"} {p.bairro && `· ${p.bairro}`}</td>
                <td className="px-4 py-3">{formatCurrencyBRL(p.valor)}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3">{formatDateBR(p.data_entrada)}</td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/captacao/${p.id}`} className="text-arini hover:text-gold-dark text-xs font-semibold">Abrir →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
