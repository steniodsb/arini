import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL } from "@/lib/utils";
import { CATEGORY_LABELS, PROPERTY_TYPE_LABELS, type Property } from "@/lib/types";
import { Bed, Bath, Car, Maximize2 } from "lucide-react";
import { PropertyCardCarousel } from "./PropertyCardCarousel";
import type { GalleryImage } from "@/lib/publicMedia";

interface Props {
  property: Property;
  coverUrl?: string | null;
  /** Quando informado (>1), o card vira um mini-carrossel de fotos. */
  images?: GalleryImage[];
}

export function PropertyCard({ property, coverUrl, images }: Props) {
  const alt = property.titulo || property.codigo;
  // Fonte das imagens: lista da galeria, se houver; senão a capa única.
  const gallery: GalleryImage[] =
    images && images.length > 0
      ? images
      : coverUrl
        ? [{ id: property.id, url: coverUrl }]
        : [];

  return (
    <Link
      href={`/imoveis/${property.codigo}`}
      className="group block rounded-lg overflow-hidden border bg-card shadow-sm hover:shadow-lg transition-all"
    >
      <div className="relative aspect-[4/3] bg-muted">
        <PropertyCardCarousel images={gallery} alt={alt} />
        <div className="absolute top-3 left-3 flex gap-2">
          <Badge variant="gold">{CATEGORY_LABELS[property.category]}</Badge>
          <Badge variant="outline" className="bg-white/90">
            {property.codigo}
          </Badge>
        </div>
      </div>
      <div className="p-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">
          {PROPERTY_TYPE_LABELS[property.type]}
          {property.bairro && ` · ${property.bairro}`}
          {property.cidade && ` · ${property.cidade}`}
        </div>
        <h3 className="mt-1 font-display text-lg text-arini line-clamp-1">
          {property.titulo || `${PROPERTY_TYPE_LABELS[property.type]} em ${property.cidade ?? property.bairro ?? "—"}`}
        </h3>
        <div className="mt-2 text-gold-gradient font-semibold text-xl">
          {formatCurrencyBRL(property.valor)}
        </div>
        <div className="mt-3 flex items-center gap-4 text-xs text-muted-foreground">
          {property.dormitorios != null && (
            <span className="inline-flex items-center gap-1"><Bed size={14} /> {property.dormitorios}</span>
          )}
          {property.banheiros != null && (
            <span className="inline-flex items-center gap-1"><Bath size={14} /> {property.banheiros}</span>
          )}
          {property.vagas != null && (
            <span className="inline-flex items-center gap-1"><Car size={14} /> {property.vagas}</span>
          )}
          {property.area_total != null && (
            <span className="inline-flex items-center gap-1"><Maximize2 size={14} /> {property.area_total} m²</span>
          )}
        </div>
      </div>
    </Link>
  );
}
