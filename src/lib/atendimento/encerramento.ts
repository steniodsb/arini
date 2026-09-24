import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// ENCERRAMENTO AUTOMÁTICO — fecha o que parou de andar
//
// `atendimento_settings.auto_resolver_dias` existe desde a 0031 e a tela
// de Conta promete "resolver automaticamente após N dias sem resposta" —
// mas até 23/09/2026 NENHUMA linha implementava isso. O campo salvava e
// não acontecia nada.
//
// Virou peça obrigatória com a regra do Carlos: depois de encerrada, a
// conversa volta à caixa central e o cliente escolhe o ramal de novo. Sem
// alguém fechando o que ficou para trás, uma conversa esquecida tranca
// aquele cliente no ramal antigo para sempre.
//
// A REGRA QUE NÃO É ÓBVIA: só encerra o que JÁ FOI RESPONDIDO por gente
// e cuja ÚLTIMA mensagem é da equipe (ver o filtro no meio da função).
// Fechar sozinho uma conversa que ninguém atendeu faria o sistema
// esconder a própria falha — o cliente sumiria da tela sem nunca ter sido
// atendido, e ninguém ficaria sabendo. Essas continuam abertas, visíveis,
// cobrando alguém. É o comportamento certo mesmo custando mais barulho.
//
// Mora aqui (e não só na rota de jobs) porque o cron em produção pode não
// estar ligado — ver docs/ATENDIMENTO-PENDENCIAS.md, item 2. A abertura
// da caixa chama `encerrarInativasComFolga`, que roda no máximo uma vez a
// cada 10 minutos por instância do servidor. Assim o recurso funciona
// desde já; o cron só o torna pontual.
// =====================================================================

export async function encerrarInativas(
  admin: SupabaseClient,
): Promise<{ encerradas: number; dias: number }> {
  const { data: cfg } = await admin
    .from("atendimento_settings")
    .select("auto_resolver_dias")
    .eq("id", true)
    .maybeSingle();

  const dias = Number(cfg?.auto_resolver_dias ?? 0);
  if (!dias || dias <= 0) return { encerradas: 0, dias: 0 };

  const limite = new Date(Date.now() - dias * 24 * 3600_000).toISOString();

  const { data: paradas } = await admin
    .from("conversations")
    .select("id")
    .in("status", ["aberta", "pendente"])
    .lt("last_message_at", limite)
    .limit(500);
  if (!paradas?.length) return { encerradas: 0, dias };

  // Quais delas já receberam resposta de gente. `remetente = 'atendente'`
  // e não só `direcao = 'out'`: o menu e as automações também escrevem
  // para fora, e uma conversa que só recebeu o menu automático NÃO foi
  // atendida.
  const ids = paradas.map((c) => c.id as string);
  const { data: respostas } = await admin
    .from("messages")
    .select("conversation_id")
    .in("conversation_id", ids)
    .eq("direcao", "out")
    .eq("remetente", "atendente")
    .eq("interna", false);

  const respondidas = [...new Set((respostas ?? []).map((m) => m.conversation_id as string))];
  if (!respondidas.length) return { encerradas: 0, dias };

  // A SEGUNDA REGRA, que faltava: a ÚLTIMA mensagem tem de ser NOSSA.
  //
  // Em 24/09 às 7h05 esta rotina fechou 257 conversas de uma vez, e em 79
  // delas a última mensagem era do CLIENTE — gente que tinha perguntado
  // algo e esperava resposta. "Já recebeu resposta um dia" não quer dizer
  // "está atendido": o cliente pode ter voltado a escrever depois. Só
  // fecha o que terminou com a equipe falando por último.
  const { data: ultimas } = await admin
    .from("messages")
    .select("conversation_id, direcao, created_at")
    .in("conversation_id", respondidas)
    .eq("interna", false)
    .order("created_at", { ascending: false });
  const ultimaPorConversa = new Map<string, string>();
  for (const m of ultimas ?? []) {
    const id = m.conversation_id as string;
    if (!ultimaPorConversa.has(id)) ultimaPorConversa.set(id, m.direcao as string);
  }
  const atendidas = respondidas.filter((id) => ultimaPorConversa.get(id) === "out");
  if (!atendidas.length) return { encerradas: 0, dias };

  const agora = new Date().toISOString();
  const { data: fechadas } = await admin
    .from("conversations")
    .update({ status: "resolvida", resolvida_em: agora })
    .in("id", atendidas)
    .select("id");

  // Deixa dito na conversa por que ela fechou. Sem isso, o atendente que
  // voltar semana que vem acha que alguém resolveu e não sabe quem.
  if (fechadas?.length) {
    await admin.from("messages").insert(
      fechadas.map((c) => ({
        conversation_id: c.id as string,
        direcao: "out",
        remetente: "sistema",
        tipo: "texto",
        conteudo: `Encerrada automaticamente após ${dias} dia(s) sem movimento.`,
        interna: true,
        status: "enviada",
      })),
    );
  }

  return { encerradas: fechadas?.length ?? 0, dias };
}

/** Intervalo mínimo entre duas varreduras disparadas pela tela. */
const FOLGA_MS = 10 * 60_000;
let ultimaVarredura = 0;

/**
 * Versão para chamar na abertura da caixa: roda a varredura no máximo
 * uma vez por `FOLGA_MS`, e nunca lança — a tela não pode deixar de
 * abrir por causa de uma rotina de limpeza.
 *
 * `fire-and-forget` de propósito: o `await` deixaria a caixa esperando
 * a varredura inteira antes de aparecer.
 */
export function encerrarInativasComFolga(admin: SupabaseClient): void {
  const agora = Date.now();
  if (agora - ultimaVarredura < FOLGA_MS) return;
  ultimaVarredura = agora;
  void encerrarInativas(admin).catch(() => undefined);
}
