"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadPropertyMedia, isR2Active } from "@/lib/upload";
import { MediaUploader } from "@/components/crm/MediaUploader";
import { UploadProgress, type UploadState } from "@/components/crm/UploadProgress";
import { SavingModal } from "@/components/crm/SavingModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Trash2, Star, Upload, ExternalLink } from "lucide-react";
import type { PropertyMedia } from "@/lib/types";

export function PropertyMediaManager({
  propertyId,
  initial,
}: {
  propertyId: string;
  initial: PropertyMedia[];
}) {
  const router = useRouter();
  const [items, setItems] = useState<PropertyMedia[]>(initial);
  const [files, setFiles] = useState<File[]>([]);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refetch() {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase.from("property_media").select("*").eq("property_id", propertyId).order("ordem");
    setItems((data ?? []) as PropertyMedia[]);
  }

  async function enviar() {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const startedAt = Date.now();
    const res = await uploadPropertyMedia(supabase, propertyId, files, {
      startOrder: items.length,
      markFirstAsCover: items.length === 0,
      onByteProgress: (loaded, total, name) =>
        setProgress((prev) => ({ loaded, total, name, startedAt: prev?.startedAt ?? startedAt })),
    });
    setBusy(false);
    setProgress(null);
    if (res.failed.length) setError(res.failed.map((f) => `${f.name}: ${f.error}`).join("; "));
    setFiles([]);
    await refetch();
    router.refresh();
  }

  async function remover(m: PropertyMedia) {
    if (!confirm("Remover esta mídia?")) return;
    const supabase = createSupabaseBrowser();
    // Remove o arquivo do storage (R2 via rota; Supabase direto).
    if (m.storage_path) {
      if (isR2Active()) {
        await fetch("/api/storage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: m.storage_path }),
        }).catch(() => {});
      } else {
        await supabase.storage.from("property-media").remove([m.storage_path]);
      }
    }
    const { error } = await supabase.from("property_media").delete().eq("id", m.id);
    if (error) { setError(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    router.refresh();
  }

  async function definirCapa(m: PropertyMedia) {
    const supabase = createSupabaseBrowser();
    await supabase.from("property_media").update({ capa: false }).eq("property_id", propertyId);
    await supabase.from("property_media").update({ capa: true }).eq("id", m.id);
    setItems((prev) => prev.map((x) => ({ ...x, capa: x.id === m.id })));
    router.refresh();
  }

  return (
    <Card>
      <SavingModal
        open={busy}
        title="Enviando mídias"
        steps={[{ label: "Enviando arquivos para o servidor", status: "doing" }]}
        progress={progress}
      />
      <CardHeader>
        <CardTitle>Mídias ({items.length})</CardTitle>
        <p className="text-xs text-muted-foreground">Adicione, remova e defina a capa. Clique para abrir em alta.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mídia ainda.</p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {items.map((m) => (
              <div key={m.id} className="relative aspect-square rounded-md overflow-hidden bg-muted border group">
                <a href={m.url} target="_blank" rel="noopener noreferrer" className="absolute inset-0">
                  {m.tipo === "imagem" ? (
                    <Image src={m.url} alt="" fill className="object-cover" sizes="160px" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-xs text-muted-foreground">
                      <ExternalLink size={16} /> {m.tipo}
                    </div>
                  )}
                </a>
                {m.capa && (
                  <span className="absolute top-1 left-1 bg-gold-gradient text-arini text-[9px] font-bold px-1.5 py-0.5 rounded">CAPA</span>
                )}
                <div className="absolute bottom-1 right-1 flex gap-1 opacity-0 group-hover:opacity-100 transition">
                  {!m.capa && (
                    <button type="button" onClick={() => definirCapa(m)} title="Definir como capa"
                      className="bg-white/90 hover:bg-white text-gold-dark rounded p-1"><Star size={12} /></button>
                  )}
                  <button type="button" onClick={() => remover(m)} title="Remover"
                    className="bg-white/90 hover:bg-white text-red-600 rounded p-1"><Trash2 size={12} /></button>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="border-t pt-4 space-y-3">
          <MediaUploader onChange={setFiles} />
          {progress && <UploadProgress state={progress} />}
          {error && <p className="text-xs text-red-600">{error}</p>}
          {files.length > 0 && (
            <div className="flex justify-end">
              <Button type="button" variant="gold" onClick={enviar} disabled={busy}>
                <Upload size={14} /> {busy ? "Enviando…" : `Enviar ${files.length} arquivo(s)`}
              </Button>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
