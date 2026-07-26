import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { CampaignsManager } from "./CampaignsManager";
import type { Campanha, CampanhaAlvoResumo, CaixaOpcao } from "./tipos";

export const dynamic = "force-dynamic";

export default async function CampanhasPage() {
  const { profile } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const [campanhasRes, caixasRes, alvosRes] = await Promise.all([
    supabase.from("atendimento_campaigns").select("*").order("created_at", { ascending: false }),
    supabase.from("atendimento_inboxes").select("id, nome, canal").order("nome"),
    // Só o par (campanha, status): usamos para contar o público sem
    // trazer milhares de linhas de alvo para a tela.
    supabase.from("atendimento_campaign_targets").select("campaign_id, status"),
  ]);

  return (
    <CampaignsManager
      initialCampanhas={(campanhasRes.data ?? []) as Campanha[]}
      caixas={(caixasRes.data ?? []) as CaixaOpcao[]}
      alvos={(alvosRes.data ?? []) as CampanhaAlvoResumo[]}
      usuarioId={profile.id}
    />
  );
}
