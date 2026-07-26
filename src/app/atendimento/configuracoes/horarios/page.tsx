import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { AtendimentoInbox, BusinessHour } from "@/lib/types";
import { PageShell, PageHeader, EmptyState } from "@/components/atendimento/ui";
import { BusinessHoursManager } from "./BusinessHoursManager";

export const dynamic = "force-dynamic";

export default async function HorariosPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const [{ data: inboxes }, { data: horarios }] = await Promise.all([
    supabase.from("atendimento_inboxes").select("*").order("nome"),
    supabase.from("atendimento_business_hours").select("*").order("dia_semana"),
  ]);

  const caixas = (inboxes ?? []) as AtendimentoInbox[];

  return (
    <PageShell>
      <PageHeader
        titulo="Horário comercial"
        descricao="Define quando cada caixa de entrada está aberta e o que responder fora do expediente."
      />
      {caixas.length === 0 ? (
        <EmptyState
          titulo="Nenhuma caixa de entrada"
          descricao="O horário comercial é configurado por caixa. Crie uma caixa em Configurações → Caixas de entrada."
        />
      ) : (
        <BusinessHoursManager
          inboxes={caixas}
          initialHorarios={(horarios ?? []) as BusinessHour[]}
        />
      )}
    </PageShell>
  );
}
