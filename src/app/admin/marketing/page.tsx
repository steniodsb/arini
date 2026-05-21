import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

export default async function MarketingListPage() {
  await requireSector(["marketing", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: properties } = await supabase
    .from("properties")
    .select("*")
    .in("status", ["aprovado_captacao", "em_marketing", "aguardando_aprovacao_marketing", "publicado"])
    .order("created_at", { ascending: false })
    .limit(100);
  const list = (properties ?? []) as Property[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Marketing</h1>
        <p className="text-muted-foreground mt-1">
          Imóveis disponíveis para configurar divulgação.
        </p>
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Imóvel</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.length === 0 && (
              <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">Nenhum imóvel aprovado para marketing ainda.</td></tr>
            )}
            {list.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-mono">{p.codigo}</td>
                <td className="px-4 py-3">
                  {p.titulo || `${PROPERTY_TYPE_LABELS[p.type]} em ${p.cidade ?? "—"}`}
                  <div className="text-xs text-muted-foreground">{PROPERTY_TYPE_LABELS[p.type]} · {CATEGORY_LABELS[p.category]}</div>
                </td>
                <td className="px-4 py-3">{formatCurrencyBRL(p.valor)}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3 text-right">
                  <Link href={`/admin/marketing/${p.id}`} className="text-arini hover:text-gold-dark text-xs font-semibold">Configurar →</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
