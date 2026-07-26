import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { AtendimentoTeam, AgentOption } from "@/lib/types";
import { TeamsManager } from "./TeamsManager";

export const dynamic = "force-dynamic";

export default async function EquipesPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const admin = createSupabaseAdmin();

  const [{ data: teams }, { data: members }, { data: agents }] = await Promise.all([
    supabase.from("atendimento_teams").select("*").order("nome"),
    supabase.from("atendimento_team_members").select("team_id, profile_id"),
    admin.from("profiles").select("id, nome").or("atendimento_access.eq.true,is_admin_central.eq.true").eq("ativo", true).order("nome"),
  ]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="font-display text-xl text-arini">Equipes</h1>
        <p className="text-sm text-muted-foreground mt-1">Times de atendimento e seus membros.</p>
      </div>
      <TeamsManager
        initialTeams={(teams ?? []) as AtendimentoTeam[]}
        agents={(agents ?? []) as AgentOption[]}
        initialMembers={(members ?? []) as { team_id: string; profile_id: string }[]}
      />
    </div>
  );
}
