import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AtendimentoWebhook } from "@/lib/types";
import { PageShell, PageHeader, Alerta } from "@/components/atendimento/ui";
import { WebhooksManager } from "./WebhooksManager";

export const dynamic = "force-dynamic";

export default async function WebhooksPage() {
  const { profile } = await requireAtendimentoUser();

  // Webhooks carregam o `secret` de assinatura → a tabela é restrita à
  // diretoria no RLS. Em vez de mostrar uma lista misteriosamente vazia
  // para um agente comum, explicamos por que ele não vê nada.
  if (!profile.is_admin_central) {
    return (
      <PageShell>
        <PageHeader
          titulo="Webhooks"
          descricao="Enviar eventos do atendimento para uma URL externa."
        />
        <Alerta tipo="atencao">
          Só a diretoria pode ver e configurar webhooks — eles guardam a chave usada para assinar
          as chamadas.
        </Alerta>
      </PageShell>
    );
  }

  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("atendimento_webhooks")
    .select("*")
    .order("created_at", { ascending: false });

  return (
    <PageShell>
      <WebhooksManager initial={(data ?? []) as AtendimentoWebhook[]} />
    </PageShell>
  );
}
