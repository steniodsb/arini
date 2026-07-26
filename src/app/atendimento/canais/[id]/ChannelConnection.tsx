"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { errMessage } from "@/lib/utils";
import type { AtendimentoChannelSafe, ChannelStatus } from "@/lib/types";
import { QrCode, RefreshCw, Plug, CheckCircle2, Smartphone } from "lucide-react";

// Painel de conexão do canal. A UI é a mesma para os três provedores: o
// servidor devolve status e, quando a Evolution pede, um QR Code em base64.
// Enquanto o QR estiver na tela fazemos polling — ele expira em ~40s e a
// Evolution gera outro, então recarregar sozinho evita o usuário achar que
// travou.
export function ChannelConnection({
  canal,
  webhookUrl,
}: {
  canal: AtendimentoChannelSafe;
  webhookUrl: string;
}) {
  const [status, setStatus] = useState<ChannelStatus>(canal.status);
  const [qrcode, setQrcode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const router = useRouter();
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const isEvolution = canal.provedor === "evolution";

  const chamar = useCallback(
    async (acao: "conectar" | "status" | "desconectar") => {
      const res = await fetch(`/api/atendimento/canais/${canal.id}/${acao}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "falha na comunicação com o provedor");
      return json as { status: ChannelStatus; qrcode?: string | null };
    },
    [canal.id],
  );

  async function conectar() {
    setLoading(true);
    setErro(null);
    try {
      const json = await chamar("conectar");
      setStatus(json.status);
      setQrcode(json.qrcode ?? null);
      if (json.status === "conectado") router.refresh();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  async function desconectar() {
    if (!confirm("Desconectar este canal? As mensagens param de chegar até reconectar.")) return;
    setLoading(true);
    setErro(null);
    try {
      const json = await chamar("desconectar");
      setStatus(json.status);
      setQrcode(null);
      router.refresh();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setLoading(false);
    }
  }

  // Enquanto espera a leitura do QR, confere o estado a cada 5s.
  useEffect(() => {
    if (status !== "aguardando_qr") {
      if (pollRef.current) clearInterval(pollRef.current);
      return;
    }
    pollRef.current = setInterval(async () => {
      try {
        const json = await chamar("status");
        setStatus(json.status);
        if (json.qrcode) setQrcode(json.qrcode);
        if (json.status === "conectado") {
          setQrcode(null);
          router.refresh();
        }
      } catch {
        // Silencioso: erro de rede no polling não deve poluir a tela.
      }
    }, 5000);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [status, chamar, router]);

  if (status === "conectado") {
    return (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
        <div className="flex items-start gap-3">
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0 mt-0.5" />
          <div className="flex-1 min-w-0">
            <div className="font-medium text-emerald-900">Canal conectado</div>
            <p className="text-sm text-emerald-800 mt-0.5">
              As mensagens deste número já chegam na caixa de conversas.
            </p>
            <div className="mt-3">
              <Button variant="ghost" onClick={desconectar} disabled={loading}>
                Desconectar
              </Button>
            </div>
          </div>
        </div>
        {erro && <div className="mt-2 text-sm text-red-700">{erro}</div>}
      </div>
    );
  }

  return (
    <div className="rounded-lg border p-4 space-y-4">
      <div className="flex items-start gap-3">
        {isEvolution ? (
          <QrCode size={20} className="text-arini dark:text-gold shrink-0 mt-0.5" />
        ) : (
          <Plug size={20} className="text-arini dark:text-gold shrink-0 mt-0.5" />
        )}
        <div className="min-w-0">
          <h2 className="font-medium text-arini dark:text-gold">
            {isEvolution ? "Conectar lendo o QR Code" : "Validar a conexão com a Meta"}
          </h2>
          <p className="text-sm text-muted-foreground mt-0.5">
            {isEvolution
              ? "Clique em conectar, abra o WhatsApp no celular em Aparelhos conectados e aponte a câmera para o código."
              : "Vamos conferir se o token e o número informados respondem na API da Meta."}
          </p>
        </div>
      </div>

      {qrcode && (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="bg-white p-3 rounded-lg border">
            {/* QR vem como data URL base64 da Evolution — <img> puro porque o
                next/image não agrega nada em imagem efêmera e inline. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={qrcode}
              alt="QR Code para conectar o WhatsApp"
              width={240}
              height={240}
            />
          </div>
          <p className="text-xs text-muted-foreground flex items-center gap-1.5">
            <Smartphone size={12} />
            WhatsApp → Aparelhos conectados → Conectar um aparelho
          </p>
          <p className="text-[11px] text-muted-foreground">
            O código expira rápido; se sumir, geramos outro sozinho.
          </p>
        </div>
      )}

      {!isEvolution && (
        <div className="rounded-md bg-muted p-3 text-xs">
          <div className="font-medium text-arini dark:text-gold mb-1">Antes de validar</div>
          <p className="text-muted-foreground">
            No painel da Meta, aponte o webhook para{" "}
            <code className="font-mono break-all">{webhookUrl}</code> usando o mesmo Verify Token
            que você cadastrou aqui.
          </p>
        </div>
      )}

      {erro && (
        <div className="text-sm bg-red-50 text-red-800 border border-red-200 rounded-md px-3 py-2">
          {erro}
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="gold" onClick={conectar} disabled={loading}>
          {loading ? (
            <>
              <RefreshCw size={15} className="animate-spin" /> Conectando…
            </>
          ) : (
            <>{isEvolution ? "Gerar QR Code" : "Validar conexão"}</>
          )}
        </Button>
        {status === "aguardando_qr" && (
          <span className="text-xs text-muted-foreground self-center">
            Aguardando leitura do código…
          </span>
        )}
      </div>
    </div>
  );
}
