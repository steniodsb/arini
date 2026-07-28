import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseAdmin } from "@/lib/supabase/server";
import type {
  AoVivoAgente,
  AoVivoCanal,
  AoVivoEntrada,
  AoVivoEspera,
  AoVivoSnapshot,
} from "@/app/atendimento/relatorios/relatorios-utils";
import type { AgentAvailability, ConversationChannel } from "@/lib/types";

// =====================================================================
// GET /api/atendimento/relatorios/ao-vivo
//
// Fotografia do atendimento NESTE instante — é o que alimenta a aba
// "Ao vivo" (painel de parede).
//
// POR QUE UMA ROTA, e não consultas direto do navegador:
//
//  1. `profiles` tem RLS restrita (0001): um agente comum só enxerga o
//     PRÓPRIO perfil. O quadro "quem está livre agora" precisa do nome e
//     da disponibilidade de TODO MUNDO — do navegador ele viria vazio.
//     A service role resolve isso sem afrouxar policy nenhuma.
//  2. Os contadores grandes usam `count: "exact", head: true`. Contar no
//     banco custa quase nada; trazer 5 mil linhas para o navegador
//     contar custa banda a cada 30 s, o dia inteiro, numa TV ligada.
//
// A rota é somente leitura e agregada: ninguém recebe conteúdo de
// mensagem além do trecho que já aparece no inbox.
// =====================================================================

export const dynamic = "force-dynamic";

/**
 * Teto da varredura leve (só as colunas `canal` e `responsavel_id`).
 * A fila viva de um atendimento saudável tem dezenas de conversas; se
 * passar disso, avisamos na tela em vez de mentir um número parcial.
 */
const TETO_FILA = 3_000;

/** Quantas mensagens recebidas aparecem no "Entrando agora". */
const ULTIMAS_ENTRADAS = 10;

type LinhaFila = { canal: string | null; responsavel_id: string | null };

export async function GET() {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user) return NextResponse.json({ error: "não autenticado" }, { status: 401 });
  if (!hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "sem acesso ao atendimento" }, { status: 403 });
  }

  const admin = createSupabaseAdmin();

  const [
    abertasRes,
    naoAtribuidasRes,
    pendentesRes,
    aguardandoRes,
    maisAntigaRes,
    filaRes,
    pendentesFilaRes,
    perfisRes,
    entradasRes,
  ] = await Promise.all([
    // --- Contadores exatos: head=true não transfere linha nenhuma ------
    admin.from("conversations").select("id", { count: "exact", head: true }).eq("status", "aberta"),
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta")
      .is("responsavel_id", null),
    admin.from("conversations").select("id", { count: "exact", head: true }).eq("status", "pendente"),
    admin
      .from("conversations")
      .select("id", { count: "exact", head: true })
      .eq("status", "aberta")
      .is("primeira_resposta_em", null),

    // --- A que está esperando há mais tempo ---------------------------
    admin
      .from("conversations")
      .select("id, contato_nome, canal, created_at, sla_first_response_due")
      .eq("status", "aberta")
      .is("primeira_resposta_em", null)
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle(),

    // --- Varredura leve para os quadros de distribuição ---------------
    // Só duas colunas: é o suficiente para "carga por agente" e "fila por
    // canal" sem puxar payload de conversa.
    admin
      .from("conversations")
      .select("canal, responsavel_id")
      .eq("status", "aberta")
      .limit(TETO_FILA),
    admin
      .from("conversations")
      .select("responsavel_id")
      .eq("status", "pendente")
      .limit(TETO_FILA),

    // --- Quem pode atender -------------------------------------------
    admin
      .from("profiles")
      .select("id, nome, disponibilidade")
      .eq("ativo", true)
      .or("atendimento_access.eq.true,is_admin_central.eq.true")
      .order("nome"),

    // --- Últimas mensagens do cliente ---------------------------------
    // `interna` é nota interna do time; `direcao=in` é o cliente falando.
    admin
      .from("messages")
      .select("id, conversation_id, conteudo, tipo, created_at")
      .eq("direcao", "in")
      .eq("interna", false)
      .order("created_at", { ascending: false })
      .limit(ULTIMAS_ENTRADAS),
  ]);

  const fila = (filaRes.data ?? []) as LinhaFila[];
  const pendentesFila = (pendentesFilaRes.data ?? []) as { responsavel_id: string | null }[];

  // ---- Carga por agente ---------------------------------------------
  const abertasPorAgente = new Map<string, number>();
  for (const linha of fila) {
    if (!linha.responsavel_id) continue;
    abertasPorAgente.set(linha.responsavel_id, (abertasPorAgente.get(linha.responsavel_id) ?? 0) + 1);
  }
  const pendentesPorAgente = new Map<string, number>();
  for (const linha of pendentesFila) {
    if (!linha.responsavel_id) continue;
    pendentesPorAgente.set(
      linha.responsavel_id,
      (pendentesPorAgente.get(linha.responsavel_id) ?? 0) + 1,
    );
  }

  const perfis = (perfisRes.data ?? []) as {
    id: string;
    nome: string | null;
    disponibilidade: AgentAvailability | null;
  }[];

  const agentes: AoVivoAgente[] = perfis
    .map((p) => ({
      id: p.id,
      nome: p.nome ?? "Sem nome",
      disponibilidade: p.disponibilidade ?? "offline",
      abertas: abertasPorAgente.get(p.id) ?? 0,
      pendentes: pendentesPorAgente.get(p.id) ?? 0,
    }))
    // Quem está offline E sem conversa na mão não ajuda a decidir nada —
    // some da lista. Offline COM carga fica: conversa parada com alguém
    // que saiu é exatamente o problema que este painel deve denunciar.
    .filter((a) => a.disponibilidade !== "offline" || a.abertas > 0 || a.pendentes > 0)
    .sort((a, b) => b.abertas - a.abertas || a.nome.localeCompare(b.nome, "pt-BR"));

  // ---- Fila por canal --------------------------------------------------
  const porCanal = new Map<string, number>();
  for (const linha of fila) {
    if (!linha.canal) continue;
    porCanal.set(linha.canal, (porCanal.get(linha.canal) ?? 0) + 1);
  }
  const canais: AoVivoCanal[] = Array.from(porCanal.entries())
    .map(([canal, abertas]) => ({ canal: canal as ConversationChannel, abertas }))
    .sort((a, b) => b.abertas - a.abertas);

  // ---- Entrando agora --------------------------------------------------
  const mensagens = (entradasRes.data ?? []) as {
    id: string;
    conversation_id: string;
    conteudo: string | null;
    tipo: string;
    created_at: string;
  }[];

  // Uma segunda ida ao banco só para nome/canal das conversas citadas.
  // São no máximo 10 ids — é barato e evita join aninhado no PostgREST.
  const idsConversa = Array.from(new Set(mensagens.map((m) => m.conversation_id)));
  const { data: donasDaMensagem } = idsConversa.length
    ? await admin.from("conversations").select("id, contato_nome, canal").in("id", idsConversa)
    : { data: [] as { id: string; contato_nome: string | null; canal: string | null }[] };

  const conversaPorId = new Map<string, { contato: string; canal: ConversationChannel | null }>();
  for (const c of (donasDaMensagem ?? []) as {
    id: string;
    contato_nome: string | null;
    canal: string | null;
  }[]) {
    conversaPorId.set(c.id, {
      contato: c.contato_nome ?? "Sem nome",
      canal: (c.canal as ConversationChannel | null) ?? null,
    });
  }

  const entrando: AoVivoEntrada[] = mensagens.map((m) => {
    const dona = conversaPorId.get(m.conversation_id);
    return {
      id: m.id,
      conversationId: m.conversation_id,
      contato: dona?.contato ?? "Conversa removida",
      canal: dona?.canal ?? null,
      // Mensagem de mídia não tem texto: mostramos o tipo entre colchetes,
      // igual à prévia da lista de conversas.
      trecho: (m.conteudo ?? "").trim().slice(0, 140) || `[${m.tipo}]`,
      criadaEm: m.created_at,
    };
  });

  // ---- Mais antiga sem resposta ---------------------------------------
  const bruta = maisAntigaRes.data as {
    id: string;
    contato_nome: string | null;
    canal: string | null;
    created_at: string;
    sla_first_response_due: string | null;
  } | null;

  const maisAntigaSemResposta: AoVivoEspera | null = bruta
    ? {
        id: bruta.id,
        contato: bruta.contato_nome ?? "Sem nome",
        canal: (bruta.canal as ConversationChannel | null) ?? null,
        criadaEm: bruta.created_at,
        slaPrimeiraRespostaEm: bruta.sla_first_response_due,
      }
    : null;

  const snapshot: AoVivoSnapshot = {
    agora: new Date().toISOString(),
    abertas: abertasRes.count ?? 0,
    naoAtribuidas: naoAtribuidasRes.count ?? 0,
    pendentes: pendentesRes.count ?? 0,
    aguardandoPrimeiraResposta: aguardandoRes.count ?? 0,
    maisAntigaSemResposta,
    agentes,
    canais,
    entrando,
    amostraTruncada: fila.length >= TETO_FILA || pendentesFila.length >= TETO_FILA,
  };

  // Painel de parede não pode servir cache velho: qualquer camada
  // intermediária deve tratar isso como sempre fresco.
  return NextResponse.json(snapshot, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
