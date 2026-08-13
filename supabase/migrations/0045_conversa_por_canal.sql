-- =====================================================================
-- 0045 — Vários números no mesmo canal (multi-WhatsApp).
--
-- A conversa passou a ser identificada por (canal, external_id,
-- channel_id) nos webhooks. Antes era só (canal, external_id): com dois
-- números, o mesmo cliente escrevendo para os dois caía numa conversa
-- só, e a resposta saía pelo número que abriu a conversa primeiro.
--
-- O índice acompanha a nova chave de busca. NÃO é único de propósito:
-- conversas antigas podem ter `channel_id` nulo (nasceram antes de o
-- canal existir) e os webhooks as ADOTAM em vez de duplicar — um índice
-- único aqui transformaria essa adoção em erro 500 no webhook, que a
-- Evolution reenfileira, virando mensagem repetida para o atendente.
-- =====================================================================

create index if not exists idx_conversations_canal_external_channel
  on public.conversations (canal, external_id, channel_id);

comment on index public.idx_conversations_canal_external_channel is
  'Busca do webhook: conversa por canal + contato + número que recebeu (multi-WhatsApp).';
