import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";

export default async function AdministrativoPage() {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("properties").select("*").order("created_at", { ascending: false }).limit(200);
  const list = (data ?? []) as Property[];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Administrativo</h1>
        <p className="text-muted-foreground mt-1">Visão completa de todos os imóveis. Cadastre proprietários e documentos pelo detalhe do imóvel.</p>
      </div>
      <div className="rounded-lg border bg-card overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
            <tr>
              <th className="px-4 py-3">Código</th>
              <th className="px-4 py-3">Imóvel</th>
              <th className="px-4 py-3">Categoria</th>
              <th className="px-4 py-3">Valor</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Entrada</th>
              <th className="px-4 py-3"></th>
            </tr>
          </thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className="border-t hover:bg-muted/30">
                <td className="px-4 py-3 font-mono">{p.codigo}</td>
                <td className="px-4 py-3">{p.titulo || PROPERTY_TYPE_LABELS[p.type]}<div className="text-xs text-muted-foreground">{p.cidade}</div></td>
                <td className="px-4 py-3">{CATEGORY_LABELS[p.category]}</td>
                <td className="px-4 py-3">{formatCurrencyBRL(p.valor)}</td>
                <td className="px-4 py-3"><StatusBadge status={p.status} /></td>
                <td className="px-4 py-3">{formatDateBR(p.data_entrada)}</td>
                <td className="px-4 py-3 text-right"><Link className="text-arini hover:text-gold-dark text-xs font-semibold" href={`/admin/captacao/${p.id}`}>Abrir →</Link></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={7} className="py-10 text-center text-muted-foreground">Sem imóveis ainda.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
