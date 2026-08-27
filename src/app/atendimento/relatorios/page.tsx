import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import { PageShell } from "@/components/atendimento/ui";
import {
  RelatoriosPanel,
  type RelCaixa,
  type RelConversa,
  type RelCsat,
  type RelEtiqueta,
  type RelEquipe,
  type RelMembro,
  type RelMensagem,
  type RelPessoa,
  type RelPoliticaSla,
} from "./RelatoriosPanel";
import type { RelBot, RelEntregaBot, RelMensagemBot } from "./BotsPanel";

export const dynamic = "force-dynamic";

// Carregamos 90 dias de dados BRUTOS uma única vez e deixamos o recorte por
// período acontecer no cliente. Assim trocar de "7 dias" para "30 dias" é
// instantâneo, sem ida ao banco — e 90 dias de atendimento cabe na memória.
const JANELA_DIAS = 90;

export default async function RelatoriosPage() {
  await requireAtendimentoUser();
  // Relatórios são visão gerencial: o admin garante que a RLS por agente não
  // esconda conversas de outras pessoas do número agregado.
  const admin = createSupabaseAdmin();

  const desde = new Date(Date.now() - JANELA_DIAS * 86_400_000).toISOString();

  const [
    { data: conversas },
    { data: mensagens },
    { data: csat },
    { data: pessoas },
    { data: equipes },
    { data: membros },
    { data: etiquetas },
    { data: caixas },
    { data: politicasSla },
    { data: bots },
    { data: mensagensBot },
    { data: entregasBot },
  ] = await Promise.all([
    admin
      .from("conversations")
      .select(
        // As colunas de SLA (política + os dois prazos) vêm junto porque a aba
        // de SLA recalcula a violação no cliente: o flag `sla_violado` é
        // carimbado por cron e só pega quem AINDA estava vencido na hora em
        // que o job rodou — quem respondeu atrasado escapa dele.
        // As colunas de bot (0037) alimentam a aba "Bots": `bot_status` é o
        // estado terminal do handoff (uma vez 'transferida', fica), então ele
        // serve de histórico sem precisar de tabela de eventos.
        "id, canal, status, prioridade, responsavel_id, team_id, tags, inbox_id, created_at, resolvida_em, resolvida_por, primeira_resposta_em, sla_violado, sla_policy_id, sla_first_response_due, sla_resolution_due, bot_status, bot_id, bot_transferida_em",
      )
      .gte("created_at", desde)
      .order("created_at", { ascending: true })
      .limit(20_000),
    // Só mensagens de saída e não internas: é isso que conta como "resposta ao
    // cliente" no painel de produtividade dos agentes.
    admin
      .from("messages")
      .select("conversation_id, autor_id, created_at")
      .eq("direcao", "out")
      .eq("interna", false)
      .gte("created_at", desde)
      .limit(60_000),
    admin
      .from("atendimento_csat")
      .select("conversation_id, agente_id, nota, respondido_em")
      .not("nota", "is", null)
      .gte("enviado_em", desde)
      .limit(20_000),
    admin.from("profiles").select("id, nome").order("nome"),
    admin.from("atendimento_teams").select("id, nome").order("nome"),
    admin.from("atendimento_team_members").select("team_id, profile_id"),
    admin.from("atendimento_labels").select("id, nome, cor").order("nome"),
    admin.from("atendimento_inboxes").select("id, nome, canal").order("nome"),
    admin
      .from("atendimento_sla_policies")
      .select("id, nome, primeira_resposta_min, resolucao_min")
      .order("nome"),
    // Bots cadastrados. Só nome e estado: token, segredo e URL são dados
    // sensíveis que não têm nada que fazer num relatório.
    admin.from("atendimento_agent_bots").select("id, nome, ativo").order("nome"),
    // Mensagens ESCRITAS PELO BOT. Consulta separada da de produtividade
    // dos agentes de propósito: aquela filtra `interna=false` + `direcao=out`
    // para medir resposta humana ao cliente; aqui o recorte é o remetente.
    admin
      .from("messages")
      .select("conversation_id, bot_id, created_at")
      .eq("remetente", "bot")
      .gte("created_at", desde)
      .limit(60_000),
    // Log das chamadas HTTP feitas para a URL do bot — é o que revela um
    // bot fora do ar (status >= 400 ou `erro` preenchido).
    admin
      .from("atendimento_bot_deliveries")
      .select("id, bot_id, conversation_id, status, erro, duracao_ms, created_at")
      .gte("created_at", desde)
      .order("created_at", { ascending: false })
      .limit(20_000),
  ]);

  return (
    <PageShell className="max-w-none">
      <RelatoriosPanel
        conversas={(conversas ?? []) as RelConversa[]}
        mensagens={(mensagens ?? []) as RelMensagem[]}
        csat={(csat ?? []) as RelCsat[]}
        pessoas={(pessoas ?? []) as RelPessoa[]}
        equipes={(equipes ?? []) as RelEquipe[]}
        membros={(membros ?? []) as RelMembro[]}
        etiquetas={(etiquetas ?? []) as RelEtiqueta[]}
        caixas={(caixas ?? []) as RelCaixa[]}
        politicasSla={(politicasSla ?? []) as RelPoliticaSla[]}
        bots={(bots ?? []) as RelBot[]}
        mensagensBot={(mensagensBot ?? []) as RelMensagemBot[]}
        entregasBot={(entregasBot ?? []) as RelEntregaBot[]}
        janelaDias={JANELA_DIAS}
      />
    </PageShell>
  );
}
