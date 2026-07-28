import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { BloqueadosList, type ContatoBloqueado } from "./BloqueadosList";

export const dynamic = "force-dynamic";

// Contatos bloqueados = `leads` com bloqueado = true. Leitura pelo client do
// usuário mesmo (a policy `leads_read_atendimento` já libera SELECT para quem
// tem acesso ao atendimento); só a ESCRITA precisa da rota de API com service
// role — por isso aqui não usamos o admin.
export default async function ContatosBloqueadosPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const { data, error } = await supabase
    .from("leads")
    .select("id, nome, telefone, whatsapp, email, created_at, ultima_interacao_em")
    .eq("bloqueado", true)
    .order("ultima_interacao_em", { ascending: false })
    .limit(500);

  // Erro de leitura não derruba a tela: a lista vazia com o aviso do
  // componente já é mais útil do que uma página de erro do Next.
  void error;

  return <BloqueadosList initial={(data ?? []) as ContatoBloqueado[]} />;
}
