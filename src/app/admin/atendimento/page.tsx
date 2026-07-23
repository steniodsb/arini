import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { Conversation } from "@/lib/types";
import { AtendimentoInbox } from "./AtendimentoInbox";

// A caixa é sempre dinâmica (conversas chegam a todo momento).
export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  await requireSector([
    "recepcao", "marketing", "administrativo", "financeiro", "juridico", "aluguel", "admin_central",
  ]);
  const supabase = createSupabaseServer();

  // RLS já filtra: recepção/diretoria veem tudo; demais setores só o que é seu.
  const { data: conversations } = await supabase
    .from("conversations")
    .select("*")
    .order("last_message_at", { ascending: false })
    .limit(200);

  return (
    <div className="h-[calc(100vh-8rem)] -m-8">
      <AtendimentoInbox
        initialConversations={(conversations ?? []) as Conversation[]}
      />
    </div>
  );
}
