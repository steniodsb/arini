import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AtendimentoLabel } from "@/lib/types";
import { LabelsManager } from "./LabelsManager";

export const dynamic = "force-dynamic";

export default async function EtiquetasPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("atendimento_labels").select("*").order("nome");
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="font-display text-xl text-arini">Etiquetas</h1>
        <p className="text-sm text-muted-foreground mt-1">Catálogo de etiquetas para classificar conversas.</p>
      </div>
      <LabelsManager initial={(data ?? []) as AtendimentoLabel[]} />
    </div>
  );
}
