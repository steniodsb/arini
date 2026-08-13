-- =====================================================================
-- 0046 — O que REALMENTE impedia o segundo WhatsApp.
--
-- A 0025 criou `uq_conversations_canal_external` UNIQUE (canal,
-- external_id). Com dois números conectados, o mesmo cliente escrevendo
-- para os dois estoura violação de unicidade no INSERT do webhook: a
-- conversa não abre, o webhook responde 500 e a Evolution reenfileira o
-- evento para sempre. Nenhuma tela mostraria erro — a mensagem
-- simplesmente não apareceria.
--
-- A unicidade continua fazendo falta (é o que impede conversa duplicada
-- quando o provedor reentrega o mesmo evento), então ela não some: passa
-- a incluir a CONEXÃO.
--
-- COALESCE em vez de incluir `channel_id` cru porque, no Postgres, NULLs
-- são distintos entre si num índice único: com a coluna crua, canais sem
-- cadastro (Instagram, Messenger, chat do site) poderiam duplicar
-- conversa à vontade — exatamente o que a 0025 evitava.
-- =====================================================================

-- Rede de proteção: se já houver duplicata, o índice não é criado e a
-- migração falha aqui, com a lista na mensagem, em vez de na metade.
do $$
declare
  duplicadas int;
begin
  select count(*) into duplicadas from (
    select canal, external_id,
           coalesce(channel_id, '00000000-0000-0000-0000-000000000000'::uuid) conexao
      from public.conversations
     group by 1, 2, 3
    having count(*) > 1
  ) d;
  if duplicadas > 0 then
    raise exception 'Existem % combinações (canal, contato, conexão) duplicadas — resolva antes de aplicar a 0046', duplicadas;
  end if;
end $$;

drop index if exists public.uq_conversations_canal_external;

create unique index if not exists uq_conversations_canal_external_conexao
  on public.conversations (
    canal,
    external_id,
    coalesce(channel_id, '00000000-0000-0000-0000-000000000000'::uuid)
  );

comment on index public.uq_conversations_canal_external_conexao is
  'Uma conversa por (canal, contato, conexão). Permite o mesmo contato em dois números; NULL conta como conexão única.';
