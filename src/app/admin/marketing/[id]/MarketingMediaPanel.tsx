"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadMarketingMedia } from "@/lib/upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Upload } from "lucide-react";
import type { MarketingMedia, PropertyMedia } from "@/lib/types";

export function MarketingMediaPanel({
  propertyId,
  campaignId,
  raw,
  edited,
}: {
  propertyId: string;
  campaignId: string | null;
  raw: PropertyMedia[];
  edited: MarketingMedia[];
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<MarketingMedia[]>(edited);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const res = await uploadMarketingMedia(supabase, propertyId, Array.from(files), {
      campaignId,
      fase: "editada",
      onProgress: (d, t, name) => setProgress(`${d}/${t} ${name}`),
    });
    setBusy(false);
    setProgress("");
    if (res.failed.length) setError(res.failed.map((f) => `${f.name}: ${f.error}`).join("; "));
    const { data } = await supabase.from("marketing_media").select("*").eq("property_id", propertyId).eq("fase", "editada").order("created_at", { ascending: false });
    setItems((data ?? []) as MarketingMedia[]);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  return (
    <Card>
      <CardHeader><CardTitle>Mídias</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div>
          <div className="text-xs uppercase text-muted-foreground mb-2">Recebidas da captação (brutas)</div>
          {raw.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mídia recebida ainda.</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {raw.map((m) => (
                <div key={m.id} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                  {m.tipo === "imagem"
                    ? <Image src={m.url} alt="" fill className="object-cover" sizes="120px" />
                    : <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">{m.tipo}</div>}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="border-t pt-4">
          <div className="flex items-center justify-between mb-2">
            <div className="text-xs uppercase text-muted-foreground">Mídias editadas (para publicar)</div>
            <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
            <Button type="button" size="sm" variant="gold" disabled={busy} onClick={() => inputRef.current?.click()}>
              <Upload size={14} /> {busy ? `Enviando… ${progress}` : "Subir editadas"}
            </Button>
          </div>
          {error && <p className="text-xs text-red-600 mb-2">{error}</p>}
          {items.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma mídia editada enviada.</p>
          ) : (
            <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
              {items.map((m) => (
                <div key={m.id} className="relative aspect-square rounded-md overflow-hidden bg-muted">
                  {m.tipo === "imagem"
                    ? <Image src={m.url} alt="" fill className="object-cover" sizes="120px" />
                    : <div className="absolute inset-0 flex items-center justify-center text-xs text-muted-foreground">{m.tipo}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
