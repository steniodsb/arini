-- =====================================================================
-- 0034 — ONDA F: plataforma e novos canais.
--
--   · canais novos: telegram, e-mail, sms, widget de site, API genérica
--   · widget de site (live-chat) com sessão anônima do visitante
--   · webhooks de saída, tokens de API e registro de auditoria
--   · configuração de IA por caixa + cache de sugestões do copiloto
--   · avatar do agente com caminho no storage
--
-- Idempotente. Aplique após 0033.
-- =====================================================================

-- =====================================================================
-- 1. CANAIS NOVOS — solta o CHECK de canal em conversas e canais
-- =====================================================================

do $$ begin
  alter table public.conversations drop constraint if exists conversations_canal_check;
  alter table public.conversations
    add constraint conversations_canal_check
    check (canal in ('whatsapp','instagram','facebook','messenger','telegram','email','sms','site','api'));
end $$;

do $$ begin
  alter table public.atendimento_channels drop constraint if exists atendimento_channels_canal_check;
  alter table public.atendimento_channels
    add constraint atendimento_channels_canal_check
    check (canal in ('whatsapp','instagram','facebook','messenger','telegram','email','sms','site','api'));
end $$;

-- Provedores novos. `site` e `api` não têm provedor externo — usam 'nativo'.
do $$ begin
  alter table public.atendimento_channels drop constraint if exists atendimento_channels_provedor_check;
  alter table public.atendimento_channels
    add constraint atendimento_channels_provedor_check
    check (provedor in (
      'evolution','cloud_api','cloud_api_coexistence',
      'telegram_bot','email_smtp','sms_generico','widget','api_generica'
    ));
end $$;

-- =====================================================================
-- 2. WIDGET DE SITE — sessão anônima do visitante
-- =====================================================================

-- O token público identifica a caixa no script do site; o segredo assina
-- a identificação de usuário logado (HMAC), quando o site quiser passar
-- quem é o visitante sem deixar forjar identidade.
alter table public.atendimento_inboxes
  add column if not exists widget_secret text,
  add column if not exists widget_saudacao text default 'Olá! Como podemos ajudar?',
  add column if not exists widget_titulo text default 'Fale com a gente',
  add column if not exists widget_dominios text[] not null default '{}',
  add column if not exists widget_posicao text not null default 'direita'
    check (widget_posicao in ('direita','esquerda'));

-- Gera token/segredo para as caixas de site que ainda não têm.
update public.atendimento_inboxes
   set widget_token = coalesce(widget_token, encode(gen_random_bytes(16), 'hex')),
       widget_secret = coalesce(widget_secret, encode(gen_random_bytes(24), 'hex'))
 where canal = 'site';

create unique index if not exists uq_inboxes_widget_token
  on public.atendimento_inboxes(widget_token) where widget_token is not null;

-- Visitante anônimo do widget. O `contact_token` fica no localStorage do
-- navegador dele e é o que reconecta a mesma conversa entre visitas.
create table if not exists public.atendimento_widget_sessions (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.atendimento_inboxes(id) on delete cascade,
  contact_token text not null unique,
  conversation_id uuid references public.conversations(id) on delete set null,
  nome text,
  email text,
  telefone text,
  -- Respostas do formulário de pré-chat, se a caixa exigir.
  pre_chat jsonb not null default '{}'::jsonb,
  user_agent text,
  referrer text,
  ultima_atividade timestamptz not null default now(),
  created_at timestamptz not null default now()
);
create index if not exists idx_widget_sessions_conv
  on public.atendimento_widget_sessions(conversation_id);

-- =====================================================================
-- 3. WEBHOOKS DE SAÍDA
-- =====================================================================

create table if not exists public.atendimento_webhooks (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  url text not null,
  -- Assinatura HMAC-SHA256 do corpo, no header X-Arini-Signature.
  secret text not null default encode(gen_random_bytes(24), 'hex'),
  eventos text[] not null default '{conversa_criada,mensagem_criada}',
  ativo boolean not null default true,
  ultimo_status integer,
  ultimo_erro text,
  ultimo_envio_em timestamptz,
  falhas_seguidas integer not null default 0,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create table if not exists public.atendimento_webhook_deliveries (
  id uuid primary key default gen_random_uuid(),
  webhook_id uuid not null references public.atendimento_webhooks(id) on delete cascade,
  evento text not null,
  payload jsonb,
  status integer,
  erro text,
  duracao_ms integer,
  created_at timestamptz not null default now()
);
create index if not exists idx_webhook_deliveries
  on public.atendimento_webhook_deliveries(webhook_id, created_at desc);

-- =====================================================================
-- 4. TOKENS DE API
-- =====================================================================

-- Guardamos só o HASH do token (sha256). O valor em claro aparece UMA vez,
-- na criação — igual GitHub/Stripe. Se perder, gera outro.
create table if not exists public.atendimento_api_tokens (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  token_hash text not null unique,
  -- Primeiros caracteres, só para o usuário reconhecer qual é na lista.
  prefixo text not null,
  escopos text[] not null default '{leitura}',
  ultimo_uso_em timestamptz,
  expira_em timestamptz,
  revogado boolean not null default false,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 5. REGISTRO DE AUDITORIA
-- =====================================================================

create table if not exists public.atendimento_audit_log (
  id uuid primary key default gen_random_uuid(),
  ator_id uuid references public.profiles(id),
  ator_nome text,
  acao text not null,
  entidade text not null,
  entidade_id text,
  detalhes jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_created on public.atendimento_audit_log(created_at desc);
create index if not exists idx_audit_ator on public.atendimento_audit_log(ator_id, created_at desc);
create index if not exists idx_audit_entidade on public.atendimento_audit_log(entidade, created_at desc);

-- =====================================================================
-- 6. IA — configuração por caixa e sugestões do copiloto
-- =====================================================================

alter table public.atendimento_inboxes
  add column if not exists ia_copiloto boolean not null default false,
  add column if not exists ia_triagem boolean not null default false,
  add column if not exists ia_auto_resposta boolean not null default false,
  add column if not exists ia_modelo text not null default 'claude-haiku-4-5-20251001',
  add column if not exists ia_instrucoes text;

-- Cache das sugestões: não gastar token gerando a mesma coisa duas vezes
-- quando o atendente recarrega a tela.
create table if not exists public.atendimento_ia_sugestoes (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- Última mensagem considerada — muda a mensagem, invalida a sugestão.
  baseada_em uuid references public.messages(id) on delete cascade,
  tipo text not null default 'resposta' check (tipo in ('resposta','resumo','intencao')),
  conteudo text not null,
  modelo text,
  usada boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_ia_sugestoes_conv
  on public.atendimento_ia_sugestoes(conversation_id, created_at desc);

-- Intenção detectada pela triagem fica na própria conversa.
alter table public.conversations
  add column if not exists ia_intencao text,
  add column if not exists ia_resumo text;

-- =====================================================================
-- 7. AVATAR DO AGENTE
-- =====================================================================

alter table public.profiles
  add column if not exists avatar_path text;

-- =====================================================================
-- 8. RLS
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'atendimento_webhooks','atendimento_webhook_deliveries','atendimento_api_tokens',
    'atendimento_audit_log','atendimento_ia_sugestoes','atendimento_widget_sessions'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
  end loop;
end $$;

-- Sugestões de IA e sessões do widget: quem opera o atendimento vê.
create policy "atendimento_ia_sugestoes_read" on public.atendimento_ia_sugestoes
  for select using (public.fn_has_atendimento(auth.uid()));
create policy "atendimento_ia_sugestoes_write" on public.atendimento_ia_sugestoes
  for all using (public.fn_has_atendimento(auth.uid()))
  with check (public.fn_has_atendimento(auth.uid()));

create policy "atendimento_widget_sessions_read" on public.atendimento_widget_sessions
  for select using (public.fn_has_atendimento(auth.uid()));
create policy "atendimento_widget_sessions_write" on public.atendimento_widget_sessions
  for all using (public.fn_has_atendimento(auth.uid()))
  with check (public.fn_has_atendimento(auth.uid()));

-- Auditoria: todo mundo do atendimento LÊ, mas ninguém escreve pelo cliente
-- (só a service role, pelas rotas de API). Log que o usuário edita não é log.
create policy "atendimento_audit_log_read" on public.atendimento_audit_log
  for select using (public.fn_has_atendimento(auth.uid()));

-- Webhooks e tokens carregam segredo → só diretoria.
create policy "atendimento_webhooks_read" on public.atendimento_webhooks
  for select using (public.fn_is_diretoria(auth.uid()));
create policy "atendimento_webhooks_write" on public.atendimento_webhooks
  for all using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));

create policy "atendimento_webhook_deliveries_read" on public.atendimento_webhook_deliveries
  for select using (public.fn_is_diretoria(auth.uid()));

create policy "atendimento_api_tokens_read" on public.atendimento_api_tokens
  for select using (public.fn_is_diretoria(auth.uid()));
create policy "atendimento_api_tokens_write" on public.atendimento_api_tokens
  for all using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));

-- =====================================================================
-- 9. SEEDS — caixa do widget de site
-- =====================================================================

insert into public.atendimento_inboxes
  (nome, canal, widget_token, widget_secret, saudacao_ativa, saudacao_texto, pre_chat_ativo, pre_chat_campos)
select
  'Chat do site', 'site',
  encode(gen_random_bytes(16), 'hex'),
  encode(gen_random_bytes(24), 'hex'),
  true,
  'Olá! Aqui é da Arini Negócios Imobiliários. Em que posso ajudar?',
  true,
  '[{"chave":"nome","rotulo":"Seu nome","tipo":"texto","obrigatorio":true},
    {"chave":"telefone","rotulo":"WhatsApp","tipo":"telefone","obrigatorio":true},
    {"chave":"email","rotulo":"E-mail","tipo":"email","obrigatorio":false}]'::jsonb
where not exists (select 1 from public.atendimento_inboxes where canal = 'site');
