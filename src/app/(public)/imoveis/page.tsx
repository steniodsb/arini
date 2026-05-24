import { createSupabaseServer } from "@/lib/supabase/server";
import { PropertyCard } from "@/components/public/PropertyCard";
import { PageHero } from "@/components/public/PageHero";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Property, type PropertyCategory, type PropertyMedia, type PropertyType } from "@/lib/types";

export const revalidate = 60;

interface SP { type?: string; types?: string; category?: string; cidade?: string; q?: string; min?: string; max?: string; }

export default async function ImoveisPage({ searchParams }: { searchParams: SP }) {
  const supabase = createSupabaseServer();
  let q = supabase.from("properties").select("*").eq("publicado_no_site", true);
  if (searchParams.types) {
    const arr = searchParams.types.split(",").map((s) => s.trim()).filter(Boolean);
    if (arr.length) q = q.in("type", arr);
  } else if (searchParams.type) {
    q = q.eq("type", searchParams.type);
  }
  if (searchParams.category) q = q.eq("category", searchParams.category);
  if (searchParams.cidade) q = q.ilike("cidade", `%${searchParams.cidade}%`);
  if (searchParams.q) q = q.or(`titulo.ilike.%${searchParams.q}%,bairro.ilike.%${searchParams.q}%,codigo.ilike.%${searchParams.q}%`);
  if (searchParams.min) q = q.gte("valor", Number(searchParams.min));
  if (searchParams.max) q = q.lte("valor", Number(searchParams.max));

  const { data: properties } = await q.order("created_at", { ascending: false }).limit(60);
  const ids = (properties ?? []).map((p) => p.id);
  const mediaByProp: Record<string, string> = {};
  if (ids.length) {
    const { data: media } = await supabase
      .from("property_media")
      .select("property_id, url, capa")
      .in("property_id", ids);
    for (const m of (media ?? []) as PropertyMedia[]) {
      if (!mediaByProp[m.property_id] || m.capa) mediaByProp[m.property_id] = m.url;
    }
  }
  const list = (properties ?? []) as Property[];

  return (
    <>
      <PageHero
        eyebrow="Nossa carteira"
        title={
          <>
            Veja nossos <span className="text-gold-gradient">imóveis</span>
          </>
        }
        subtitle="Casas, apartamentos, terrenos, loteamentos e propriedades rurais com curadoria, transparência e documentação validada."
        bgImage="/hero-imoveis.jpg"
        size="md"
      />
    <div className="container py-12">
      <form className="grid md:grid-cols-6 gap-3 mb-8 p-4 bg-muted/40 rounded-lg border">
        <div className="md:col-span-2">
          <Label>Buscar</Label>
          <Input name="q" placeholder="Código, bairro, título…" defaultValue={searchParams.q} />
        </div>
        <div>
          <Label>Tipo</Label>
          <Select name="type" defaultValue={searchParams.type}>
            <option value="">Todos</option>
            {Object.entries(PROPERTY_TYPE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Categoria</Label>
          <Select name="category" defaultValue={searchParams.category}>
            <option value="">Todas</option>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </Select>
        </div>
        <div>
          <Label>Cidade</Label>
          <Input name="cidade" placeholder="Cidade" defaultValue={searchParams.cidade} />
        </div>
        <div className="flex items-end">
          <Button type="submit" variant="gold" className="w-full">Filtrar</Button>
        </div>
      </form>

      {list.length === 0 ? (
        <div className="text-center py-20 border border-dashed rounded-lg">
          <p className="text-muted-foreground">Nenhum imóvel encontrado com esses filtros.</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {list.map((p) => (
            <PropertyCard key={p.id} property={p} coverUrl={mediaByProp[p.id]} />
          ))}
        </div>
      )}
    </div>
    </>
  );
}
