import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { AgentesIA } from "./AgentesIA";

export const dynamic = "force-dynamic";

export default async function IaPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  // Números reais da base de conhecimento: é ela que vai alimentar a IA,
  // então mostrar o tamanho real evita vender uma feature sem conteúdo.
  const [publicadosRes, totalRes, caixasRes] = await Promise.all([
    supabase.from("atendimento_articles").select("id", { count: "exact", head: true }).eq("status", "publicado"),
    supabase.from("atendimento_articles").select("id", { count: "exact", head: true }),
    supabase.from("atendimento_inboxes").select("id", { count: "exact", head: true }).eq("ativo", true),
  ]);

  return (
    <AgentesIA
      artigosPublicados={publicadosRes.count ?? 0}
      artigosTotal={totalRes.count ?? 0}
      caixasAtivas={caixasRes.count ?? 0}
    />
  );
}
