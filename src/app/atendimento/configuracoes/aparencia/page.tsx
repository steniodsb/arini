import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PageShell } from "@/components/atendimento/ui";
import { AparenciaManager } from "./AparenciaManager";
import { paletaValida, PALETA_PADRAO } from "@/lib/atendimento/cores";

export const dynamic = "force-dynamic";

export default async function AparenciaPage() {
  const { profile } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const { data: settings } = await supabase
    .from("atendimento_settings")
    .select("cor_padrao")
    .eq("id", true)
    .maybeSingle();

  return (
    <PageShell>
      <AparenciaManager
        corInicial={paletaValida(settings?.cor_padrao) ?? PALETA_PADRAO}
        ehDiretoria={profile.is_admin_central}
      />
    </PageShell>
  );
}
