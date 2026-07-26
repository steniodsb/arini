import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import type { CannedResponse } from "@/lib/types";
import { CannedManager } from "./CannedManager";

export const dynamic = "force-dynamic";

export default async function RespostasPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("canned_responses").select("*").order("titulo");

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6 overflow-y-auto h-full">
      <div>
        <h1 className="font-display text-2xl text-arini dark:text-gold">Respostas rápidas</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Mensagens prontas que os atendentes inserem na conversa com um clique.
        </p>
      </div>
      <CannedManager initial={(data ?? []) as CannedResponse[]} />
    </div>
  );
}
