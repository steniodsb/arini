import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import { papelDoPerfil } from "@/lib/atendimento/papel";
import { Alerta } from "@/components/atendimento/ui";
import type { AtendimentoTeam, AgentOption } from "@/lib/types";
import { MenuManager, type MenuRow, type OpcaoRow } from "./MenuManager";

export const dynamic = "force-dynamic";

export default async function MenuRamaisPage() {
  const { profile } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // `profiles` tem RLS por setor do CRM; o service role garante a lista toda.
  const admin = createSupabaseAdmin();

  // A caixa de WhatsApp com conexão é a dona do menu. Mesma regra do
  // resolvedor em `lib/atendimento/caixa.ts`.
  const { data: caixa } = await supabase
    .from("atendimento_inboxes")
    .select("id, nome, saudacao_texto")
    .eq("canal", "whatsapp")
    .eq("ativo", true)
    .not("channel_id", "is", null)
    .maybeSingle();

  if (!caixa) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Alerta tipo="atencao">
          Nenhuma caixa de WhatsApp conectada. Conecte o número em Atendimento › Canais — o
          menu de ramais pertence à caixa que recebe as mensagens.
        </Alerta>
      </div>
    );
  }

  const { data: menu } = await supabase
    .from("atendimento_menus")
    .select("*")
    .eq("inbox_id", caixa.id)
    .maybeSingle();

  if (!menu) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <Alerta tipo="atencao">
          Esta caixa ainda não tem menu. Rode <code>node scripts/seed-menu-ramais.js</code> para
          criá-lo com o conteúdo do fluxograma.
        </Alerta>
      </div>
    );
  }

  const [{ data: opcoes }, { data: equipes }, { data: agentes }] = await Promise.all([
    supabase.from("atendimento_menu_opcoes").select("*").eq("menu_id", menu.id).order("ordem"),
    supabase.from("atendimento_teams").select("*").order("nome"),
    admin
      .from("profiles")
      .select("id, nome")
      .or("atendimento_access.eq.true,is_admin_central.eq.true")
      .eq("ativo", true)
      .order("nome"),
  ]);

  // QUANTA GENTE TEM EM CADA FILA — o mapa inteiro, não só a lista das
  // vazias de agora.
  //
  // Vai completo porque a tela deixa TROCAR o destino de um ramal: se o
  // aviso viesse pronto do servidor, escolher outra fila no <select>
  // mostraria o alerta errado até recarregar a página.
  //
  // É o aviso mais útil daqui: com a fila vazia, o cliente escolhe o
  // ramal, recebe "um profissional dará continuidade" e a conversa fica
  // parada sem dono.
  const { data: membros } = await admin.from("atendimento_team_members").select("team_id");
  const membrosPorFila: Record<string, number> = {};
  for (const t of equipes ?? []) membrosPorFila[t.id as string] = 0;
  for (const m of membros ?? []) {
    const id = m.team_id as string;
    membrosPorFila[id] = (membrosPorFila[id] ?? 0) + 1;
  }

  return (
    <MenuManager
      menu={menu as MenuRow}
      opcoes={((opcoes ?? []) as OpcaoRow[]).map((o) => ({ ...o, ativo: o.ativo !== false }))}
      equipes={(equipes ?? []) as AtendimentoTeam[]}
      agentes={(agentes ?? []) as AgentOption[]}
      saudacaoDaCaixa={(caixa.saudacao_texto as string | null) ?? null}
      nomeDaCaixa={caixa.nome as string}
      membrosPorFila={membrosPorFila}
      podeEditar={papelDoPerfil(profile) === "administrador"}
    />
  );
}
