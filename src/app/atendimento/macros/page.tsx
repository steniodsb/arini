import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AtendimentoMacro,
  AtendimentoTeam,
  AtendimentoLabel,
  AgentOption,
} from "@/lib/types";
import { MacrosManager } from "./MacrosManager";

export const dynamic = "force-dynamic";

export default async function MacrosPage() {
  const { user } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // Lista de agentes exige service role: profiles tem RLS por setor do CRM.
  const admin = createSupabaseAdmin();

  const [{ data: macros }, { data: equipes }, { data: etiquetas }, { data: agentes }] =
    await Promise.all([
      // Macro "pessoal" só aparece para quem criou; "global" é de todo mundo.
      supabase
        .from("atendimento_macros")
        .select("*")
        .or(`visibilidade.eq.global,criado_por.eq.${user.id}`)
        .order("nome"),
      supabase.from("atendimento_teams").select("*").order("nome"),
      supabase.from("atendimento_labels").select("*").order("nome"),
      admin
        .from("profiles")
        .select("id, nome")
        .or("atendimento_access.eq.true,is_admin_central.eq.true")
        .eq("ativo", true)
        .order("nome"),
    ]);

  return (
    <MacrosManager
      usuarioId={user.id}
      initialMacros={(macros ?? []) as AtendimentoMacro[]}
      equipes={(equipes ?? []) as AtendimentoTeam[]}
      etiquetas={(etiquetas ?? []) as AtendimentoLabel[]}
      agentes={(agentes ?? []) as AgentOption[]}
    />
  );
}
