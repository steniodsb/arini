import { notFound } from "next/navigation";
import Image from "next/image";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL } from "@/lib/utils";
import {
  CATEGORY_LABELS,
  PROPERTY_TYPE_LABELS,
  type Property,
  type PropertyMedia,
} from "@/lib/types";
import { Bed, Bath, Car, Maximize2, MapPin } from "lucide-react";
import { ContactForm } from "@/components/public/ContactForm";

export const revalidate = 60;

export default async function PropertyDetailPage({
  params,
}: {
  params: { codigo: string };
}) {
  const supabase = createSupabaseServer();
  const { data: property } = await supabase
    .from("properties")
    .select("*")
    .eq("codigo", params.codigo)
    .eq("publicado_no_site", true)
    .single();
  if (!property) notFound();
  const p = property as Property;

  const { data: media } = await supabase
    .from("property_media")
    .select("*")
    .eq("property_id", p.id)
    .order("capa", { ascending: false })
    .order("ordem", { ascending: true });
  const mediaList = (media ?? []) as PropertyMedia[];
  const images = mediaList.filter((m) => m.tipo === "imagem");
  const cover = images[0]?.url;

  return (
    <div className="container py-10">
      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-muted">
            {cover ? (
              <Image src={cover} alt={p.titulo || p.codigo} fill className="object-cover" priority />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center bg-arini-radial text-gold/40">
                ARINI
              </div>
            )}
            <div className="absolute top-4 left-4 flex gap-2">
              <Badge variant="gold">{CATEGORY_LABELS[p.category]}</Badge>
              <Badge variant="outline" className="bg-white/90">{p.codigo}</Badge>
            </div>
          </div>

          {images.length > 1 && (
            <div className="grid grid-cols-4 gap-2">
              {images.slice(1, 9).map((img) => (
                <div key={img.id} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                  <Image src={img.url} alt="" fill className="object-cover" sizes="200px" />
                </div>
              ))}
            </div>
          )}

          <div>
            <div className="text-xs uppercase tracking-wider text-muted-foreground">
              {PROPERTY_TYPE_LABELS[p.type]}
            </div>
            <h1 className="font-display text-4xl text-arini mt-1">
              {p.titulo || `${PROPERTY_TYPE_LABELS[p.type]} em ${p.cidade ?? "—"}`}
            </h1>
            {p.endereco && (
              <div className="mt-2 text-muted-foreground inline-flex items-center gap-1.5">
                <MapPin size={16} /> {p.endereco}{p.bairro && `, ${p.bairro}`}{p.cidade && ` - ${p.cidade}`}{p.uf && `/${p.uf}`}
              </div>
            )}
            <div className="mt-4 text-gold-gradient font-semibold text-4xl">
              {formatCurrencyBRL(p.valor)}
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {p.dormitorios != null && (
              <Feature icon={<Bed size={18} />} label="Dormitórios" value={String(p.dormitorios)} />
            )}
            {p.banheiros != null && (
              <Feature icon={<Bath size={18} />} label="Banheiros" value={String(p.banheiros)} />
            )}
            {p.vagas != null && (
              <Feature icon={<Car size={18} />} label="Vagas" value={String(p.vagas)} />
            )}
            {p.area_total != null && (
              <Feature icon={<Maximize2 size={18} />} label="Área" value={`${p.area_total} m²`} />
            )}
          </div>

          {p.descricao && (
            <div>
              <h2 className="font-display text-2xl text-arini">Descrição</h2>
              <p className="mt-3 text-muted-foreground whitespace-pre-line">{p.descricao}</p>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="rounded-xl border bg-card p-6 sticky top-24">
            <h3 className="font-display text-xl text-arini">Tenho interesse</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Envie sua mensagem e um corretor entrará em contato.
            </p>
            <div className="mt-4">
              <ContactForm propertyId={p.id} propertyCode={p.codigo} compact />
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

function Feature({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4 flex flex-col items-start gap-1">
      <div className="text-gold-dark">{icon}</div>
      <div className="text-xs uppercase text-muted-foreground tracking-wider">{label}</div>
      <div className="text-arini font-semibold">{value}</div>
    </div>
  );
}
