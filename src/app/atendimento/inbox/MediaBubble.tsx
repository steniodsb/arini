"use client";

import { useState } from "react";
import { FileText, Download, Play, X } from "lucide-react";
import type { Message } from "@/lib/types";

function tamanhoLegivel(bytes: number | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * Renderiza o anexo de uma mensagem conforme o tipo: imagem abre em
 * lightbox, áudio e vídeo tocam inline, documento vira um cartão com
 * download. Sem dependência externa.
 */
export function MediaBubble({ m, saida }: { m: Message; saida: boolean }) {
  const [zoom, setZoom] = useState(false);
  if (!m.media_url) return null;

  const nome = m.media_nome ?? "arquivo";
  const meta = tamanhoLegivel(m.media_tamanho);

  if (m.tipo === "imagem") {
    return (
      <>
        <button
          type="button"
          onClick={() => setZoom(true)}
          className="block overflow-hidden rounded-lg max-w-[260px]"
          title="Ampliar"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={m.media_url} alt={nome} className="w-full h-auto object-cover" loading="lazy" />
        </button>
        {zoom && (
          <div
            className="fixed inset-0 z-[95] bg-black/85 flex items-center justify-center p-6"
            onClick={() => setZoom(false)}
          >
            <button
              type="button"
              className="absolute top-4 right-4 p-2 rounded-full bg-white/10 text-white hover:bg-white/20"
              onClick={() => setZoom(false)}
              aria-label="Fechar"
            >
              <X size={18} />
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={m.media_url}
              alt={nome}
              className="max-h-full max-w-full object-contain rounded"
              onClick={(e) => e.stopPropagation()}
            />
          </div>
        )}
      </>
    );
  }

  if (m.tipo === "audio") {
    return (
      <audio controls src={m.media_url} className="max-w-[260px] w-[260px]">
        Seu navegador não toca áudio.
      </audio>
    );
  }

  if (m.tipo === "video") {
    return (
      <video controls src={m.media_url} className="max-w-[280px] rounded-lg" preload="metadata">
        <Play size={14} /> Seu navegador não toca vídeo.
      </video>
    );
  }

  return (
    <a
      href={m.media_url}
      target="_blank"
      rel="noopener noreferrer"
      download={nome}
      className={`flex items-center gap-2.5 rounded-lg border px-3 py-2 max-w-[260px] transition-colors ${
        saida ? "border-white/25 hover:bg-white/10" : "hover:bg-muted"
      }`}
    >
      <FileText size={20} className="shrink-0 opacity-80" />
      <span className="min-w-0 flex-1">
        <span className="block text-xs font-medium truncate">{nome}</span>
        {meta && <span className={`block text-[10px] ${saida ? "opacity-70" : "text-muted-foreground"}`}>{meta}</span>}
      </span>
      <Download size={14} className="shrink-0 opacity-70" />
    </a>
  );
}
