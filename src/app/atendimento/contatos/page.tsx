import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { ContatosList, type Contato } from "./ContatosList";

export const dynamic = "force-dynamic";

export default async function ContatosPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // RLS leads_read_atendimento libera a leitura ao atendente.
  const { data } = await supabase
    .from("leads")
    .select("id, nome, telefone, whatsapp, email, origem, stage, created_at")
    .order("created_at", { ascending: false })
    .limit(1000);
  return <ContatosList initial={(data ?? []) as Contato[]} />;
}
