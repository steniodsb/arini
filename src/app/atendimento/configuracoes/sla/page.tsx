import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { SlaPolicy } from "@/lib/types";
import { PageShell } from "@/components/atendimento/ui";
import { SlaManager } from "./SlaManager";

export const dynamic = "force-dynamic";

export default async function SlaPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("atendimento_sla_policies").select("*").order("nome");

  return (
    <PageShell>
      <SlaManager initial={(data ?? []) as SlaPolicy[]} />
    </PageShell>
  );
}
