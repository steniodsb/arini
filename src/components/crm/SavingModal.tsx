"use client";

import { Loader2, CheckCircle2 } from "lucide-react";
import { UploadProgress, type UploadState } from "@/components/crm/UploadProgress";

export interface SaveStep {
  label: string;
  status: "pending" | "doing" | "done";
}

/**
 * Modal central de salvamento: mostra o passo atual, a lista de etapas e a
 * barra de progresso real (bytes) durante o upload de mídias.
 */
export function SavingModal({
  open,
  title = "Salvando…",
  steps,
  progress,
}: {
  open: boolean;
  title?: string;
  steps: SaveStep[];
  progress: UploadState | null;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[70] bg-black/50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <div className="flex items-center gap-3">
          <Loader2 className="animate-spin text-gold-dark shrink-0" size={22} />
          <h2 className="font-display text-xl text-arini">{title}</h2>
        </div>

        <ul className="space-y-2">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-2 text-sm">
              {s.status === "done" ? (
                <CheckCircle2 size={16} className="text-emerald-600 shrink-0" />
              ) : s.status === "doing" ? (
                <Loader2 size={16} className="animate-spin text-gold-dark shrink-0" />
              ) : (
                <span className="w-4 h-4 rounded-full border border-muted-foreground/30 shrink-0" />
              )}
              <span className={s.status === "pending" ? "text-muted-foreground" : "text-arini"}>{s.label}</span>
            </li>
          ))}
        </ul>

        {progress && <UploadProgress state={progress} />}

        <p className="text-xs text-muted-foreground text-center">Não feche esta janela enquanto salva.</p>
      </div>
    </div>
  );
}
