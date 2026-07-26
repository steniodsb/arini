import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer, createSupabaseAdmin } from "@/lib/supabase/server";
import {
  construirConsulta,
  TABELA_SEGMENTO,
  type SegmentTipo,
} from "@/lib/atendimento/segments";
import type {
  AtendimentoSegment,
  AtendimentoTeam,
  AtendimentoLabel,
  AtendimentoInbox,
  AtendimentoCompany,
  AgentOption,
} from "@/lib/types";
import { SegmentsManager } from "./SegmentsManager";

export const dynamic = "force-dynamic";

export default async function SegmentosPage() {
  const { user } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();
  // profiles tem RLS por setor do CRM; o service role garante a lista completa.
  const admin = createSupabaseAdmin();

  const [
    { data: segmentos },
    { data: equipes },
    { data: etiquetas },
    { data: caixas },
    { data: empresas },
    { data: agentes },
  ] = await Promise.all([
    supabase.from("atendimento_segments").select("*").order("created_at", { ascending: false }),
    supabase.from("atendimento_teams").select("*").order("nome"),
    supabase.from("atendimento_labels").select("*").order("nome"),
    supabase.from("atendimento_inboxes").select("*").order("nome"),
    supabase.from("atendimento_companies").select("*").order("nome"),
    admin
      .from("profiles")
      .select("id, nome")
      .or("atendimento_access.eq.true,is_admin_central.eq.true")
      .eq("ativo", true)
      .order("nome"),
  ]);

  const todos = (segmentos ?? []) as AtendimentoSegment[];
  // Segmento pessoal é do dono e de mais ninguém. A RLS da tabela libera
  // leitura para todo o atendimento, então o recorte é feito aqui.
  const visiveis = todos.filter(
    (s) => s.visibilidade === "global" || s.criado_por === user.id,
  );

  // "Resultados" precisa ser o número de HOJE, não um contador guardado —
  // por isso a contagem roda de verdade a cada carregamento da página.
  // head:true não traz linha nenhuma: só o total no cabeçalho da resposta.
  const contagens = await Promise.all(
    visiveis.map(async (s) => {
      const tipo = (s.tipo ?? "conversa") as SegmentTipo;
      const { count, error } = await construirConsulta(
        supabase.from(TABELA_SEGMENTO[tipo]).select("id", { count: "exact", head: true }),
        s.filtros ?? [],
        tipo,
      );
      return [s.id, error ? null : count ?? 0] as const;
    }),
  );

  const autores = new Map(
    ((agentes ?? []) as AgentOption[]).map((a) => [a.id, a.nome]),
  );

  return (
    <SegmentsManager
      usuarioId={user.id}
      initialSegmentos={visiveis}
      contagensIniciais={Object.fromEntries(contagens)}
      autores={Object.fromEntries(autores)}
      equipes={(equipes ?? []) as AtendimentoTeam[]}
      etiquetas={(etiquetas ?? []) as AtendimentoLabel[]}
      caixas={(caixas ?? []) as AtendimentoInbox[]}
      empresas={(empresas ?? []) as AtendimentoCompany[]}
      agentes={(agentes ?? []) as AgentOption[]}
    />
  );
}
