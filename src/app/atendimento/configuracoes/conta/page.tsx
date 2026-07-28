import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { PageShell } from "@/components/atendimento/ui";
import { ContaManager } from "./ContaManager";
import type {
  AtendimentoSettings, AtendimentoRole, AtendimentoIntegration, DashboardApp,
} from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function ContaPage() {
  const { profile } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  // Integrações guardam token (RLS de diretoria) — para os demais a
  // consulta volta vazia, e a aba avisa em vez de mostrar lista vazia.
  const [{ data: settings }, { data: roles }, { data: integracoes }, { data: apps }] =
    await Promise.all([
      supabase.from("atendimento_settings").select("*").eq("id", true).maybeSingle(),
      supabase.from("atendimento_roles").select("*").order("sistema", { ascending: false }).order("nome"),
      supabase.from("atendimento_integrations").select("*").order("tipo"),
      supabase.from("atendimento_dashboard_apps").select("*").order("ordem"),
    ]);

  return (
    <PageShell>
      <ContaManager
        settings={(settings ?? null) as AtendimentoSettings | null}
        rolesIniciais={(roles ?? []) as AtendimentoRole[]}
        integracoesIniciais={(integracoes ?? []) as AtendimentoIntegration[]}
        appsIniciais={(apps ?? []) as DashboardApp[]}
        ehDiretoria={profile.is_admin_central}
      />
    </PageShell>
  );
}
