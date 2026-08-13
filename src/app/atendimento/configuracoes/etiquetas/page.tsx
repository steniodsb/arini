import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AtendimentoLabel } from "@/lib/types";
import { PageShell } from "@/components/atendimento/ui";
import { LabelsManager } from "./LabelsManager";

export const dynamic = "force-dynamic";

export default async function EtiquetasPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const [{ data }, { data: convs }] = await Promise.all([
    supabase.from("atendimento_labels").select("*").order("nome"),
    // Uso real de cada etiqueta. Sem isso, excluir uma etiqueta é decidir
    // no escuro — e a etiqueta continua gravada em `conversations.tags`
    // depois de sumir do catálogo, virando um chip cinza sem explicação.
    supabase.from("conversations").select("tags").not("tags", "is", null),
  ]);

  const usoPorEtiqueta: Record<string, number> = {};
  for (const c of (convs ?? []) as { tags: string[] | null }[]) {
    for (const t of c.tags ?? []) usoPorEtiqueta[t] = (usoPorEtiqueta[t] ?? 0) + 1;
  }

  return (
    <PageShell>
      <LabelsManager
        initial={(data ?? []) as AtendimentoLabel[]}
        usoPorEtiqueta={usoPorEtiqueta}
      />
    </PageShell>
  );
}
