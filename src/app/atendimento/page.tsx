import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { Conversation, CannedResponse, AgentOption } from "@/lib/types";
import { AtendimentoInbox } from "./AtendimentoInbox";

// A caixa é sempre dinâmica (conversas chegam a todo momento).
export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  // Acesso é pela flag atendimento_access — não pelo setor do CRM.
  const { profile } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const admin = createSupabaseAdmin();

  const [{ data: conversations }, { data: canned }, { data: agents }] = await Promise.all([
    supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(200),
    supabase.from("canned_responses").select("*").order("titulo"),
    // A RLS de profiles esconde a lista dos não-admins → usa admin p/ montar
    // o seletor de responsável (só id + nome dos atendentes/diretoria).
    admin
      .from("profiles")
      .select("id, nome")
      .or("atendimento_access.eq.true,is_admin_central.eq.true")
      .eq("ativo", true)
      .order("nome"),
  ]);

  return (
    <div className="h-full">
      <AtendimentoInbox
        initialConversations={(conversations ?? []) as Conversation[]}
        cannedResponses={(canned ?? []) as CannedResponse[]}
        agents={(agents ?? []) as AgentOption[]}
        currentUserId={profile.id}
      />
    </div>
  );
}
