import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { AgentOption } from "@/lib/types";
import { PageShell, PageHeader } from "@/components/atendimento/ui";
import { CsatPanel } from "./CsatPanel";

export const dynamic = "force-dynamic";

export default async function CsatPage() {
  await requireAtendimentoUser();
  // Só a lista de agentes vem do servidor; as respostas são buscadas no cliente
  // porque o período é filtrado por botões, sem recarregar a página.
  const admin = createSupabaseAdmin();
  const { data: agents } = await admin
    .from("profiles")
    .select("id, nome")
    .or("atendimento_access.eq.true,is_admin_central.eq.true")
    .order("nome");

  return (
    <PageShell>
      <PageHeader
        titulo="Satisfação (CSAT)"
        descricao="Resultado das pesquisas enviadas ao cliente quando a conversa é resolvida."
      />
      <CsatPanel agents={(agents ?? []) as AgentOption[]} />
    </PageShell>
  );
}
