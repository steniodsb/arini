import { Suspense } from "react";
import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import type {
  Conversation, CannedResponse, AgentOption, AtendimentoTeam,
  AtendimentoLabel, AtendimentoMacro,
} from "@/lib/types";
import { AtendimentoInbox } from "./AtendimentoInbox";
import { papelDoPerfil } from "@/lib/atendimento/papel";

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
    // o seletor de responsável (id, nome e cargo dos atendentes/diretoria).
    // O cargo entra aqui e não numa consulta à parte porque é ele que
    // desempata nome repetido na hora de atribuir ou assumir um lead.
    admin
      .from("profiles")
      .select("id, nome, cargo")
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

  // Provedor de cada canal, para o composer saber avisar quando o áudio
  // gravado (WebM) puder ser recusado — a Cloud API da Meta não aceita
  // WebM, a Evolution converte. Sem isso o aviso teria que ser genérico.
  // Vai pela view saneada: `atendimento_channels` guarda token e a RLS
  // restringe a leitura à diretoria.
  const { data: canais } = await supabase
    .from("atendimento_channels_safe")
    .select("id, nome, canal, provedor, telefone")
    .order("nome");
  const provedorPorCanal: Record<string, string> = {};
  // Nome de cada conexão: com mais de um número, o atendente precisa
  // saber por QUAL deles a conversa entrou antes de responder.
  const canaisPorId: Record<string, { nome: string; canal: string; telefone: string | null }> = {};
  for (const c of canais ?? []) {
    provedorPorCanal[c.id as string] = c.provedor as string;
    canaisPorId[c.id as string] = {
      nome: (c.nome as string) ?? "Canal",
      canal: (c.canal as string) ?? "",
      telefone: (c.telefone as string) ?? null,
    };
  }

  // ------------------------------------------------------------------
  // Papel e filas (migration 0040)
  //
  // O painel de triagem precisa saber quem está em CADA fila para
  // oferecer o atendente certo — sem isso o select viria vazio e a
  // recepcionista concluiria, com razão, que "o sistema está quebrado".
  // Vai pelo client ADMIN por consistência com a lista de `agents` acima
  // (montada assim porque a RLS de `profiles` esconde os perfis dos
  // não-admins): os dois lados do par precisam vir da mesma fonte, senão
  // sobra id de membro sem nome correspondente. A tabela em si é legível
  // por qualquer agente (policy de 0030) e guarda só a ligação
  // equipe ↔ perfil — nada sensível.
  // ------------------------------------------------------------------
  const papel = papelDoPerfil(profile);
  const { data: membros } = await admin
    .from("atendimento_team_members")
    .select("team_id, profile_id");

  const membrosPorEquipe: Record<string, string[]> = {};
  const minhasEquipes: string[] = [];
  for (const m of membros ?? []) {
    const teamId = m.team_id as string;
    const profileId = m.profile_id as string;
    (membrosPorEquipe[teamId] ??= []).push(profileId);
    if (profileId === profile.id) minhasEquipes.push(teamId);
  }

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
          provedorPorCanal={provedorPorCanal}
          canaisPorId={canaisPorId}
          papel={papel}
          membrosPorEquipe={membrosPorEquipe}
          minhasEquipes={minhasEquipes}
          currentUser={{
            id: profile.id,
            nome: profile.nome,
            cargo: profile.cargo ?? null,
            assinatura: profile.assinatura ?? null,
          }}
        />
      </Suspense>
    </div>
  );
}
