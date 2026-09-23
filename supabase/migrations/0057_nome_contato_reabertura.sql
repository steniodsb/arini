-- =====================================================================
-- 0057 — O NOME QUE VIROU "ARINI", O RAMAL QUE VOLTA E OS PADRÕES NOVOS
--
-- Rodada do Carlos em 23/09/2026. Idempotente. Aplique após 0056
-- (a foto do contato — `avatar_url`/`avatar_em` — é da 0056, não daqui).
--
-- 1. O NOME QUE VIROU "ARINI NEGÓCIOS IMOBILIÁRIOS"
--    Encontrado no banco em 23/09: 178 conversas e 126 leads com o nome
--    da PRÓPRIA imobiliária. O webhook gravava `pushName` do payload sem
--    olhar `fromMe` — e no eco da resposta dada pelo celular o pushName é
--    o perfil do número da Arini. Cada cliente que recebeu resposta pelo
--    aparelho era renomeado para "Arini Negócios Imobiliários". Foi o
--    que o Carlos relatou como "problema na identificação das mensagens".
--
--    O conserto no código está em `lib/atendimento/contato-nome.ts`.
--    Aqui é o reparo dos dados: o nome verdadeiro está no `raw_payload`
--    das mensagens RECEBIDAS (pushName do cliente). Quem nunca mandou
--    mensagem com pushName fica sem nome, que é honesto — a tela mostra
--    o telefone e oferece "+ nome".
--
--    Os nomes "envenenados" não são fixos no SQL: são os pushName que
--    aparecem em mensagens de SAÍDA (fromMe). Assim o reparo vale para
--    qualquer perfil que o número tenha tido.
--
-- 2. O RAMAL VOLTA DEPOIS DE ENCERRAR (regra do Carlos, 23/09)
--    "Toda conversa nova, mesmo de cliente antigo, volta para a caixa
--    inicial até o cliente decidir o ramal." A 0055 deixou isso como
--    opção desligada; a regra de negócio agora é ligada. A coluna
--    continua existindo (e editável na tela) para quem quiser desligar.
--    A volta à caixa central em si é código (`lib/atendimento/reabertura.ts`).
--
-- 3. ENCERRAMENTO AUTOMÁTICO
--    `auto_resolver_dias` era 0 (desligado). O job passou a existir
--    (`encerrarInativas`); o padrão vira 3 dias sem movimento — só para
--    conversa JÁ ATENDIDA por gente. Editável em Configurações › Conta.
--
-- 4. MENSAGEM DE LIGAÇÃO RECUSADA — texto mais gentil, pedido do Carlos.
--    Só troca onde ainda está o texto antigo, para não sobrescrever uma
--    mensagem que alguém já tenha personalizado. Até 100 caracteres: é o
--    tamanho da coluna `msgCall` na Evolution 2.3.7. O texto também precisa
--    ir para a instância (`/settings/set`): ver
--    `scripts/sincroniza-opcoes-evolution.js`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Reparo dos nomes
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
    raise notice '0057: nenhum nome envenenado encontrado — nada a reparar';
    return;
  end if;

  raise notice '0057: reparando conversas com nome em %', envenenados;

  -- 1a. Conversas: o último pushName de mensagem RECEBIDA do cliente.
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
     set contato_nome = left(v.nome, 80)
    from verdadeiro v
   where v.conversation_id = c.id
     and c.contato_nome = any (envenenados);

  -- 1b. Quem não tem pushName de cliente em lugar nenhum fica sem nome —
  --     a tela mostra o telefone e pede o nome, em vez de mentir.
  update public.conversations
     set contato_nome = null
   where contato_nome = any (envenenados)
     and canal = 'whatsapp';

  -- 1c. Leads: copia da conversa reparada; sem conversa com nome, volta
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
-- 2. O ramal volta depois de encerrar
-- ---------------------------------------------------------------------
alter table public.atendimento_menus
  alter column reenviar_apos_resolver set default true;

update public.atendimento_menus
   set reenviar_apos_resolver = true
 where reenviar_apos_resolver = false;

-- ---------------------------------------------------------------------
-- 3. Encerramento automático: 3 dias, se ainda estava desligado
-- ---------------------------------------------------------------------
update public.atendimento_settings
   set auto_resolver_dias = 3
 where id = true and coalesce(auto_resolver_dias, 0) = 0;

-- ---------------------------------------------------------------------
-- 4. Mensagem de ligação recusada — mais gentil
-- ---------------------------------------------------------------------
update public.atendimento_channels
   set opcoes = jsonb_set(
         coalesce(opcoes, '{}'::jsonb),
         '{msgCall}',
         to_jsonb('Olá! 😊 Por aqui não atendemos ligações. É só escrever que a gente responde rapidinho. Obrigado!'::text)
       )
 where provedor = 'evolution'
   and (
     opcoes->>'msgCall' is null
     or opcoes->>'msgCall' = ''
     or opcoes->>'msgCall' = 'Não atendemos ligações por aqui. Pode escrever que respondemos.'
     -- Primeira versão do texto novo, longa demais para a coluna da
     -- Evolution (varchar 100): o /settings/set respondia 500.
     or length(opcoes->>'msgCall') > 100
   );
