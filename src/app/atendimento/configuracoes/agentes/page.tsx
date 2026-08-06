import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type { AtendimentoTeam } from "@/lib/types";
import { AgentsManager } from "./AgentsManager";

export const dynamic = "force-dynamic";

export default async function AgentesPage() {
  const { profile } = await requireAtendimentoUser();
  const admin = createSupabaseAdmin();

  // Tudo pelo client admin: esta tela é de gestão e precisa enxergar a
  // lista inteira de perfis, as equipes e a composição delas — coisas que
  // a RLS esconde de quem não é diretoria. A tela só abre com
  // `is_admin_central` para EDITAR (canManage), e a rota de escrita
  // refaz a checagem no servidor.
  const [{ data: agentes }, { data: teams }, { data: membros }] = await Promise.all([
    admin
      .from("profiles")
      .select("id, nome, email, sector, cargo, is_admin_central, atendimento_access, atendimento_papel")
      .eq("ativo", true)
      .order("nome"),
    admin.from("atendimento_teams").select("*").order("nome"),
    admin.from("atendimento_team_members").select("team_id, profile_id"),
  ]);

  return (
    <div className="p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="font-display text-xl text-arini dark:text-gold">Agentes</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Quem acessa o Atendimento, com que cargo, que papel e em quais filas.
        </p>
      </div>
      <AgentsManager
        initial={(agentes ?? []) as never[]}
        canManage={!!profile.is_admin_central}
        teams={(teams ?? []) as AtendimentoTeam[]}
        initialMembers={(membros ?? []) as { team_id: string; profile_id: string }[]}
      />
    </div>
  );
}
