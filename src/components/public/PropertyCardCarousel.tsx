"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GalleryImage } from "@/lib/publicMedia";

/**
 * Mini-carrossel usado nos CARDS de imóvel (home e listagem). Permite passar as
 * fotos sem sair da listagem. Para 0/1 imagem, cai para imagem única/placeholder.
 *
 * Os botões usam preventDefault/stopPropagation porque o card inteiro é um
 * <Link> — sem isso, clicar na seta navegaria para o detalhe do imóvel.
 */
export function PropertyCardCarousel({
  images,
  alt,
}: {
  images: GalleryImage[];
  alt: string;
}) {
  const [active, setActive] = useState(0);

  if (images.length === 0) {
    return (
      <div className="absolute inset-0 flex items-center justify-center bg-arini-radial text-gold/40 text-xs font-semibold">
        ARINI
      </div>
    );
  }

  function go(e: React.MouseEvent, delta: number) {
    e.preventDefault();
    e.stopPropagation();
    setActive((prev) => (prev + delta + images.length) % images.length);
  }

  function jump(e: React.MouseEvent, idx: number) {
    e.preventDefault();
    e.stopPropagation();
    setActive(idx);
  }

  return (
    <>
      <Image
        src={images[active].url}
        alt={alt}
        fill
        className="object-cover transition-transform duration-300 group-hover:scale-105"
        sizes="(max-width: 768px) 100vw, 33vw"
      />

      {images.length > 1 && (
        <>
          <button
            type="button"
            onClick={(e) => go(e, -1)}
            aria-label="Imagem anterior"
            className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white text-arini flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            type="button"
            onClick={(e) => go(e, 1)}
            aria-label="Próxima imagem"
            className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-white/85 hover:bg-white text-arini flex items-center justify-center shadow opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <ChevronRight size={16} />
          </button>

          {/* Bolinhas indicadoras */}
          <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5">
            {images.map((img, idx) => (
              <button
                key={img.id}
                type="button"
                aria-label={`Ir para imagem ${idx + 1}`}
                onClick={(e) => jump(e, idx)}
                className={`h-1.5 rounded-full transition-all ${
                  idx === active ? "w-4 bg-white" : "w-1.5 bg-white/60 hover:bg-white/90"
                }`}
              />
            ))}
          </div>
        </>
      )}
    </>
  );
}
