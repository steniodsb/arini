import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { SectorObservation } from "@/lib/types";
import { CommunicationBox, type PropertyRefMap } from "./CommunicationBox";

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

  // Resolve o imóvel de cada observação (as que nascem de um imóvel guardam o
  // property_id em entity_id — 'properties' na captação, 'marketing_campaigns'
  // no marketing). Sem isso, o setor que recebe a mensagem não sabe de qual
  // imóvel se trata.
  const todas = [
    ...((recebidas ?? []) as SectorObservation[]),
    ...((enviadas ?? []) as SectorObservation[]),
  ];
  const propertyIds = Array.from(
    new Set(
      todas
        .filter(
          (o) =>
            o.entity_table === "properties" ||
            o.entity_table === "marketing_campaigns",
        )
        .map((o) => o.entity_id),
    ),
  );

  const properties: PropertyRefMap = {};
  if (propertyIds.length > 0) {
    const { data: props } = await supabase
      .from("properties")
      .select("id, codigo, titulo")
      .in("id", propertyIds);
    for (const p of (props ?? []) as { id: string; codigo: string; titulo: string | null }[]) {
      properties[p.id] = { codigo: p.codigo, titulo: p.titulo };
    }
  }

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
        properties={properties}
      />
    </div>
  );
}
