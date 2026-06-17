"use client";

import { humanSize } from "@/components/crm/MediaUploader";

export interface UploadState {
  loaded: number;
  total: number;
  name: string;
  startedAt: number;
}

function fmtEta(seconds: number): string {
  if (!isFinite(seconds) || seconds <= 0) return "calculando…";
  if (seconds < 60) return `~${Math.ceil(seconds)}s restantes`;
  const m = Math.floor(seconds / 60);
  const s = Math.ceil(seconds % 60);
  return `~${m}m ${s}s restantes`;
}

/** Barra de progresso real (bytes) com porcentagem, velocidade e tempo estimado. */
export function UploadProgress({ state }: { state: UploadState | null }) {
  if (!state || state.total <= 0) return null;
  const pct = Math.min(100, Math.round((state.loaded / state.total) * 100));
  const elapsed = (Date.now() - state.startedAt) / 1000;
  const rate = elapsed > 0 ? state.loaded / elapsed : 0; // bytes/s
  const remaining = rate > 0 ? (state.total - state.loaded) / rate : Infinity;
  const done = state.loaded >= state.total;

  return (
    <div className="rounded-md border bg-muted/30 p-3 space-y-2">
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium text-arini">{done ? "Finalizando…" : "Enviando mídias…"}</span>
        <span className="text-muted-foreground">{pct}%</span>
      </div>
      <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
        <div className="h-2 rounded-full bg-gold-gradient transition-[width] duration-200" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex items-center justify-between text-[11px] text-muted-foreground">
        <span>{humanSize(state.loaded)} / {humanSize(state.total)}{rate > 0 ? ` · ${humanSize(rate)}/s` : ""}</span>
        <span>{done ? "quase lá…" : fmtEta(remaining)}</span>
      </div>
      {state.name && <div className="text-[11px] text-muted-foreground truncate">Atual: {state.name}</div>}
    </div>
  );
}
