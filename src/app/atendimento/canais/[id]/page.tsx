import Link from "next/link";
import { notFound } from "next/navigation";
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
import { ChannelConnection } from "./ChannelConnection";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

const STATUS_VARIANT: Record<ChannelStatus, "success" | "warning" | "danger" | "muted"> = {
  conectado: "success",
  aguardando_qr: "warning",
  conectando: "warning",
  erro: "danger",
  desconectado: "muted",
};

export default async function CanalPage({ params }: { params: { id: string } }) {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const { data } = await supabase
    .from("atendimento_channels_safe")
    .select("*")
    .eq("id", params.id)
    .maybeSingle();
  if (!data) notFound();
  const canal = data as AtendimentoChannelSafe;

  const base =
    process.env.NEXT_PUBLIC_SITE_URL || "https://atendimento.arininegociosimobiliarios.com.br";
  const webhookUrl =
    canal.provedor === "evolution"
      ? `${base}/api/webhooks/evolution`
      : `${base}/api/webhooks/whatsapp`;

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <Link
          href="/atendimento/canais"
          className="text-sm text-muted-foreground hover:text-arini inline-flex items-center gap-1"
        >
          <ArrowLeft size={14} /> Canais
        </Link>

        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h1 className="font-display text-2xl text-arini truncate">{canal.nome}</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {CHANNEL_PROVIDER_LABELS[canal.provedor]}
              {canal.telefone ? ` · ${canal.telefone}` : ""}
            </p>
          </div>
          <Badge variant={STATUS_VARIANT[canal.status]}>
            {CHANNEL_STATUS_LABELS[canal.status]}
          </Badge>
        </div>

        {canal.ultimo_erro && (
          <div className="text-sm text-red-800 bg-red-50 border border-red-200 rounded-md px-3 py-2 flex gap-2">
            <AlertTriangle size={14} className="shrink-0 mt-0.5" />
            <span className="break-words">{canal.ultimo_erro}</span>
          </div>
        )}

        <ChannelConnection canal={canal} webhookUrl={webhookUrl} />

        <div className="rounded-lg border p-4 text-sm space-y-2">
          <h2 className="font-medium text-arini">Detalhes</h2>
          <dl className="grid grid-cols-[auto,1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-muted-foreground">Criado em</dt>
            <dd>{formatDateTimeBR(canal.created_at)}</dd>
            {canal.conectado_em && (
              <>
                <dt className="text-muted-foreground">Conectado em</dt>
                <dd>{formatDateTimeBR(canal.conectado_em)}</dd>
              </>
            )}
            {canal.instance_name && (
              <>
                <dt className="text-muted-foreground">Instância</dt>
                <dd className="font-mono">{canal.instance_name}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Webhook</dt>
            <dd className="font-mono break-all">{webhookUrl}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}
