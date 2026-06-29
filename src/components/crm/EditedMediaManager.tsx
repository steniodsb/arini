"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadMarketingMedia, isR2Active } from "@/lib/upload";
import { UploadProgress, type UploadState } from "@/components/crm/UploadProgress";
import { SavingModal } from "@/components/crm/SavingModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Film, FileArchive } from "lucide-react";
import type { MarketingMedia } from "@/lib/types";

function fileNameFromPath(path: string | null, fallback: string) {
  if (!path) return fallback;
  return path.split("/").pop() || fallback;
}

/**
 * Mídias EDITADAS do imóvel (marketing_media fase='editada') — as que vão para
 * o site no lugar das cruas. Permite subir e excluir. Contraparte do
 * PropertyMediaManager (que cuida das mídias cruas da captação).
 */
export function EditedMediaManager({
  propertyId,
  campaignId,
  initial,
}: {
  propertyId: string;
  campaignId: string | null;
  initial: MarketingMedia[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MarketingMedia[]>(initial);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const startedAt = Date.now();
    const res = await uploadMarketingMedia(supabase, propertyId, Array.from(files), {
      campaignId,
      fase: "editada",
      onByteProgress: (loaded, total, name) =>
        setProgress((prev) => ({ loaded, total, name, startedAt: prev?.startedAt ?? startedAt })),
    });
    setBusy(false);
    setProgress(null);
    if (res.failed.length) setError(res.failed.map((f) => `${f.name}: ${f.error}`).join("; "));
    const { data } = await supabase
      .from("marketing_media")
      .select("*")
      .eq("property_id", propertyId)
      .eq("fase", "editada")
      .order("created_at", { ascending: false });
    setItems((data ?? []) as MarketingMedia[]);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function removeItem(m: MarketingMedia) {
    if (!confirm("Excluir esta mídia editada?")) return;
    const supabase = createSupabaseBrowser();
    if (m.storage_path) {
      if (isR2Active()) {
        await fetch("/api/storage/delete", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: m.storage_path }),
        }).catch(() => {});
      } else {
        await supabase.storage.from("marketing-media").remove([m.storage_path]);
      }
    }
    const { error } = await supabase.from("marketing_media").delete().eq("id", m.id);
    if (error) { setError(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    router.refresh();
  }

  return (
    <Card>
      <SavingModal
        open={busy}
        title="Enviando mídias editadas"
        steps={[{ label: "Enviando arquivos para o servidor", status: "doing" }]}
        progress={progress}
      />
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <span>Mídias editadas ({items.length})</span>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <Button type="button" size="sm" variant="gold" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> {busy ? "Enviando…" : "Subir editadas"}
          </Button>
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          As editadas substituem as cruas no site. Sem editadas, o site usa as cruas.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        {progress && <UploadProgress state={progress} />}
        {error && <p className="text-xs text-red-600">{error}</p>}
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma mídia editada enviada.</p>
        ) : (
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {items.map((m) => (
              <div key={m.id} className="relative aspect-square rounded-md overflow-hidden bg-muted border group">
                {m.tipo === "imagem" ? (
                  <Image src={m.url} alt="" fill className="object-cover" sizes="120px" />
                ) : (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground p-1">
                    {m.tipo === "video" ? <Film size={22} /> : <FileArchive size={22} />}
                    <span className="text-[9px] text-center break-all leading-tight">{fileNameFromPath(m.storage_path, m.tipo)}</span>
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => removeItem(m)}
                  title="Excluir"
                  className="absolute top-1 right-1 bg-white/90 hover:bg-white text-red-600 rounded p-1 opacity-0 group-hover:opacity-100 transition"
                >
                  <Trash2 size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
