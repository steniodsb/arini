import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PageShell, PageHeader } from "@/components/atendimento/ui";
import { CannedManager, type RespostaRapida } from "./CannedManager";

export const dynamic = "force-dynamic";

export default async function RespostasPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // Ordena por categoria e depois por título: o agrupamento da tela é feito no
  // cliente, mas chegar já ordenado deixa cada grupo pronto sem re-sort caro.
  const { data } = await supabase
    .from("canned_responses")
    .select("*")
    .order("categoria", { ascending: true, nullsFirst: false })
    .order("titulo");

  return (
    <PageShell>
      <PageHeader
        titulo="Respostas rápidas"
        descricao="Mensagens prontas que os atendentes inserem na conversa com um clique. Organize por categoria para achar rápido."
      />
      <CannedManager initial={(data ?? []) as RespostaRapida[]} />
    </PageShell>
  );
}
