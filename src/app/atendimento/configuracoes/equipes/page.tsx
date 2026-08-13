import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { AtendimentoTeam, AgentOption } from "@/lib/types";
import { PageShell } from "@/components/atendimento/ui";
import { TeamsManager } from "./TeamsManager";

export const dynamic = "force-dynamic";

export default async function EquipesPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const admin = createSupabaseAdmin();

  const [{ data: teams }, { data: members }, { data: agents }, { data: convs }] =
    await Promise.all([
      supabase.from("atendimento_teams").select("*").order("nome"),
      supabase.from("atendimento_team_members").select("team_id, profile_id"),
      // Com o cargo junto: montar uma fila escolhendo entre três "Ana" sem
      // saber qual é a corretora e qual é a estagiária é como o time acaba
      // com o lead na mão da pessoa errada.
      admin
        .from("profiles")
        .select("id, nome, cargo")
        .or("atendimento_access.eq.true,is_admin_central.eq.true")
        .eq("ativo", true)
        .order("nome"),
      // Quantas conversas dependem de cada fila. É o que transforma
      // "excluir" de um clique inocente em uma decisão informada — e o
      // banco recusaria a exclusão de qualquer jeito (FK sem ON DELETE).
      supabase.from("conversations").select("team_id, status").not("team_id", "is", null),
    ]);

  const conversasPorFila: Record<string, { total: number; abertas: number }> = {};
  for (const c of (convs ?? []) as { team_id: string; status: string }[]) {
    const alvo = (conversasPorFila[c.team_id] ??= { total: 0, abertas: 0 });
    alvo.total += 1;
    if (c.status === "aberta" || c.status === "pendente") alvo.abertas += 1;
  }

  return (
    <PageShell>
      <TeamsManager
        initialTeams={(teams ?? []) as AtendimentoTeam[]}
        agents={(agents ?? []) as AgentOption[]}
        initialMembers={(members ?? []) as { team_id: string; profile_id: string }[]}
        conversasPorFila={conversasPorFila}
      />
    </PageShell>
  );
}
