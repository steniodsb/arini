"use client";

import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { CHAT_MAX_TEXTO, type ChatMensagem } from "@/lib/types";
import { Paperclip, Send, X, CornerUpLeft } from "lucide-react";

/**
 * O campo de escrever.
 *
 * Enter envia, Shift+Enter quebra linha — a convenção de todo chat. Quem
 * escreve mensagem longa aprende o Shift+Enter uma vez; quem escreve
 * mensagem curta (a maioria) não deveria precisar clicar em botão.
 */
export function CampoEnvio({
  enviando, respondendoA, autorDaResposta, onCancelarResposta, onEnviar,
}: {
  enviando: boolean;
  respondendoA: ChatMensagem | null;
  autorDaResposta: string | null;
  onCancelarResposta: () => void;
  onEnviar: (dados: { texto: string; arquivos: File[] }) => void | Promise<void>;
}) {
  const [texto, setTexto] = useState("");
  const [arquivos, setArquivos] = useState<File[]>([]);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const vazio = !texto.trim() && arquivos.length === 0;

  async function enviar() {
    if (vazio || enviando) return;
    const carga = { texto, arquivos };
    // Limpa ANTES de aguardar: a mensagem já está a caminho e deixar o
    // texto no campo faz a pessoa achar que não foi e mandar de novo.
    setTexto("");
    setArquivos([]);
    await onEnviar(carga);
  }

  return (
    <div className="border-t shrink-0">
      {respondendoA && (
        <div className="px-3 py-1.5 border-b bg-muted/40 flex items-start gap-2">
          <CornerUpLeft size={12} className="mt-0.5 text-muted-foreground shrink-0" />
          <div className="min-w-0 flex-1 text-xs">
            <span className="font-medium">{autorDaResposta ?? "Alguém"}</span>
            <span className="block truncate text-muted-foreground">
              {respondendoA.texto ?? `[${respondendoA.media_nome ?? "anexo"}]`}
            </span>
          </div>
          <button
            type="button"
            onClick={onCancelarResposta}
            className="text-muted-foreground hover:text-arini shrink-0"
            aria-label="Cancelar resposta"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {arquivos.length > 0 && (
        <div className="px-3 py-1.5 border-b flex flex-wrap gap-1.5">
          {arquivos.map((f, i) => (
            <span
              key={`${f.name}-${i}`}
              className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px] max-w-[180px]"
            >
              <Paperclip size={10} className="shrink-0" />
              <span className="truncate">{f.name}</span>
              <button
                type="button"
                onClick={() => setArquivos((p) => p.filter((_, j) => j !== i))}
                className="text-muted-foreground hover:text-red-600 shrink-0"
                aria-label={`Remover ${f.name}`}
              >
                <X size={10} />
              </button>
            </span>
          ))}
        </div>
      )}

      <div className="p-2 flex items-end gap-2">
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          className="p-2 text-muted-foreground hover:text-arini shrink-0"
          aria-label="Anexar arquivo"
        >
          <Paperclip size={18} />
        </button>
        <input
          ref={fileRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files) setArquivos((p) => [...p, ...Array.from(e.target.files!)]);
            e.target.value = "";
          }}
        />

        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value.slice(0, CHAT_MAX_TEXTO))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void enviar();
            }
          }}
          rows={1}
          placeholder="Escreva uma mensagem…  (Enter envia, Shift+Enter quebra linha)"
          className="flex-1 min-w-0 resize-none rounded-md border bg-background px-2.5 py-2 text-sm max-h-32"
        />

        <Button
          type="button"
          variant="gold"
          size="sm"
          onClick={() => void enviar()}
          disabled={vazio || enviando}
          className="shrink-0"
        >
          <Send size={14} />
        </Button>
      </div>
    </div>
  );
}
