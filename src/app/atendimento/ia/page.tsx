import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { iaConfigurada } from "@/lib/atendimento/ia";
import { AgentesIA, type CaixaIa, type LinhaUso, type ConversaRecente } from "./AgentesIA";

export const dynamic = "force-dynamic";

export default async function IaPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  // Números reais da base de conhecimento: é ela que alimenta as respostas,
  // então mostrar o tamanho real evita vender uma feature sem conteúdo.
  const [publicadosRes, totalRes, caixasRes, sugestoesRes, conversasRes] = await Promise.all([
    supabase
      .from("atendimento_articles")
      .select("id", { count: "exact", head: true })
      .eq("status", "publicado"),
    supabase.from("atendimento_articles").select("id", { count: "exact", head: true }),
    supabase
      .from("atendimento_inboxes")
      .select("id, nome, canal, ativo, ia_copiloto, ia_triagem, ia_auto_resposta, ia_modelo, ia_instrucoes")
      .order("nome", { ascending: true }),
    supabase
      .from("atendimento_ia_sugestoes")
      .select("id, conversation_id, tipo, modelo, usada, created_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase
      .from("conversations")
      .select("id, contato_nome, canal, last_message_at, ia_intencao")
      .order("last_message_at", { ascending: false })
      .limit(25),
  ]);

  const caixas = (caixasRes.data ?? []) as CaixaIa[];
  const conversas = (conversasRes.data ?? []) as ConversaRecente[];

  // Nome do contato para as linhas de uso — evita mostrar só um UUID cru.
  const nomePorConversa = new Map(conversas.map((c) => [c.id, c.contato_nome]));
  const uso: LinhaUso[] = ((sugestoesRes.data ?? []) as LinhaUso[]).map((l) => ({
    ...l,
    contato_nome: l.contato_nome ?? nomePorConversa.get(l.conversation_id) ?? null,
  }));

  return (
    <AgentesIA
      // Só um booleano: a chave NUNCA sai do servidor.
      chaveConfigurada={iaConfigurada()}
      artigosPublicados={publicadosRes.count ?? 0}
      artigosTotal={totalRes.count ?? 0}
      caixas={caixas}
      uso={uso}
      conversas={conversas}
    />
  );
}
