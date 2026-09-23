-- =====================================================================
-- 0056 — ENCERRAMENTO, FOTO DO CONTATO E O NOME QUE VIROU "ARINI"
--
-- Rodada do Carlos em 23/09/2026. Quatro coisas, todas idempotentes.
--
-- 1. FOTO DO CONTATO NA CONVERSA
--    `contato_avatar_url` guarda a cópia da foto de perfil do WhatsApp no
--    NOSSO storage (a URL que a Evolution devolve, em pps.whatsapp.net,
--    expira em dias). `contato_avatar_em` diz quando foi buscada, para o
--    job renovar de tempos em tempos sem bater na API a cada abertura.
--
-- 2. O NOME QUE VIROU "ARINI NEGÓCIOS IMOBILIÁRIOS"
--    Encontrado no banco em 23/09: 178 conversas e 126 leads com o nome
--    da PRÓPRIA imobiliária. O webhook gravava `pushName` do payload sem
--    olhar `fromMe` — e no eco da resposta dada pelo celular o pushName é
--    o perfil do número da Arini. Cada cliente que recebeu resposta pelo
--    aparelho era renomeado para "Arini Negócios Imobiliários".
--
--    O conserto no código está em `api/webhooks/evolution/route.ts`. Aqui
--    é o reparo dos dados: o nome verdadeiro está no `raw_payload` das
--    mensagens RECEBIDAS (pushName do cliente). Quem nunca mandou texto
--    com pushName fica sem nome, que é honesto — a tela mostra o telefone
--    e oferece "+ nome".
--
--    Os nomes "envenenados" não são fixos no SQL: são os pushName que
--    aparecem em mensagens de SAÍDA (fromMe). Assim o reparo vale para
--    qualquer perfil que o número tenha tido.
--
-- 3. O RAMAL VOLTA DEPOIS DE ENCERRAR (regra do Carlos, 23/09)
--    "Toda conversa nova, mesmo de cliente antigo, volta para a caixa
--    inicial até o cliente decidir o ramal." A 0055 deixou isso como
--    opção desligada; a regra de negócio agora é ligada. A coluna
--    continua existindo (e editável na tela) para quem quiser desligar.
--
-- 4. ENCERRAMENTO AUTOMÁTICO
--    `auto_resolver_dias` era 0 (desligado) e a tela prometia o recurso
--    sem ninguém implementar. O job passou a existir nesta rodada; o
--    padrão vira 3 dias sem movimento — só para conversa JÁ ATENDIDA
--    (ver `lib/atendimento/encerramento.ts`). Editável em Configurações
--    › Conta.
--
-- 5. MENSAGEM DE LIGAÇÃO RECUSADA — texto mais gentil, pedido do Carlos.
--    Só troca onde ainda está o texto antigo, para não sobrescrever uma
--    mensagem que alguém já tenha personalizado.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Foto do contato
-- ---------------------------------------------------------------------
alter table public.conversations
  add column if not exists contato_avatar_url text,
  add column if not exists contato_avatar_em timestamptz;

comment on column public.conversations.contato_avatar_url is
  'Cópia da foto de perfil do contato no nosso storage (a URL da Evolution expira). Nulo = sem foto ou ainda não buscada.';
comment on column public.conversations.contato_avatar_em is
  'Quando a foto foi buscada pela última vez — o job renova depois de 30 dias.';

-- O job varre "quem ainda não tem foto" e "quem tem foto velha".
create index if not exists conversations_avatar_pendente_idx
  on public.conversations (contato_avatar_em nulls first)
  where canal = 'whatsapp';

-- ---------------------------------------------------------------------
-- 2. Reparo dos nomes
-- ---------------------------------------------------------------------
do $$
declare
  envenenados text[];
begin
  -- Os nomes que o webhook gravou por engano: pushName de mensagem que
  -- SAIU (fromMe), ou seja, o perfil do próprio número conectado.
  select coalesce(array_agg(distinct nome), '{}')
    into envenenados
    from (
      select raw_payload->'data'->>'pushName' as nome
        from public.messages
       where direcao = 'out'
         and raw_payload->'data'->'key'->>'fromMe' = 'true'
         and coalesce(raw_payload->'data'->>'pushName', '') <> ''
    ) s;

  if array_length(envenenados, 1) is null then
    raise notice '0056: nenhum nome envenenado encontrado — nada a reparar';
    return;
  end if;

  raise notice '0056: reparando conversas com nome em %', envenenados;

  -- 2a. Conversas: o último pushName de mensagem RECEBIDA do cliente.
  with verdadeiro as (
    select distinct on (m.conversation_id)
           m.conversation_id,
           m.raw_payload->'data'->>'pushName' as nome
      from public.messages m
     where m.direcao = 'in'
       and coalesce(m.raw_payload->'data'->>'pushName', '') <> ''
       and not (m.raw_payload->'data'->>'pushName' = any (envenenados))
     order by m.conversation_id, m.created_at desc
  )
  update public.conversations c
     set contato_nome = v.nome
    from verdadeiro v
   where v.conversation_id = c.id
     and c.contato_nome = any (envenenados);

  -- 2b. Quem não tem pushName de cliente em lugar nenhum fica sem nome —
  --     a tela mostra o telefone e pede o nome, em vez de mentir.
  update public.conversations
     set contato_nome = null
   where contato_nome = any (envenenados)
     and canal = 'whatsapp';

  -- 2c. Leads: copia da conversa reparada; sem conversa com nome, volta
  --     ao placeholder "Contato <telefone>" que o webhook sempre usou.
  update public.leads l
     set nome = coalesce(
           (select c.contato_nome
              from public.conversations c
             where c.lead_id = l.id and c.contato_nome is not null
             order by c.last_message_at desc
             limit 1),
           'Contato ' || coalesce(l.whatsapp, l.telefone, '')
         )
   where l.nome = any (envenenados);
end $$;

-- ---------------------------------------------------------------------
-- 3. O ramal volta depois de encerrar
-- ---------------------------------------------------------------------
alter table public.atendimento_menus
  alter column reenviar_apos_resolver set default true;

update public.atendimento_menus
   set reenviar_apos_resolver = true
 where reenviar_apos_resolver = false;

-- ---------------------------------------------------------------------
-- 4. Encerramento automático: 3 dias, se ainda estava desligado
-- ---------------------------------------------------------------------
update public.atendimento_settings
   set auto_resolver_dias = 3
 where id = true and coalesce(auto_resolver_dias, 0) = 0;

-- ---------------------------------------------------------------------
-- 5. Mensagem de ligação recusada — mais gentil
-- ---------------------------------------------------------------------
update public.atendimento_channels
   set opcoes = jsonb_set(
         opcoes,
         '{msgCall}',
         to_jsonb('Olá! 😊 Por aqui não conseguimos atender ligações, mas é só escrever a sua mensagem que a nossa equipe responde o mais rápido possível. Obrigado pela compreensão!'::text)
       )
 where provedor = 'evolution'
   and (
     opcoes->>'msgCall' is null
     or opcoes->>'msgCall' = ''
     or opcoes->>'msgCall' = 'Não atendemos ligações por aqui. Pode escrever que respondemos.'
   );
