"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { GalleryImage } from "@/lib/publicMedia";

interface Props {
  images: GalleryImage[];
  title: string;
}

export function PropertyGallery({ images, title }: Props) {
  const [active, setActive] = useState(0);
  const stripRef = useRef<HTMLDivElement>(null);

  if (images.length === 0) {
    return (
      <div className="aspect-[16/10] rounded-xl bg-arini-radial flex items-center justify-center text-gold/40">
        <span className="font-display text-3xl">ARINI</span>
      </div>
    );
  }

  const current = images[active];

  // Vizinhas (anterior/próxima) para PRÉ-CARREGAR — assim clicar nas setas
  // troca a foto na hora, sem esperar o otimizador/rede.
  const neighborIdx =
    images.length > 1
      ? Array.from(
          new Set([
            (active + 1) % images.length,
            (active - 1 + images.length) % images.length,
          ]),
        )
      : [];

  function go(delta: number) {
    setActive((prev) => {
      const next = (prev + delta + images.length) % images.length;
      // Scroll the thumb into view
      const el = stripRef.current?.querySelector<HTMLElement>(
        `[data-thumb="${next}"]`,
      );
      el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
      return next;
    });
  }

  // Rola a fita de miniaturas ~uma "página" para revelar as ocultas, sem
  // mudar a imagem ativa (o strip é um carrossel independente).
  function scrollStrip(dir: -1 | 1) {
    const el = stripRef.current;
    if (!el) return;
    el.scrollBy({ left: dir * el.clientWidth * 0.8, behavior: "smooth" });
  }

  return (
    <div className="space-y-3 min-w-0">
      {/* Imagem principal — altura travada; a foto NUNCA dimensiona a página */}
      <div className="relative h-[260px] sm:h-[400px] lg:h-[480px] rounded-xl overflow-hidden bg-muted">
        <Image
          src={current.url}
          alt={title}
          fill
          className="object-cover"
          priority
          quality={72}
          sizes="(min-width: 1024px) 800px, 100vw"
        />

        {/* Pré-carga invisível das fotos vizinhas (mesmo `sizes` da principal,
            então o navegador reaproveita o arquivo ao navegar). */}
        {neighborIdx.map((i) => (
          <Image
            key={`preload-${images[i].id}`}
            src={images[i].url}
            alt=""
            fill
            aria-hidden
            quality={72}
            className="object-cover opacity-0 pointer-events-none"
            sizes="(min-width: 1024px) 800px, 100vw"
          />
        ))}
        {images.length > 1 && (
          <>
            <button
              type="button"
              onClick={() => go(-1)}
              aria-label="Imagem anterior"
              className="absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-arini flex items-center justify-center shadow-md transition-all"
            >
              <ChevronLeft size={20} />
            </button>
            <button
              type="button"
              onClick={() => go(1)}
              aria-label="Próxima imagem"
              className="absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/90 hover:bg-white text-arini flex items-center justify-center shadow-md transition-all"
            >
              <ChevronRight size={20} />
            </button>
            <div className="absolute bottom-3 right-3 bg-arini/80 text-white text-xs font-medium px-3 py-1 rounded-full">
              {active + 1} / {images.length}
            </div>
          </>
        )}
      </div>

      {/* Strip de thumbnails — mostra POUCAS (cabe ~5); as demais ficam ocultas
          e aparecem ao navegar pelas setas (ou rolando, no touch). A fita é
          compacta e centralizada — nunca ocupa a largura toda nem estica a
          página. max-w-[432px] = 5 miniaturas de 80px + 4 espaços de 8px. */}
      {images.length > 1 && (
        <div className="flex items-center justify-center gap-2">
          {images.length > 5 && (
            <button
              type="button"
              onClick={() => scrollStrip(-1)}
              aria-label="Miniaturas anteriores"
              className="shrink-0 w-8 h-8 rounded-full bg-white border shadow-sm text-arini hover:bg-muted flex items-center justify-center transition-colors"
            >
              <ChevronLeft size={16} />
            </button>
          )}
          <div
            ref={stripRef}
            className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth pb-1 min-w-0 max-w-[432px]"
          >
            {images.map((img, idx) => (
              <button
                type="button"
                key={img.id}
                data-thumb={idx}
                onClick={() => setActive(idx)}
                className={`relative aspect-square w-20 shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                  idx === active ? "border-gold" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <Image src={img.url} alt="" fill className="object-cover" sizes="80px" quality={45} />
              </button>
            ))}
          </div>
          {images.length > 5 && (
            <button
              type="button"
              onClick={() => scrollStrip(1)}
              aria-label="Próximas miniaturas"
              className="shrink-0 w-8 h-8 rounded-full bg-white border shadow-sm text-arini hover:bg-muted flex items-center justify-center transition-colors"
            >
              <ChevronRight size={16} />
            </button>
          )}
        </div>
      )}
    </div>
  );
}
