import type { SupabaseClient } from "@supabase/supabase-js";
import { executarAutomacoes, type ContextoAutomacao } from "./automations";
import type { AutomationEvent } from "@/lib/types";

// =====================================================================
// Gancho de automação — é o que liga as REGRAS cadastradas na tela de
// Automações ao que acontece de verdade nos webhooks.
//
// Regras de ouro deste módulo:
//   · nunca lança — o webhook precisa responder 200 para a Meta/Evolution
//     não reenfileirar o evento, mesmo que uma regra do cliente esteja
//     malformada;
//   · faz o mínimo de I/O: relê a conversa uma vez e calcula o horário
//     comercial só quando a caixa tem expediente cadastrado.
// =====================================================================

/** Fuso da operação (imobiliária em MG/SP). Evita depender do TZ do servidor. */
const TZ_OFFSET_MIN = -180; // UTC-3

/**
 * A conversa está dentro do expediente da caixa dela?
 * Retorna `undefined` quando não há caixa ou expediente cadastrado — as
 * condições de automação tratam "desconhecido" como "não avaliar".
 */
async function dentroDoHorario(
  admin: SupabaseClient,
  inboxId: string | null,
): Promise<boolean | undefined> {
  if (!inboxId) return undefined;

  const { data } = await admin
    .from("atendimento_business_hours")
    .select("dia_semana, aberto, abre, fecha")
    .eq("inbox_id", inboxId);

  if (!data || data.length === 0) return undefined;

  // "Agora" no fuso da operação, independente do TZ do container.
  const agora = new Date(Date.now() + TZ_OFFSET_MIN * 60_000);
  const dia = agora.getUTCDay();
  const minutosAgora = agora.getUTCHours() * 60 + agora.getUTCMinutes();

  const hoje = (data as { dia_semana: number; aberto: boolean; abre: string; fecha: string }[])
    .find((d) => d.dia_semana === dia);
  if (!hoje || !hoje.aberto) return false;

  const emMinutos = (hhmm: string) => {
    const [h, m] = hhmm.split(":");
    return Number(h) * 60 + Number(m ?? 0);
  };
  return minutosAgora >= emMinutos(hoje.abre) && minutosAgora < emMinutos(hoje.fecha);
}

export interface GatilhoMensagem {
  /** A conversa acabou de ser criada neste evento? */
  conversaNova: boolean;
  conteudo?: string | null;
  direcao?: "in" | "out";
  interna?: boolean;
}

/**
 * Roda as automações dos eventos "conversa_criada" e/ou "mensagem_criada"
 * para a conversa informada. Chamado pelos webhooks depois de gravar a
 * mensagem. Devolve um resumo curto para o corpo da resposta do webhook.
 */
export async function dispararAutomacoes(
  admin: SupabaseClient,
  conversationId: string,
  gatilho: GatilhoMensagem,
): Promise<{ eventos: string[]; regrasDisparadas: number; erros: string[] }> {
  const resumo = { eventos: [] as string[], regrasDisparadas: 0, erros: [] as string[] };

  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("id, canal, status, prioridade, responsavel_id, team_id, tags, contato_nome, contato_telefone, inbox_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) return resumo;

    const ctx: ContextoAutomacao = {
      conversa: {
        id: conv.id as string,
        canal: conv.canal as string | null,
        status: conv.status as ContextoAutomacao["conversa"]["status"],
        prioridade: conv.prioridade as ContextoAutomacao["conversa"]["prioridade"],
        responsavel_id: conv.responsavel_id as string | null,
        team_id: conv.team_id as string | null,
        tags: (conv.tags as string[] | null) ?? [],
        contato_nome: conv.contato_nome as string | null,
        contato_telefone: conv.contato_telefone as string | null,
      },
      mensagem: {
        conteudo: gatilho.conteudo ?? null,
        direcao: gatilho.direcao ?? "in",
        interna: gatilho.interna ?? false,
      },
      dentroHorarioComercial: await dentroDoHorario(admin, (conv.inbox_id as string | null) ?? null),
    };

    // Conversa nova dispara os dois eventos, nessa ordem: a regra de
    // boas-vindas ("conversa_criada") deve rodar antes das de conteúdo.
    const eventos: AutomationEvent[] = gatilho.conversaNova
      ? ["conversa_criada", "mensagem_criada"]
      : ["mensagem_criada"];

    for (const evento of eventos) {
      const resultados = await executarAutomacoes(admin, evento, ctx);
      resumo.eventos.push(evento);
      for (const r of resultados) {
        if (r.disparou) resumo.regrasDisparadas += 1;
        if (r.erros.length) resumo.erros.push(...r.erros);
      }
    }
  } catch (e) {
    // Engolir é proposital: automação quebrada não pode derrubar o webhook.
    resumo.erros.push(e instanceof Error ? e.message : "erro desconhecido na automação");
  }

  return resumo;
}

/**
 * Dispara as automações de "conversa_resolvida". Usado quando o atendente
 * resolve pela UI (a mudança de status não passa por webhook).
 */
export async function dispararResolucao(
  admin: SupabaseClient,
  conversationId: string,
): Promise<void> {
  try {
    const { data: conv } = await admin
      .from("conversations")
      .select("id, canal, status, prioridade, responsavel_id, team_id, tags, contato_nome, contato_telefone, inbox_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (!conv) return;

    await executarAutomacoes(admin, "conversa_resolvida", {
      conversa: {
        id: conv.id as string,
        canal: conv.canal as string | null,
        status: conv.status as ContextoAutomacao["conversa"]["status"],
        prioridade: conv.prioridade as ContextoAutomacao["conversa"]["prioridade"],
        responsavel_id: conv.responsavel_id as string | null,
        team_id: conv.team_id as string | null,
        tags: (conv.tags as string[] | null) ?? [],
        contato_nome: conv.contato_nome as string | null,
        contato_telefone: conv.contato_telefone as string | null,
      },
      dentroHorarioComercial: await dentroDoHorario(admin, (conv.inbox_id as string | null) ?? null),
    });
  } catch {
    /* idem: nunca derruba o chamador */
  }
}
