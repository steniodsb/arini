import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AgentBot, AtendimentoInbox } from "@/lib/types";
import { PageShell, PageHeader, Alerta } from "@/components/atendimento/ui";
import { BotsManager } from "./BotsManager";

export const dynamic = "force-dynamic";

export default async function BotsPage() {
  const { profile } = await requireAtendimentoUser();

  // `atendimento_agent_bots` carrega o segredo de assinatura → a tabela é
  // restrita à diretoria no RLS. Em vez de mostrar uma lista
  // misteriosamente vazia para um agente comum, explicamos o porquê.
  if (!profile.is_admin_central) {
    return (
      <PageShell>
        <PageHeader
          titulo="Agent Bots"
          descricao="Plugar um bot externo como atendente de uma caixa de entrada."
        />
        <Alerta tipo="atencao">
          Só a diretoria pode ver e configurar bots — eles guardam a chave usada para assinar as
          chamadas e o token que dá acesso de escrita às conversas.
        </Alerta>
      </PageShell>
    );
  }

  const supabase = createSupabaseServer();

  const [{ data: bots }, { data: vinculos }, { data: caixas }] = await Promise.all([
    supabase.from("atendimento_agent_bots").select("*").order("created_at", { ascending: false }),
    supabase.from("atendimento_inbox_bots").select("inbox_id, bot_id"),
    supabase
      .from("atendimento_inboxes")
      .select("*")
      .eq("ativo", true)
      .order("nome", { ascending: true }),
  ]);

  return (
    <PageShell>
      <BotsManager
        initial={(bots ?? []) as AgentBot[]}
        initialVinculos={(vinculos ?? []) as { inbox_id: string; bot_id: string }[]}
        caixas={(caixas ?? []) as AtendimentoInbox[]}
      />
    </PageShell>
  );
}
