import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { CustomAttributeDef } from "@/lib/types";
import { PageShell } from "@/components/atendimento/ui";
import { CustomAttributesManager } from "./CustomAttributesManager";

export const dynamic = "force-dynamic";

export default async function AtributosPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const { data } = await supabase
    .from("atendimento_custom_attributes")
    .select("*")
    .order("nome");

  return (
    <PageShell>
      <CustomAttributesManager initial={(data ?? []) as CustomAttributeDef[]} />
    </PageShell>
  );
}
