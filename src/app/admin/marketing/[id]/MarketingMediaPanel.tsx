"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadMarketingMedia } from "@/lib/upload";
import { UploadProgress, type UploadState } from "@/components/crm/UploadProgress";
import { SavingModal } from "@/components/crm/SavingModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload, Trash2, Download, Film, FileArchive, ImageIcon, ExternalLink } from "lucide-react";
import type { MarketingMedia, PropertyMedia } from "@/lib/types";

function fileNameFromPath(path: string | null, fallback: string) {
  if (!path) return fallback;
  const last = path.split("/").pop();
  return last || fallback;
}

// Baixa o arquivo original em alta qualidade (blob → download forçado).
async function downloadFile(url: string, filename: string) {
  try {
    const res = await fetch(url);
    const blob = await res.blob();
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(a.href);
  } catch {
    // fallback: abre em nova aba
    window.open(url, "_blank");
  }
}

export function MarketingMediaPanel({
  propertyId,
  campaignId,
  raw,
  edited,
  driveLink,
}: {
  propertyId: string;
  campaignId: string | null;
  raw: PropertyMedia[];
  edited: MarketingMedia[];
  driveLink?: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MarketingMedia[]>(edited);
  const [busy, setBusy] = useState(false);
  const [downloading, setDownloading] = useState<string | null>(null);
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
    const { data } = await supabase.from("marketing_media").select("*").eq("property_id", propertyId).eq("fase", "editada").order("created_at", { ascending: false });
    setItems((data ?? []) as MarketingMedia[]);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function removeItem(m: MarketingMedia) {
    if (!confirm("Excluir esta mídia editada?")) return;
    const supabase = createSupabaseBrowser();
    if (m.storage_path) await supabase.storage.from("marketing-media").remove([m.storage_path]);
    const { error } = await supabase.from("marketing_media").delete().eq("id", m.id);
    if (error) { setError(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== m.id));
    router.refresh();
  }

  async function downloadOne(m: PropertyMedia) {
    setDownloading(m.id);
    await downloadFile(m.url, fileNameFromPath(m.storage_path, `midia-${m.id}`));
    setDownloading(null);
  }

  async function downloadAll() {
    setDownloading("all");
    for (const m of raw) {
      await downloadFile(m.url, fileNameFromPath(m.storage_path, `midia-${m.id}`));
    }
    setDownloading(null);
  }

  return (
    <Card>
      <SavingModal
        open={busy}
        title="Enviando mídias editadas"
        steps={[{ label: "Enviando arquivos para o servidor", status: "doing" }]}
        progress={progress}
      />
      <CardHeader><CardTitle>Mídias</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {driveLink && (
          <a
            href={driveLink}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2 rounded-md border border-gold/40 bg-gold/5 px-3 py-2 text-sm text-arini hover:bg-gold/10"
          >
            <ExternalLink size={14} /> Pasta de mídias da captação (drive) — abrir
          </a>
        )}
        <div>
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-muted-foreground">Recebidas da captação (brutas — alta qualidade)</div>
            {raw.length > 0 && (
              <Button type="button" size="sm" variant="outline" disabled={downloading !== null} onClick={downloadAll}>
                <Download size={14} /> {downloading === "all" ? "Baixando…" : `Baixar todas (${raw.length})`}
              </Button>
            )}
          </div>
          {raw.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mídia recebida ainda.</p>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {raw.map((m) => {
                const nome = fileNameFromPath(m.storage_path, m.tipo);
                const isZip = nome.toLowerCase().endsWith(".zip");
                return (
                  <div key={m.id} className="relative rounded-md overflow-hidden border bg-muted group">
                    <div className="relative aspect-square">
                      {m.tipo === "imagem" ? (
                        <Image src={m.url} alt="" fill className="object-cover" sizes="160px" />
                      ) : (
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-muted-foreground p-2">
                          {m.tipo === "video" ? <Film size={28} /> : isZip ? <FileArchive size={28} /> : <ImageIcon size={28} />}
                          <span className="text-[10px] text-center break-all leading-tight">{nome}</span>
                        </div>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => downloadOne(m)}
                      disabled={downloading !== null}
                      className="absolute bottom-0 inset-x-0 bg-arini/90 hover:bg-arini text-white text-xs py-1.5 inline-flex items-center justify-center gap-1"
                    >
                      <Download size={12} /> {downloading === m.id ? "Baixando…" : "Baixar original"}
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-muted-foreground">Mídias editadas (para publicar)</div>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button type="button" size="sm" variant="gold" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload size={14} /> {busy ? "Enviando…" : "Subir editadas"}
            </Button>
          </div>
          {progress && <div className="mb-2"><UploadProgress state={progress} /></div>}
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mídia editada enviada.</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {items.map((m) => (
                <div key={m.id} className="relative aspect-square rounded-md overflow-hidden bg-muted group">
                  {m.tipo === "imagem"
                    ? <Image src={m.url} alt="" fill className="object-cover" sizes="120px" />
                    : (
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
        </div>
      </CardContent>
    </Card>
  );
}
