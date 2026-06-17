"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { uploadClientDocuments } from "@/lib/upload";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { SavingModal } from "@/components/crm/SavingModal";
import { formatDateBR } from "@/lib/utils";
import { Upload, FileText, ExternalLink } from "lucide-react";
import type { ClientDocument } from "@/lib/types";

const DOC_TYPES = [
  ["contrato", "Contrato"],
  ["procuracao", "Procuração"],
  ["rg_cpf", "RG / CPF"],
  ["comprovante", "Comprovante"],
  ["certidao", "Certidão"],
  ["escritura", "Escritura"],
  ["outro", "Outro"],
] as const;

export function ClientDocuments({ clientId, initial }: { clientId: string; initial: ClientDocument[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [items, setItems] = useState<ClientDocument[]>(initial);
  const [tipo, setTipo] = useState("contrato");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const res = await uploadClientDocuments(supabase, clientId, Array.from(files), {
      tipo,
      onProgress: (d, t, name) => setProgress(`${d}/${t} ${name}`),
    });
    setBusy(false);
    setProgress("");
    if (res.failed.length) setError(res.failed.map((f) => `${f.name}: ${f.error}`).join("; "));
    const { data } = await supabase.from("client_documents").select("*").eq("client_id", clientId).order("created_at", { ascending: false });
    setItems((data ?? []) as ClientDocument[]);
    if (inputRef.current) inputRef.current.value = "";
    router.refresh();
  }

  async function setStatus(id: string, status: string) {
    const supabase = createSupabaseBrowser();
    await supabase.from("client_documents").update({ status }).eq("id", id);
    setItems((prev) => prev.map((d) => (d.id === id ? { ...d, status: status as ClientDocument["status"] } : d)));
  }

  // Bucket privado: gera URL assinada na hora de abrir.
  async function open(d: ClientDocument) {
    const supabase = createSupabaseBrowser();
    if (d.storage_path) {
      const { data } = await supabase.storage.from("client-documents").createSignedUrl(d.storage_path, 3600);
      if (data?.signedUrl) { window.open(data.signedUrl, "_blank"); return; }
    }
    window.open(d.url, "_blank");
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
        <CardTitle>Documentos do cliente</CardTitle>
        <p className="text-xs text-muted-foreground">Anexe e forneça documentos a este cliente.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted-foreground">Tipo:</span>
          <Select value={tipo} onChange={(e) => setTipo(e.target.value)} className="w-auto min-w-[180px]">
            {DOC_TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </Select>
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
          <Button type="button" size="sm" variant="gold" disabled={busy} onClick={() => inputRef.current?.click()}>
            <Upload size={14} /> {busy ? `Enviando… ${progress}` : "Enviar documento"}
          </Button>
        </div>
        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="space-y-2">
          {items.length === 0 && <p className="text-sm text-muted-foreground">Nenhum documento ainda.</p>}
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
                <Select value={d.status} onChange={(e) => setStatus(d.id, e.target.value)} className="w-auto h-8 text-xs">
                  <option value="pendente">Pendente</option>
                  <option value="entregue">Entregue</option>
                  <option value="assinado">Assinado</option>
                  <option value="cancelado">Cancelado</option>
                </Select>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
