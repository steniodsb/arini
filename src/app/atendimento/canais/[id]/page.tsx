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

  // Cada provedor entrega em um caminho diferente. Antes tudo que não era
  // Evolution caía em /webhooks/whatsapp — o que passou a mentir quando
  // Telegram, e-mail, SMS e API genérica entraram.
  const CAMINHO_WEBHOOK: Record<AtendimentoChannelSafe["provedor"], string> = {
    evolution: "/api/webhooks/evolution",
    cloud_api: "/api/webhooks/whatsapp",
    cloud_api_coexistence: "/api/webhooks/whatsapp",
    telegram_bot: "/api/webhooks/telegram",
    email_smtp: "/api/webhooks/email",
    sms_generico: "/api/webhooks/sms",
    api_generica: "/api/webhooks/api",
    widget: "/api/widget",
  };
  const webhookUrl = `${base}${CAMINHO_WEBHOOK[canal.provedor]}`;

  // Canais HTTP não têm handshake: o que falta neles é o segredo, e a URL
  // de entrada só serve com ele embutido (?canal=…&secret=…). Mostrar o
  // painel de "conectar" aqui prometeria um passo que não existe.
  const ehHttp =
    canal.provedor === "email_smtp" ||
    canal.provedor === "sms_generico" ||
    canal.provedor === "api_generica";

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
            <h1 className="font-display text-2xl text-arini dark:text-gold truncate">{canal.nome}</h1>
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

        {ehHttp ? (
          <div className="rounded-lg border p-4 space-y-2">
            <h2 className="font-medium text-arini dark:text-gold">Falta o segredo do webhook</h2>
            <p className="text-sm text-muted-foreground">
              Este canal não tem passo de conexão — com a credencial salva, ele já envia. O que
              falta é a <strong>entrada</strong>: gerar o segredo e copiar a URL de webhook
              completa para cadastrar no provedor.
            </p>
            <Link
              href="/atendimento/configuracoes/api-canal"
              className="inline-flex items-center gap-1 text-sm text-arini dark:text-gold hover:underline"
            >
              Abrir Configurações › Canal por API →
            </Link>
            <p className="text-xs text-muted-foreground">
              Sem o segredo a URL responde 401 — de propósito: ela é pública, e sem prova qualquer
              um injetaria mensagem falsa no inbox.
            </p>
          </div>
        ) : (
          <ChannelConnection canal={canal} webhookUrl={webhookUrl} />
        )}

        <div className="rounded-lg border p-4 text-sm space-y-2">
          <h2 className="font-medium text-arini dark:text-gold">Detalhes</h2>
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
