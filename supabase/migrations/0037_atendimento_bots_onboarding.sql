-- =====================================================================
-- 0037 — Agent Bots e onboarding.
--
--   · bots que atuam como agente (recebem por webhook, respondem por API)
--   · handoff bot → humano na conversa
--   · estado do assistente de primeiros passos
--
-- Idempotente. Aplique após 0036.
-- =====================================================================

-- =====================================================================
-- 1. AGENT BOTS
-- =====================================================================

-- No Chatwoot um bot é registrado como se fosse um agente: as mensagens
-- da caixa dele são POSTadas para uma URL externa, e o bot responde
-- chamando a API de volta. É assim que se pluga um fluxo próprio
-- (n8n, Dialogflow, script caseiro) sem acoplar nada aqui dentro.
create table if not exists public.atendimento_agent_bots (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  -- Para onde mandamos cada mensagem recebida na caixa do bot.
  outgoing_url text not null,
  -- Token que o bot usa para responder. Guardamos só o hash (sha256),
  -- igual aos tokens de API: o valor em claro aparece uma vez.
  token_hash text not null unique,
  prefixo text not null,
  -- Segredo que assina o corpo enviado ao bot (HMAC-SHA256), para ele
  -- saber que a chamada veio mesmo daqui.
  secret text not null default encode(gen_random_bytes(24), 'hex'),
  ativo boolean not null default true,
  ultimo_status integer,
  ultimo_erro text,
  ultimo_envio_em timestamptz,
  falhas_seguidas integer not null default 0,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Qual bot atende qual caixa. Uma caixa tem no máximo um bot (senão dois
-- bots responderiam o mesmo cliente ao mesmo tempo).
create table if not exists public.atendimento_inbox_bots (
  inbox_id uuid primary key references public.atendimento_inboxes(id) on delete cascade,
  bot_id uuid not null references public.atendimento_agent_bots(id) on delete cascade,
  created_at timestamptz not null default now()
);

-- Estado do bot NA CONVERSA. 'ativo' = o bot está conduzindo;
-- 'transferida' = passou para humano e o bot para de responder;
-- 'sem_bot' = a caixa não tem bot. O handoff é o que impede o bot de
-- continuar falando por cima do atendente.
alter table public.conversations
  add column if not exists bot_status text not null default 'sem_bot',
  add column if not exists bot_id uuid references public.atendimento_agent_bots(id) on delete set null,
  add column if not exists bot_transferida_em timestamptz;

do $$ begin
  alter table public.conversations drop constraint if exists conversations_bot_status_check;
  alter table public.conversations
    add constraint conversations_bot_status_check
    check (bot_status in ('sem_bot','ativo','transferida'));
end $$;

create index if not exists idx_conversations_bot
  on public.conversations(bot_id, bot_status) where bot_id is not null;

-- O remetente 'bot' é diferente de 'ia': 'ia' é o nosso copiloto interno,
-- 'bot' é um sistema de terceiro plugado pela caixa. Os relatórios
-- precisam separar os dois.
do $$ begin
  alter table public.messages drop constraint if exists messages_remetente_check;
  alter table public.messages
    add constraint messages_remetente_check
    check (remetente in ('cliente','atendente','sistema','ia','bot'));
end $$;

alter table public.messages
  add column if not exists bot_id uuid references public.atendimento_agent_bots(id) on delete set null;

-- Log de entrega ao bot — mesma ideia do log de webhook de saída.
create table if not exists public.atendimento_bot_deliveries (
  id uuid primary key default gen_random_uuid(),
  bot_id uuid not null references public.atendimento_agent_bots(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  payload jsonb,
  status integer,
  erro text,
  duracao_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_bot_deliveries
  on public.atendimento_bot_deliveries(bot_id, created_at desc);

-- =====================================================================
-- 2. ONBOARDING
-- =====================================================================

alter table public.atendimento_settings
  add column if not exists onboarding_concluido boolean not null default false,
  -- { "<id do passo>": true } — permite pular e retomar de onde parou.
  add column if not exists onboarding_passos jsonb not null default '{}'::jsonb,
  add column if not exists onboarding_dispensado_em timestamptz;

-- =====================================================================
-- 3. RLS
-- =====================================================================

alter table public.atendimento_inbox_bots enable row level security;
drop policy if exists "atendimento_inbox_bots_read" on public.atendimento_inbox_bots;
drop policy if exists "atendimento_inbox_bots_write" on public.atendimento_inbox_bots;
create policy "atendimento_inbox_bots_read" on public.atendimento_inbox_bots
  for select using (public.fn_has_atendimento(auth.uid()));
create policy "atendimento_inbox_bots_write" on public.atendimento_inbox_bots
  for all using (public.fn_has_atendimento(auth.uid()))
  with check (public.fn_has_atendimento(auth.uid()));

-- Bots carregam token e segredo → só diretoria, como os canais.
alter table public.atendimento_agent_bots enable row level security;
drop policy if exists "atendimento_agent_bots_read" on public.atendimento_agent_bots;
drop policy if exists "atendimento_agent_bots_write" on public.atendimento_agent_bots;
create policy "atendimento_agent_bots_read" on public.atendimento_agent_bots
  for select using (public.fn_is_diretoria(auth.uid()));
create policy "atendimento_agent_bots_write" on public.atendimento_agent_bots
  for all using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));

alter table public.atendimento_bot_deliveries enable row level security;
drop policy if exists "atendimento_bot_deliveries_read" on public.atendimento_bot_deliveries;
create policy "atendimento_bot_deliveries_read" on public.atendimento_bot_deliveries
  for select using (public.fn_is_diretoria(auth.uid()));
