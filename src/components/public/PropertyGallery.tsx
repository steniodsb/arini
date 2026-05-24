"use client";

import { useState, useRef } from "react";
import Image from "next/image";
import { ChevronLeft, ChevronRight } from "lucide-react";
import type { PropertyMedia } from "@/lib/types";

interface Props {
  images: PropertyMedia[];
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

  return (
    <div className="space-y-3">
      {/* Imagem principal */}
      <div className="relative aspect-[16/10] rounded-xl overflow-hidden bg-muted">
        <Image
          src={current.url}
          alt={title}
          fill
          className="object-cover"
          priority
          sizes="(min-width: 1024px) 800px, 100vw"
        />
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

      {/* Strip de thumbnails */}
      {images.length > 1 && (
        <div className="relative">
          <div
            ref={stripRef}
            className="flex gap-2 overflow-x-auto scrollbar-hide scroll-smooth pb-1"
          >
            {images.map((img, idx) => (
              <button
                type="button"
                key={img.id}
                data-thumb={idx}
                onClick={() => setActive(idx)}
                className={`relative aspect-square w-24 shrink-0 rounded-md overflow-hidden border-2 transition-all ${
                  idx === active ? "border-gold" : "border-transparent opacity-70 hover:opacity-100"
                }`}
              >
                <Image src={img.url} alt="" fill className="object-cover" sizes="100px" />
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
