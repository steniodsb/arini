import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { ApiToken } from "@/lib/types";
import { PageShell, PageHeader, Alerta } from "@/components/atendimento/ui";
import { TokensManager } from "./TokensManager";

export const dynamic = "force-dynamic";

export default async function TokensPage() {
  const { profile } = await requireAtendimentoUser();

  // Mesma lógica dos webhooks: a tabela é diretoria-only no RLS, então em vez
  // de renderizar uma lista vazia e confusa, dizemos o motivo.
  if (!profile.is_admin_central) {
    return (
      <PageShell>
        <PageHeader titulo="Tokens de API" descricao="Chaves para integrar sistemas externos ao atendimento." />
        <Alerta tipo="atencao">
          Só a diretoria pode ver e emitir tokens de API.
        </Alerta>
      </PageShell>
    );
  }

  const supabase = createSupabaseServer();
  // Nunca selecionamos `token_hash`: não serve para nada na tela e não tem
  // por que trafegar até o navegador.
  const { data } = await supabase
    .from("atendimento_api_tokens")
    .select("id, nome, prefixo, escopos, ultimo_uso_em, expira_em, revogado, criado_por, created_at")
    .order("created_at", { ascending: false });

  return (
    <PageShell>
      <TokensManager initial={(data ?? []) as ApiToken[]} />
    </PageShell>
  );
}
