import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StatusBadge } from "@/components/crm/StatusBadge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, STATUS_LABELS, type Property } from "@/lib/types";
import { Plus, Search } from "lucide-react";

interface SP {
  status?: string;
  q?: string;
  type?: string;
  category?: string;
}

export default async function CaptacaoListPage({ searchParams }: { searchParams: SP }) {
  const { profile } = await requireSector(["captacao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();

  let q = supabase.from("properties").select("*").order("created_at", { ascending: false });
  if (profile.sector === "captacao" && !profile.is_admin_central) {
    q = q.eq("captador_id", profile.id);
  }
  if (searchParams.status) q = q.eq("status", searchParams.status);
  if (searchParams.type) q = q.eq("type", searchParams.type);
  if (searchParams.category) q = q.eq("category", searchParams.category);
  if (searchParams.q) {
    const like = `%${searchParams.q}%`;
    q = q.or(`codigo.ilike.${like},titulo.ilike.${like},bairro.ilike.${like},cidade.ilike.${like}`);
  }

  const { data: properties } = await q.limit(200);
  const list = (properties ?? []) as Property[];

  // Stats
  const stats = {
    total: list.length,
    rascunho: list.filter((p) => p.status === "rascunho").length,
    aguardando: list.filter((p) => p.status.includes("aguardando")).length,
    publicado: list.filter((p) => p.status === "publicado").length,
    fechado: list.filter((p) => ["vendido", "locado"].includes(p.status)).length,
  };

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

      <div className="grid md:grid-cols-5 gap-3">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Total</div><div className="text-2xl text-arini font-semibold">{stats.total}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Rascunho</div><div className="text-2xl text-muted-foreground font-semibold">{stats.rascunho}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Aguardando</div><div className="text-2xl text-amber-600 font-semibold">{stats.aguardando}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Publicados</div><div className="text-2xl text-emerald-600 font-semibold">{stats.publicado}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Fechados</div><div className="text-2xl text-gold-gradient font-semibold">{stats.fechado}</div></CardContent></Card>
      </div>

      {/* Filtros */}
      <form className="grid md:grid-cols-5 gap-3 p-4 bg-muted/40 rounded-lg border">
        <div className="md:col-span-2 relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input name="q" placeholder="Buscar código, título, bairro, cidade…" defaultValue={searchParams.q}
            className="w-full h-10 pl-9 pr-3 rounded-md border bg-white text-sm" />
        </div>
        <select name="status" defaultValue={searchParams.status ?? ""} className="h-10 px-3 rounded-md border bg-white text-sm">
          <option value="">Todos os status</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="type" defaultValue={searchParams.type ?? ""} className="h-10 px-3 rounded-md border bg-white text-sm">
          <option value="">Todos os tipos</option>
          {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select name="category" defaultValue={searchParams.category ?? ""} className="h-10 px-3 rounded-md border bg-white text-sm">
          <option value="">Todas categorias</option>
          {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <Button type="submit" variant="gold" className="md:col-span-5">Filtrar</Button>
      </form>

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
              <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground">Nenhum imóvel encontrado.</td></tr>
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
