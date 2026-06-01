import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { SectorObservation } from "@/lib/types";
import { CommunicationBox } from "./CommunicationBox";

export default async function ComunicacaoPage() {
  const { user, profile } = await requireUser();
  const supabase = createSupabaseServer();

  // Recebidas pelo meu setor + enviadas por mim (delegações/comunicação).
  const [{ data: recebidas }, { data: enviadas }] = await Promise.all([
    supabase
      .from("sector_observations")
      .select("*")
      .eq("target_sector", profile?.sector ?? "recepcao")
      .order("created_at", { ascending: false })
      .limit(100),
    supabase
      .from("sector_observations")
      .select("*")
      .eq("autor_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl text-arini">Comunicação entre setores</h1>
        <p className="text-muted-foreground mt-1">Delegue tarefas e troque mensagens com outros setores.</p>
      </div>

      <CommunicationBox
        currentUserId={user.id}
        currentSector={profile?.sector ?? "recepcao"}
        recebidas={(recebidas ?? []) as SectorObservation[]}
        enviadas={(enviadas ?? []) as SectorObservation[]}
      />
    </div>
  );
}
