"use client";

import { useCallback, useRef, useState } from "react";
import { UploadCloud, X, FileVideo, FileImage, FileArchive } from "lucide-react";

export interface PickedFile {
  file: File;
  id: string;
  previewUrl: string | null;
}

function kindOf(file: File): "imagem" | "video" | "outro" {
  if (file.type.startsWith("image/")) return "imagem";
  if (file.type.startsWith("video/")) return "video";
  return "outro";
}

export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
}

/**
 * Seletor de arquivos com drag&drop, preview, remoção individual e
 * suporte a vários tipos (incl. mídia bruta/vídeo grande). Apenas SELECIONA;
 * o upload em si é feito pelo formulário via `onChange`.
 */
export function MediaUploader({
  onChange,
  accept = "image/*,video/*,.dng,.cr2,.cr3,.nef,.arw,.rw2,.zip",
  maxSizeMB = 1024,
  label = "Arraste arquivos aqui ou clique para selecionar",
  hint,
}: {
  onChange: (files: File[]) => void;
  accept?: string;
  maxSizeMB?: number;
  label?: string;
  hint?: string;
}) {
  const [picked, setPicked] = useState<PickedFile[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const [warn, setWarn] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const effectiveHint = hint ?? `Fotos, vídeos e mídia bruta. Limite de ${maxSizeMB} MB por arquivo.`;

  const addFiles = useCallback(
    (incoming: FileList | File[]) => {
      const arr = Array.from(incoming);
      const tooBig = arr.filter((f) => f.size > maxSizeMB * 1024 * 1024);
      const ok = arr.filter((f) => f.size <= maxSizeMB * 1024 * 1024);
      setWarn(
        tooBig.length
          ? `${tooBig.length} arquivo(s) acima de ${maxSizeMB} MB foram ignorados.`
          : null,
      );
      setPicked((prev) => {
        const next = [
          ...prev,
          ...ok.map((file) => ({
            file,
            id: `${file.name}-${file.size}-${file.lastModified}`,
            previewUrl: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
          })),
        ];
        // dedup por id
        const seen = new Set<string>();
        const deduped = next.filter((p) => (seen.has(p.id) ? false : (seen.add(p.id), true)));
        onChange(deduped.map((p) => p.file));
        return deduped;
      });
    },
    [maxSizeMB, onChange],
  );

  function remove(id: string) {
    setPicked((prev) => {
      const next = prev.filter((p) => p.id !== id);
      onChange(next.map((p) => p.file));
      return next;
    });
  }

  return (
    <div className="space-y-3">
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragOver(false);
          if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
          dragOver ? "border-arini bg-arini/5" : "border-muted-foreground/25 hover:border-arini/50"
        }`}
      >
        <UploadCloud className="text-arini" size={28} />
        <div className="text-sm font-medium text-arini">{label}</div>
        <div className="text-xs text-muted-foreground">{effectiveHint}</div>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={accept}
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.length) addFiles(e.target.files);
            e.target.value = "";
          }}
        />
      </div>

      {warn && (
        <p className="text-xs text-amber-600 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
          {warn}
        </p>
      )}

      {picked.length > 0 && (
        <>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {picked.length} arquivo(s) ·{" "}
              {humanSize(picked.reduce((s, p) => s + p.file.size, 0))}
            </span>
            <span>A primeira imagem será a capa.</span>
          </div>
          <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
            {picked.map((p) => {
              const kind = kindOf(p.file);
              return (
                <div key={p.id} className="relative aspect-square rounded-md overflow-hidden bg-muted border">
                  {p.previewUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={p.previewUrl} alt="" className="absolute inset-0 w-full h-full object-cover" />
                  ) : (
                    <div className="absolute inset-0 flex flex-col items-center justify-center gap-1 text-muted-foreground p-2">
                      {kind === "video" ? <FileVideo size={20} /> : kind === "outro" ? <FileArchive size={20} /> : <FileImage size={20} />}
                      <span className="text-[10px] text-center break-all line-clamp-2">{p.file.name}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      remove(p.id);
                    }}
                    className="absolute top-1 right-1 bg-black/60 hover:bg-black/80 text-white rounded-full p-1"
                    aria-label="Remover"
                  >
                    <X size={12} />
                  </button>
                  <span className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[9px] px-1 py-0.5 truncate">
                    {humanSize(p.file.size)}
                  </span>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
