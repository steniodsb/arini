import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type { AtendimentoInbox, AgentOption } from "@/lib/types";
import { PageShell } from "@/components/atendimento/ui";
import { InboxesManager } from "./InboxesManager";

export const dynamic = "force-dynamic";

export default async function CaixasPage() {
  await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // profiles fica atrás de RLS mais restrita — o admin garante a lista completa
  // de agentes elegíveis (mesmo padrão da tela de Equipes).
  const admin = createSupabaseAdmin();

  const [{ data: inboxes }, { data: members }, { data: agents }] = await Promise.all([
    supabase.from("atendimento_inboxes").select("*").order("nome"),
    supabase.from("atendimento_inbox_members").select("inbox_id, profile_id"),
    admin
      .from("profiles")
      .select("id, nome")
      .or("atendimento_access.eq.true,is_admin_central.eq.true")
      .eq("ativo", true)
      .order("nome"),
  ]);

  return (
    <PageShell>
      <InboxesManager
        initialInboxes={(inboxes ?? []) as AtendimentoInbox[]}
        initialMembers={(members ?? []) as { inbox_id: string; profile_id: string }[]}
        agents={(agents ?? []) as AgentOption[]}
      />
    </PageShell>
  );
}
