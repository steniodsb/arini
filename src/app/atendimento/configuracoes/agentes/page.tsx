import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { AgentsManager } from "./AgentsManager";

export const dynamic = "force-dynamic";

export default async function AgentesPage() {
  const { profile } = await requireAtendimentoUser();
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("profiles")
    .select("id, nome, email, sector, is_admin_central, atendimento_access")
    .eq("ativo", true)
    .order("nome");

  return (
    <div className="p-6 max-w-2xl space-y-4">
      <div>
        <h1 className="font-display text-xl text-arini">Agentes</h1>
        <p className="text-sm text-muted-foreground mt-1">Quem pode acessar o sistema de Atendimento.</p>
      </div>
      <AgentsManager initial={(data ?? []) as never[]} canManage={!!profile.is_admin_central} />
    </div>
  );
}
