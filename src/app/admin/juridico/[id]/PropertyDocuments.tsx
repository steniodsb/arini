"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadPropertyDocuments } from "@/lib/upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SavingModal } from "@/components/crm/SavingModal";
import { formatDateBR } from "@/lib/utils";
import { Upload, FileText, ExternalLink, Trash2 } from "lucide-react";

// Tipos aceitos pela tabela property_documents.
const DOC_TYPES = [
  ["matricula", "Matrícula"],
  ["escritura", "Escritura"],
  ["iptu", "IPTU"],
  ["contrato", "Contrato"],
  ["anexo", "Anexo"],
  ["outro", "Outro"],
] as const;

interface Doc {
  id: string;
  tipo: string;
  nome: string | null;
  url: string;
  storage_path: string | null;
  created_at: string;
}

export function PropertyDocuments({ propertyId, initial }: { propertyId: string; initial: Doc[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<Doc[]>(initial);
  const [tipo, setTipo] = useState("contrato");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const res = await uploadPropertyDocuments(supabase, propertyId, Array.from(files), {
      tipo,
      onProgress: (d, t, name) => setProgress(`${d}/${t} ${name}`),
    });
    setBusy(false);
    setProgress("");
    if (res.failed.length) setError(res.failed.map((f) => `${f.name}: ${f.error}`).join("; "));
    const { data } = await supabase.from("property_documents").select("*").eq("property_id", propertyId).order("created_at", { ascending: false });
    setItems((data ?? []) as Doc[]);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  // Bucket privado: gera URL assinada na hora de abrir.
  async function open(d: Doc) {
    const supabase = createSupabaseBrowser();
    if (d.storage_path) {
      const { data } = await supabase.storage.from("property-documents").createSignedUrl(d.storage_path, 3600);
      if (data?.signedUrl) { window.open(data.signedUrl, "_blank"); return; }
    }
    window.open(d.url, "_blank");
  }

  async function remove(d: Doc) {
    if (!confirm(`Excluir o documento "${d.nome ?? d.tipo}"?`)) return;
    const supabase = createSupabaseBrowser();
    if (d.storage_path) await supabase.storage.from("property-documents").remove([d.storage_path]);
    const { error } = await supabase.from("property_documents").delete().eq("id", d.id);
    if (error) { setError(error.message); return; }
    setItems((prev) => prev.filter((x) => x.id !== d.id));
    router.refresh();
  }

  return (
    <Card>
      <SavingModal
        open={busy}
        title="Enviando documento"
        steps={[{ label: progress ? `Enviando… ${progress}` : "Enviando documento…", status: "doing" }]}
        progress={null}
      />
      <CardHeader>
        <CardTitle>Documentos do imóvel</CardTitle>
        <p className="text-xs text-muted-foreground">Anexe matrícula, escritura, contratos e outros arquivos para manter o arquivo do imóvel.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-auto min-w-[160px]">
            {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <Button type="button" size="sm" variant="gold" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> {busy ? `Enviando… ${progress}` : "Anexar documento"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento anexado.</p>}
          {items.map((d) => (
            <div key={d.id} className="flex items-center justify-between border rounded-md p-3 text-sm">
              <div className="flex items-center gap-2 min-w-0">
                <FileText size={16} className="text-muted-foreground shrink-0" />
                <button type="button" onClick={() => open(d)} className="text-arini hover:text-gold-dark truncate text-left">
                  {d.nome ?? d.tipo} <ExternalLink size={11} className="inline" />
                </button>
                <Badge variant="outline">{d.tipo}</Badge>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-[11px] text-muted-foreground">{formatDateBR(d.created_at)}</span>
                <button type="button" onClick={() => remove(d)} className="text-red-600 hover:text-red-700 p-1" title="Excluir">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
