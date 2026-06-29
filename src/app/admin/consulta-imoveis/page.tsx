import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";
import { Search, MapPin, Bed, Bath, Car, Maximize2, Pencil, ExternalLink } from "lucide-react";

interface SP {
  q?: string;
}

// Disponibilidade exibida à recepção (derivada do status interno, sem expor o
// fluxo completo). Só atende a consulta básica do balcão/telefone.
const DISPONIBILIDADE: Record<string, { label: string; className: string }> = {
  publicado: { label: "Disponível", className: "bg-emerald-500 text-white" },
  reservado: { label: "Reservado", className: "bg-amber-500 text-white" },
  vendido: { label: "Vendido", className: "bg-rose-500 text-white" },
  locado: { label: "Locado", className: "bg-sky-500 text-white" },
  aprovado_captacao: { label: "Em preparação", className: "bg-muted text-muted-foreground" },
  em_marketing: { label: "Em preparação", className: "bg-muted text-muted-foreground" },
  aguardando_aprovacao_marketing: { label: "Em preparação", className: "bg-muted text-muted-foreground" },
};

// Imóveis em rascunho / aguardando captação / inativos não aparecem para a recepção.
const VISIVEIS = Object.keys(DISPONIBILIDADE);

export default async function ConsultaImoveisPage({ searchParams }: { searchParams: SP }) {
  // Recepção (e quem mais tiver acesso ao CRM) consulta o básico do imóvel.
  const { profile } = await requireSector(["recepcao", "captacao", "marketing", "administrativo", "juridico", "financeiro", "admin_central"]);
  const supabase = createSupabaseServer();
  const q = (searchParams.q ?? "").trim();

  // Quem pode editar o imóvel (incl. descrição) também a partir daqui:
  // administrativo, jurídico e diretoria. Para esses, mostramos atalhos de
  // "Abrir" (página completa do imóvel) e "Editar" (formulário com descrição).
  const podeEditar =
    profile?.is_admin_central === true ||
    profile?.sector === "admin_central" ||
    profile?.sector === "administrativo" ||
    profile?.sector === "juridico";

  // Apenas campos NÃO sensíveis: sem proprietário, sem endereço/número exato,
  // sem CEP, sem dados de captação. Região (bairro/cidade) é suficiente para
  // o atendimento.
  let query = supabase
    .from("properties")
    .select("id, codigo, type, category, bairro, cidade, uf, valor, status, dormitorios, banheiros, vagas, area_total")
    .in("status", VISIVEIS)
    .order("created_at", { ascending: false })
    .limit(100);
  if (q) {
    const like = `%${q}%`;
    // Busca por código ou região (endereço é pesquisável, mas não é exibido).
    query = query.or(`codigo.ilike.${like},bairro.ilike.${like},cidade.ilike.${like},endereco.ilike.${like}`);
  }
  const { data } = await query;
  const list = (data ?? []) as Pick<
    Property,
    "id" | "codigo" | "type" | "category" | "bairro" | "cidade" | "uf" | "valor" | "status" | "dormitorios" | "banheiros" | "vagas" | "area_total"
  >[];

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl text-arini">Consulta de imóveis</h1>
        <p className="text-muted-foreground mt-1">
          Informações básicas para atendimento — disponibilidade, tipo e região. Dados do proprietário e endereço completo não são exibidos aqui.
        </p>
      </div>

      <form className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            name="q"
            placeholder="Buscar por código ou bairro/cidade…"
            defaultValue={q}
            className="w-full h-10 pl-9 pr-3 rounded-md border bg-white text-sm"
          />
        </div>
        <Button type="submit" variant="gold">Buscar</Button>
      </form>

      {list.length === 0 ? (
        <Card><CardContent className="py-16 text-center text-muted-foreground">
          {q ? "Nenhum imóvel encontrado para essa busca." : "Use a busca acima para encontrar um imóvel por código ou região."}
        </CardContent></Card>
      ) : (
        <div className="grid sm:grid-cols-2 gap-3">
          {list.map((p) => {
            const disp = DISPONIBILIDADE[p.status] ?? { label: "—", className: "bg-muted text-muted-foreground" };
            return (
              <Card key={p.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-mono text-xs text-muted-foreground">{p.codigo}</span>
                    <Badge className={`${disp.className} border-0`}>{disp.label}</Badge>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{PROPERTY_TYPE_LABELS[p.type]}</Badge>
                    <Badge variant="gold">{CATEGORY_LABELS[p.category]}</Badge>
                  </div>
                  <div className="text-xl text-gold-gradient font-semibold">{formatCurrencyBRL(p.valor)}</div>
                  <div className="inline-flex items-center gap-1.5 text-sm text-muted-foreground">
                    <MapPin size={14} className="text-gold-dark" />
                    {[p.bairro, p.cidade && `${p.cidade}${p.uf ? `/${p.uf}` : ""}`].filter(Boolean).join(" — ") || "Região não informada"}
                  </div>
                  <div className="flex flex-wrap gap-3 text-xs text-muted-foreground pt-1">
                    {p.dormitorios != null && <span className="inline-flex items-center gap-1"><Bed size={13} /> {p.dormitorios}</span>}
                    {p.banheiros != null && <span className="inline-flex items-center gap-1"><Bath size={13} /> {p.banheiros}</span>}
                    {p.vagas != null && <span className="inline-flex items-center gap-1"><Car size={13} /> {p.vagas}</span>}
                    {p.area_total != null && <span className="inline-flex items-center gap-1"><Maximize2 size={13} /> {p.area_total} m²</span>}
                  </div>
                  {podeEditar && (
                    <div className="flex gap-2 pt-2 border-t mt-2">
                      <Button asChild variant="ghost" size="sm">
                        <Link href={`/admin/captacao/${p.id}`}><ExternalLink size={13} /> Abrir</Link>
                      </Button>
                      <Button asChild variant="gold" size="sm">
                        <Link href={`/admin/captacao/${p.id}/editar`}><Pencil size={13} /> Editar</Link>
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
