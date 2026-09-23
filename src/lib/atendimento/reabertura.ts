import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// CLIENTE VOLTOU DEPOIS DE ENCERRADO → A CONVERSA VOLTA À CAIXA CENTRAL
//
// A regra, nas palavras do Carlos (23/09/2026):
//
//   "Toda conversa nova, mesmo que seja de cliente antigo ou que já
//    entrou em contato, volta para a caixa inicial até o cliente decidir
//    o ramal. Após decidir o ramal, ela vai pro ramal selecionado até
//    ser encerrada."
//
// O QUE ACONTECIA ANTES: a mensagem nova só mudava `status` para
// "aberta". Fila, responsável e carimbo de triagem ficavam como estavam
// — a conversa reabria DENTRO do ramal antigo, com o atendente antigo,
// sem passar pela recepção nem pelo menu. Visto no banco em 23/09: a
// conversa "Sirene", encerrada às 12h56, recebeu mensagem às 16h08 e
// continuou na mesma fila.
//
// Aqui é a mesma operação que "devolver à caixa central" faz na rota de
// triagem — e com o mesmo registro em `atendimento_transferencias`, para
// "quem tirou esse cliente do meu ramal?" ter resposta: foi o próprio
// cliente, voltando.
//
// Roda ANTES do menu de ramais: com `triada_em` limpo, a escolha do ramal
// carimba a triagem de novo (ver `menu.ts` › `rotear`).
// =====================================================================

type ConversaReaberta = {
  id: string;
  team_id?: string | null;
  responsavel_id?: string | null;
};

export async function devolverParaCaixaCentral(
  admin: SupabaseClient,
  conversa: ConversaReaberta,
): Promise<void> {
  // Se a leitura veio sem fila/responsável, relê: o registro precisa
  // dizer DE ONDE a conversa saiu, e a linha da conversa é a fonte.
  let deEquipe = conversa.team_id ?? null;
  let deAgente = conversa.responsavel_id ?? null;
  if (conversa.team_id === undefined || conversa.responsavel_id === undefined) {
    const { data } = await admin
      .from("conversations")
      .select("team_id, responsavel_id")
      .eq("id", conversa.id)
      .maybeSingle();
    deEquipe = (data?.team_id as string | null) ?? null;
    deAgente = (data?.responsavel_id as string | null) ?? null;
  }

  await admin
    .from("conversations")
    .update({
      team_id: null,
      responsavel_id: null,
      triada_em: null,
      triada_por: null,
    })
    .eq("id", conversa.id);

  // Só vale registrar quando havia de onde sair: conversa que já estava
  // na caixa central não "voltou" para lugar nenhum.
  if (deEquipe || deAgente) {
    await admin
      .from("atendimento_transferencias")
      .insert({
        conversation_id: conversa.id,
        acao: "devolver",
        de_equipe: deEquipe,
        para_equipe: null,
        de_agente: deAgente,
        para_agente: null,
        motivo: "Cliente voltou depois de encerrado — de volta à caixa central para escolher o ramal",
        feito_por: null,
      })
      .then(undefined, () => undefined);

    // A nota interna é para quem abrir a conversa: sem ela, o atendente
    // do ramal antigo vê a conversa sumir da lista e não sabe por quê.
    await admin
      .from("messages")
      .insert({
        conversation_id: conversa.id,
        direcao: "out",
        remetente: "sistema",
        tipo: "texto",
        conteudo: "Atendimento anterior encerrado. Cliente voltou — conversa de volta à caixa central.",
        interna: true,
        status: "enviada",
      })
      .then(undefined, () => undefined);
  }
}
