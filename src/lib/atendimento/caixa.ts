import type { SupabaseClient } from "@supabase/supabase-js";

// =====================================================================
// QUAL CAIXA ("inbox") É A DONA DESTA CONVERSA
//
// POR QUE ISTO PRECISOU EXISTIR: em 20/09/2026, das 338 conversas do
// banco, ZERO tinham `inbox_id` — o campo existe desde a 0031 e nunca foi
// preenchido pelo caminho de entrada. Quem depende dele falha em silêncio:
//
//   · `triggers.ts` calculava `dentroHorarioComercial` a partir dele, ou
//     seja, a condição "horário comercial" das automações NUNCA soube o
//     expediente — avaliava como se não houvesse horário cadastrado;
//   · o menu de ramais (0052) simplesmente nunca dispararia.
//
// O conserto é em dois tempos: conversa nova nasce com a caixa preenchida
// (ver `inbound.ts`), e as antigas continuam funcionando por este
// resolvedor, que deduz a caixa pela CONEXÃO — que 337 das 338 têm.
// =====================================================================

export interface ConversaComCaixa {
  inbox_id?: string | null;
  channel_id?: string | null;
  canal?: string | null;
}

/**
 * Resolve a caixa da conversa, na ordem: o que está gravado → a caixa da
 * conexão que recebeu → a única caixa ativa daquele canal.
 *
 * O último passo é o que atende a conta antiga de WhatsApp sem conexão
 * cadastrada; com duas caixas do mesmo canal ele desiste de propósito, em
 * vez de chutar e mandar o cliente para o expediente errado.
 */
export async function resolverCaixa(
  admin: SupabaseClient,
  conversa: ConversaComCaixa,
): Promise<string | null> {
  if (conversa.inbox_id) return conversa.inbox_id;

  if (conversa.channel_id) {
    const { data } = await admin
      .from("atendimento_inboxes")
      .select("id")
      .eq("channel_id", conversa.channel_id)
      .eq("ativo", true)
      .maybeSingle();
    if (data?.id) return data.id as string;
  }

  if (conversa.canal) {
    const { data } = await admin
      .from("atendimento_inboxes")
      .select("id")
      .eq("canal", conversa.canal)
      .eq("ativo", true)
      .not("channel_id", "is", null);
    if (data?.length === 1) return data[0].id as string;
  }

  return null;
}
