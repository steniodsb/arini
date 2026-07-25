import Link from "next/link";
import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Badge } from "@/components/ui/badge";
import {
  CHANNEL_PROVIDER_LABELS,
  CHANNEL_STATUS_LABELS,
  type AtendimentoChannelSafe,
  type ChannelStatus,
} from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import { ConnectChannelWizard } from "./ConnectChannelWizard";
import { MessageSquare, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<ChannelStatus, "success" | "warning" | "danger" | "muted"> = {
  conectado: "success",
  aguardando_qr: "warning",
  conectando: "warning",
  erro: "danger",
  desconectado: "muted",
};

export default async function CanaisPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  // View saneada: mostra o estado da conexão sem expor tokens.
  const { data } = await supabase
    .from("atendimento_channels_safe")
    .select("*")
    .order("created_at", { ascending: true });
  const channels = (data ?? []) as AtendimentoChannelSafe[];

  const base = process.env.NEXT_PUBLIC_SITE_URL || "https://atendimento.arininegociosimobiliarios.com.br";

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="font-display text-3xl text-arini">Canais</h1>
            <p className="text-muted-foreground mt-1 text-sm">
              Os números de WhatsApp que o atendimento usa para conversar com os clientes.
            </p>
          </div>
          <ConnectChannelWizard webhookBase={base} />
        </div>

        {channels.length === 0 ? (
          <div className="rounded-lg border border-dashed p-10 text-center">
            <MessageSquare size={32} className="mx-auto text-muted-foreground/40" />
            <h2 className="mt-3 font-medium text-arini">Nenhum canal conectado ainda</h2>
            <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
              Conecte um WhatsApp para começar a receber e responder mensagens por aqui. Dá para
              escolher entre a Evolution API (QR Code) ou a API oficial da Meta.
            </p>
          </div>
        ) : (
          <ul className="space-y-3">
            {channels.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/atendimento/canais/${c.id}`}
                  className="block rounded-lg border bg-white p-4 hover:border-gold transition-colors"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="font-medium text-arini truncate">{c.nome}</div>
                      <div className="text-xs text-muted-foreground mt-0.5">
                        {CHANNEL_PROVIDER_LABELS[c.provedor]}
                        {c.telefone ? ` · ${c.telefone}` : ""}
                      </div>
                    </div>
                    <Badge variant={STATUS_VARIANT[c.status]}>
                      {CHANNEL_STATUS_LABELS[c.status]}
                    </Badge>
                  </div>
                  {c.ultimo_erro && (
                    <div className="mt-2 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-2 py-1 flex gap-1.5">
                      <AlertTriangle size={12} className="shrink-0 mt-0.5" />
                      <span className="break-words">{c.ultimo_erro}</span>
                    </div>
                  )}
                  {c.conectado_em && (
                    <div className="mt-2 text-[11px] text-muted-foreground">
                      Conectado em {formatDateTimeBR(c.conectado_em)}
                    </div>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
