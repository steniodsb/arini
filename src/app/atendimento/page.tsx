import { Suspense } from "react";
import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type {
  Conversation, CannedResponse, AgentOption, AtendimentoTeam,
  AtendimentoLabel, AtendimentoMacro,
} from "@/lib/types";
import { AtendimentoInbox } from "./AtendimentoInbox";

// A caixa é sempre dinâmica (conversas chegam a todo momento).
export const dynamic = "force-dynamic";

export default async function AtendimentoPage() {
  // Acesso é pela flag atendimento_access — não pelo setor do CRM.
  const { profile } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  const admin = createSupabaseAdmin();

  // Conversas adiadas cujo prazo venceu voltam para "aberta" antes de
  // montar a lista — senão elas só reapareceriam no próximo evento.
  await admin.rpc("fn_despertar_conversas_adiadas").then(
    () => undefined,
    () => undefined, // função ainda não aplicada no banco: segue sem quebrar
  );

  const [
    { data: conversations },
    { data: canned },
    { data: agents },
    { data: teams },
    { data: labels },
    { data: macros },
  ] = await Promise.all([
    supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(300),
    supabase.from("canned_responses").select("*").order("titulo"),
    // A RLS de profiles esconde a lista dos não-admins → usa admin p/ montar
    // o seletor de responsável (só id + nome dos atendentes/diretoria).
    admin
      .from("profiles")
      .select("id, nome")
      .or("atendimento_access.eq.true,is_admin_central.eq.true")
      .eq("ativo", true)
      .order("nome"),
    supabase.from("atendimento_teams").select("*").order("nome"),
    supabase.from("atendimento_labels").select("*").order("nome"),
    // Macros pessoais só aparecem para quem criou.
    supabase
      .from("atendimento_macros")
      .select("*")
      .or(`visibilidade.eq.global,criado_por.eq.${profile.id}`)
      .order("nome"),
  ]);

  return (
    <div className="h-full min-h-0">
      {/* useSearchParams no cliente exige Suspense no App Router. */}
      <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Carregando a caixa…</div>}>
        <AtendimentoInbox
          initialConversations={(conversations ?? []) as Conversation[]}
          cannedResponses={(canned ?? []) as CannedResponse[]}
          agents={(agents ?? []) as AgentOption[]}
          teams={(teams ?? []) as AtendimentoTeam[]}
          labels={(labels ?? []) as AtendimentoLabel[]}
          macros={(macros ?? []) as AtendimentoMacro[]}
          currentUser={{
            id: profile.id,
            nome: profile.nome,
            assinatura: profile.assinatura ?? null,
          }}
        />
      </Suspense>
    </div>
  );
}
