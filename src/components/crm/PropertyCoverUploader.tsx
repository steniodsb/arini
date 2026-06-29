"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadPropertyCover, removePropertyCover, uploadErrorMsg } from "@/lib/upload";
import { UploadProgress, type UploadState } from "@/components/crm/UploadProgress";
import { SavingModal } from "@/components/crm/SavingModal";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ImageUp, Trash2, Star } from "lucide-react";

/**
 * Foto principal (capa fixa) do imóvel. É a imagem que fica como capa no site
 * — nos cards da home e da listagem — independentemente de existir foto
 * editada do marketing. Uma única imagem; enviar de novo substitui a anterior.
 */
export function PropertyCoverUploader({
  propertyId,
  url,
  path,
}: {
  propertyId: string;
  url: string | null;
  path: string | null;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [coverUrl, setCoverUrl] = useState<string | null>(url);
  const [coverPath, setCoverPath] = useState<string | null>(path);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<UploadState | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("A foto principal deve ser uma imagem.");
      return;
    }
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const startedAt = Date.now();
    try {
      const { url: newUrl, path: newPath } = await uploadPropertyCover(supabase, propertyId, file, {
        previousPath: coverPath,
        onByteProgress: (loaded, total) =>
          setProgress((prev) => ({ loaded, total, name: file.name, startedAt: prev?.startedAt ?? startedAt })),
      });
      setCoverUrl(newUrl);
      setCoverPath(newPath);
      router.refresh();
    } catch (e) {
      setError(uploadErrorMsg(e instanceof Error ? e.message : String(e)));
    } finally {
      setBusy(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  async function remover() {
    if (!confirm("Remover a foto principal? A capa do site voltará a usar a foto editada/crua.")) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    try {
      await removePropertyCover(supabase, propertyId, coverPath);
      setCoverUrl(null);
      setCoverPath(null);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <SavingModal
        open={busy}
        title="Enviando foto principal"
        steps={[{ label: "Enviando a capa para o servidor", status: "doing" }]}
        progress={progress}
      />
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Star size={16} className="text-gold-dark" /> Foto principal (capa do site)
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Esta foto é a capa do imóvel no site, mesmo que existam fotos editadas. Enviar uma nova substitui a atual.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        {coverUrl ? (
          <div className="flex items-start gap-4">
            <div className="relative aspect-[4/3] w-48 rounded-md overflow-hidden bg-muted border shrink-0">
              <Image src={coverUrl} alt="Foto principal" fill className="object-cover" sizes="192px" />
              <span className="absolute top-1 left-1 bg-gold-gradient text-arini text-[9px] font-bold px-1.5 py-0.5 rounded">
                CAPA
              </span>
            </div>
            <div className="flex flex-col gap-2">
              <Button type="button" variant="gold" size="sm" disabled={busy} onClick={() => inputRef.current?.click()}>
                <ImageUp size={14} /> Trocar foto
              </Button>
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={remover}>
                <Trash2 size={14} /> Remover
              </Button>
            </div>
          </div>
        ) : (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
            className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer border-muted-foreground/25 hover:border-arini/50 transition-colors"
          >
            <ImageUp className="text-arini" size={28} />
            <div className="text-sm font-medium text-arini">Enviar foto principal</div>
            <div className="text-xs text-muted-foreground">Uma imagem que ficará como capa no site.</div>
          </div>
        )}
        {progress && <UploadProgress state={progress} />}
        {error && <p className="text-xs text-red-600">{error}</p>}
      </CardContent>
    </Card>
  );
}
