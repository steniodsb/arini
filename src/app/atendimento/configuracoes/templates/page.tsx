import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PageShell } from "@/components/atendimento/ui";
import type { WhatsappTemplate } from "@/lib/types";
import { TemplatesManager, type CanalTemplate } from "./TemplatesManager";

export const dynamic = "force-dynamic";

/**
 * Templates de mensagem do WhatsApp.
 *
 * Este é o bloqueio real de campanha: fora da janela de 24 h desde a
 * última mensagem do cliente, a Meta só entrega template APROVADO. Sem
 * esta tela, campanha por API oficial simplesmente não sai.
 *
 * A view `atendimento_channels_safe` já existe para listar canal sem
 * credencial — é dela que vem o select, porque aqui o token não é
 * necessário (quem fala com a Meta são as rotas do servidor).
 */
export default async function TemplatesPage() {
  await requireAtendimentoUser();

  const supabase = createSupabaseServer();

  const [{ data: canais }, { data: templates }] = await Promise.all([
    supabase
      .from("atendimento_channels_safe")
      .select("id, nome, provedor, status")
      .order("created_at", { ascending: true }),
    supabase
      .from("atendimento_templates")
      .select("*")
      .order("created_at", { ascending: false }),
  ]);

  return (
    <PageShell>
      <TemplatesManager
        canais={(canais ?? []) as CanalTemplate[]}
        initial={(templates ?? []) as WhatsappTemplate[]}
      />
    </PageShell>
  );
}
