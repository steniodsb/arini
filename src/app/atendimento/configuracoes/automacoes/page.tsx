import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AtendimentoAutomation,
  AtendimentoTeam,
  AtendimentoLabel,
  AgentOption,
} from "@/lib/types";
import { AutomationsManager } from "./AutomationsManager";

export const dynamic = "force-dynamic";

export default async function AutomacoesPage() {
  const { user } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // profiles tem RLS por setor do CRM; o service role garante a lista completa.
  const admin = createSupabaseAdmin();

  const [
    { data: regras }, { data: equipes }, { data: etiquetas }, { data: agentes },
    { data: conexoes },
  ] =
    await Promise.all([
      supabase.from("atendimento_automations").select("*").order("created_at", { ascending: false }),
      supabase.from("atendimento_teams").select("*").order("nome"),
      supabase.from("atendimento_labels").select("*").order("nome"),
      admin
        .from("profiles")
        .select("id, nome")
        .or("atendimento_access.eq.true,is_admin_central.eq.true")
        .eq("ativo", true)
        .order("nome"),
      // Conexões cadastradas: com mais de um WhatsApp, a regra precisa
      // poder distinguir POR QUAL número a mensagem entrou. Vai pela view
      // saneada — `atendimento_channels` guarda token.
      supabase.from("atendimento_channels_safe").select("id, nome, telefone").order("nome"),
    ]);

  return (
    <AutomationsManager
      usuarioId={user.id}
      initialRegras={(regras ?? []) as AtendimentoAutomation[]}
      equipes={(equipes ?? []) as AtendimentoTeam[]}
      etiquetas={(etiquetas ?? []) as AtendimentoLabel[]}
      agentes={(agentes ?? []) as AgentOption[]}
      conexoes={(conexoes ?? []) as { id: string; nome: string; telefone: string | null }[]}
    />
  );
}
