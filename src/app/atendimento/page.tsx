import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types";
import { AtendimentoInbox } from "./AtendimentoInbox";

// A caixa é sempre dinâmica (conversas chegam a todo momento).
export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  // Acesso é pela flag atendimento_access — não pelo setor do CRM.
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(200);

  return (
    <div className="h-full">
      <AtendimentoInbox initialConversations={(conversations ?? []) as Conversation[]} />
    </div>
  );
}
