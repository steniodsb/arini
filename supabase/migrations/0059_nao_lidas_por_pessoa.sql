-- =====================================================================
-- 0059 — NÃO LIDAS POR PESSOA, e a ordem da lista que não volta no tempo
--
-- Relato de 29/09/2026 (áudios da equipe): "no meu aparece 10 mensagens
-- sem visualização, no dele já não aparece"; "a pessoa responde e a gente
-- não viu que respondeu".
--
-- A CAUSA: `conversations.unread_count` é UM número para a equipe
-- inteira. Bastava qualquer pessoa abrir a conversa — inclusive sem
-- querer, pela seleção automática da primeira da lista ao carregar a
-- tela — para zerar o contador de todo mundo. E o gatilho zerava também
-- com mensagem do menu de ramais, do bot e com nota interna, que não são
-- "alguém respondeu o cliente". Além disso o webhook lia o valor, somava
-- 1 e regravava: duas mensagens juntas perdiam uma contagem.
--
-- O QUE MUDA:
--   · `atendimento_leituras` guarda ATÉ QUANDO cada pessoa leu cada
--     conversa. É o modelo do WhatsApp: o "não lido" é seu, não do grupo.
--   · `fn_nao_lidas_minhas()` conta, para quem chama, as mensagens do
--     cliente depois do que ele leu E depois da última resposta humana
--     (responder é ter lido — inclusive pelo celular, que é como 83% das
--     respostas saem).
--   · o gatilho não deixa `last_message_at` andar para trás (uma mensagem
--     com carimbo do WhatsApp mais antigo, gravada depois, descia a
--     conversa na lista no meio do atendimento) e só zera o contador
--     compartilhado com resposta humana de verdade.
--
-- `unread_count` continua existindo e sendo mantido: webhooks de saída e
-- relatórios leem esse campo. A TELA é que deixa de usá-lo.
--
-- Idempotente. Aplique após 0058.
-- =====================================================================

create table if not exists public.atendimento_leituras (
  profile_id uuid not null references public.profiles(id) on delete cascade,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  lida_ate timestamptz not null default now(),
  primary key (profile_id, conversation_id)
);

comment on table public.atendimento_leituras is
  'Até quando cada pessoa leu cada conversa — o "não lido" individual, como no WhatsApp.';

create index if not exists idx_leituras_conversa on public.atendimento_leituras (conversation_id);

alter table public.atendimento_leituras enable row level security;

drop policy if exists leituras_proprias on public.atendimento_leituras;
create policy leituras_proprias on public.atendimento_leituras
  for all
  using (profile_id = auth.uid())
  with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------
-- Marcar como lida (para quem chama). `greatest`: duas abas abertas não
-- podem fazer a leitura voltar no tempo.
-- ---------------------------------------------------------------------
create or replace function public.fn_marcar_conversa_lida(p_conversation uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.atendimento_leituras (profile_id, conversation_id, lida_ate)
  values (auth.uid(), p_conversation, now())
  on conflict (profile_id, conversation_id)
  do update set lida_ate = greatest(public.atendimento_leituras.lida_ate, excluded.lida_ate);
$$;

grant execute on function public.fn_marcar_conversa_lida(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- Não lidas de quem chama, por conversa (só as que têm alguma).
--
-- SECURITY DEFINER com o filtro de visibilidade EXPLÍCITO, uma vez por
-- conversa: pela RLS a política de `messages` seria avaliada linha a
-- linha em cada contagem, e a tela chama isto a cada recarga da lista.
-- Encerradas ficam de fora: a mensagem nova do cliente reabre a conversa.
-- ---------------------------------------------------------------------
create or replace function public.fn_nao_lidas_minhas()
returns table (conversation_id uuid, nao_lidas int)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, least(count(m.id), 999)::int
    from public.conversations c
    left join public.atendimento_leituras l
      on l.conversation_id = c.id and l.profile_id = auth.uid()
    cross join lateral (
      select max(r.created_at) as em
        from public.messages r
       where r.conversation_id = c.id
         and r.direcao = 'out'
         and r.remetente = 'atendente'
         and not r.interna
    ) h
    join public.messages m
      on m.conversation_id = c.id
     and m.direcao = 'in'
     and not m.interna
     and m.created_at > greatest(
           coalesce(l.lida_ate, '-infinity'::timestamptz),
           coalesce(h.em, '-infinity'::timestamptz)
         )
   where c.status <> 'resolvida'
     and public.fn_pode_ver_conversa(auth.uid(), c.responsavel_id, c.team_id, c.triada_em)
   group by c.id
$$;

grant execute on function public.fn_nao_lidas_minhas() to authenticated;

-- ---------------------------------------------------------------------
-- Ponto de partida: o que o contador compartilhado já dava como lido
-- (unread_count = 0) começa lido para todo mundo que tem acesso — senão
-- as conversas antigas sem resposta humana acenderiam de uma vez.
-- ---------------------------------------------------------------------
insert into public.atendimento_leituras (profile_id, conversation_id, lida_ate)
select p.id, c.id, now()
  from public.profiles p
  cross join public.conversations c
 where p.ativo
   and (p.atendimento_access or p.is_admin_central)
   and c.unread_count = 0
on conflict do nothing;

-- ---------------------------------------------------------------------
-- Gatilho da mensagem: ordem que só anda para frente, e o contador
-- compartilhado zerando só com resposta humana.
-- ---------------------------------------------------------------------
create or replace function public.fn_message_touch_conversation()
returns trigger
language plpgsql
security definer
as $function$
begin
  update public.conversations
    set last_message_at = greatest(coalesce(last_message_at, NEW.created_at), NEW.created_at),
        last_message_preview = left(coalesce(NEW.conteudo, '[' || NEW.tipo || ']'), 140),
        unread_count = case
                         when NEW.direcao = 'in' and not NEW.interna then unread_count + 1
                         when NEW.direcao = 'out' and NEW.remetente = 'atendente' and not NEW.interna then 0
                         else unread_count
                       end
    where id = NEW.conversation_id;
  return NEW;
end $function$;
