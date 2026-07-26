-- =====================================================================
-- 0031 — ATENDIMENTO ONDA B/C/D: paridade com o Chatwoot.
--
-- Cobre de uma vez a base de dados que faltava para:
--   · prioridade e adiamento (snooze) da conversa
--   · anexos/mídia com metadados + citar mensagem + menções
--   · caixas de entrada (inboxes) com configuração por caixa
--   · horário comercial, SLA, CSAT
--   · macros, regras de automação, atributos personalizados
--   · empresas, notas de contato, segmentos (filtros salvos)
--   · preferências do agente (assinatura, tema, disponibilidade)
--
-- Idempotente. Aplique após 0030.
-- =====================================================================

-- =====================================================================
-- 1. CONVERSAS — prioridade, snooze, caixa, atributos, SLA
-- =====================================================================

alter table public.conversations
  add column if not exists prioridade text,
  add column if not exists snoozed_until timestamptz,
  add column if not exists inbox_id uuid,
  add column if not exists custom_attributes jsonb not null default '{}'::jsonb,
  add column if not exists waiting_since timestamptz,
  add column if not exists sla_policy_id uuid,
  add column if not exists sla_first_response_due timestamptz,
  add column if not exists sla_resolution_due timestamptz,
  add column if not exists sla_violado boolean not null default false;

-- Prioridade: nula = sem prioridade definida (é o padrão do Chatwoot).
do $$ begin
  alter table public.conversations drop constraint if exists conversations_prioridade_check;
  alter table public.conversations
    add constraint conversations_prioridade_check
    check (prioridade is null or prioridade in ('baixa','media','alta','urgente'));
end $$;

-- Novo status "adiada" (snooze). Recria o CHECK do 0025.
do $$ begin
  alter table public.conversations drop constraint if exists conversations_status_check;
  alter table public.conversations
    add constraint conversations_status_check
    check (status in ('aberta','pendente','resolvida','adiada'));
end $$;

create index if not exists idx_conversations_prioridade
  on public.conversations(prioridade, last_message_at desc);
create index if not exists idx_conversations_snooze
  on public.conversations(snoozed_until) where snoozed_until is not null;

-- =====================================================================
-- 2. MENSAGENS — metadados de mídia, citação e menções
-- =====================================================================

alter table public.messages
  add column if not exists media_nome text,
  add column if not exists media_mime text,
  add column if not exists media_tamanho bigint,
  add column if not exists reply_to_id uuid references public.messages(id) on delete set null,
  add column if not exists mentions uuid[] not null default '{}'::uuid[];

create index if not exists idx_messages_mentions on public.messages using gin(mentions);

-- =====================================================================
-- 3. CAIXAS DE ENTRADA (inboxes) — configuração por caixa
-- =====================================================================

create table if not exists public.atendimento_inboxes (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  canal text not null default 'whatsapp'
    check (canal in ('whatsapp','instagram','facebook','messenger','telegram','email','sms','site','api')),
  -- Canal físico conectado (0027). Nulo = caixa lógica/manual.
  channel_id uuid,
  saudacao_ativa boolean not null default false,
  saudacao_texto text,
  mensagem_ausencia text,
  auto_atribuicao boolean not null default true,
  -- Limite de conversas simultâneas por agente no round-robin (0 = sem limite).
  auto_atribuicao_limite integer not null default 0,
  csat_ativo boolean not null default false,
  csat_mensagem text default 'Como você avalia nosso atendimento?',
  pre_chat_ativo boolean not null default false,
  pre_chat_campos jsonb not null default '[]'::jsonb,
  horario_comercial_ativo boolean not null default false,
  fuso text not null default 'America/Sao_Paulo',
  permite_responder_apos_resolver boolean not null default true,
  bloquear_conversa_encerrada boolean not null default false,
  widget_cor text default '#092316',
  widget_token text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.atendimento_inbox_members (
  inbox_id uuid not null references public.atendimento_inboxes(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (inbox_id, profile_id)
);

-- Vincula a conversa à caixa (FK depois da tabela existir).
do $$ begin
  if not exists (
    select 1 from pg_constraint where conname = 'conversations_inbox_fk'
  ) then
    alter table public.conversations
      add constraint conversations_inbox_fk
      foreign key (inbox_id) references public.atendimento_inboxes(id) on delete set null;
  end if;
end $$;

-- =====================================================================
-- 4. HORÁRIO COMERCIAL (business hours) — por caixa
-- =====================================================================

create table if not exists public.atendimento_business_hours (
  id uuid primary key default gen_random_uuid(),
  inbox_id uuid not null references public.atendimento_inboxes(id) on delete cascade,
  -- 0 = domingo … 6 = sábado (igual ao JS getDay()).
  dia_semana smallint not null check (dia_semana between 0 and 6),
  aberto boolean not null default true,
  abre time not null default '08:00',
  fecha time not null default '18:00',
  unique (inbox_id, dia_semana)
);

-- =====================================================================
-- 5. SLA — políticas e violações
-- =====================================================================

create table if not exists public.atendimento_sla_policies (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  -- Minutos. Nulo = não monitora aquele marco.
  primeira_resposta_min integer,
  proxima_resposta_min integer,
  resolucao_min integer,
  -- Conta apenas dentro do horário comercial da caixa?
  apenas_horario_comercial boolean not null default true,
  created_at timestamptz not null default now()
);

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'conversations_sla_fk') then
    alter table public.conversations
      add constraint conversations_sla_fk
      foreign key (sla_policy_id) references public.atendimento_sla_policies(id) on delete set null;
  end if;
end $$;

-- =====================================================================
-- 6. CSAT — pesquisa de satisfação
-- =====================================================================

create table if not exists public.atendimento_csat (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  agente_id uuid references public.profiles(id),
  nota smallint check (nota between 1 and 5),
  comentario text,
  enviado_em timestamptz not null default now(),
  respondido_em timestamptz
);
create unique index if not exists uq_csat_conversation on public.atendimento_csat(conversation_id);
create index if not exists idx_csat_agente on public.atendimento_csat(agente_id, respondido_em);

-- =====================================================================
-- 7. MACROS — sequência de ações em 1 clique
-- =====================================================================

create table if not exists public.atendimento_macros (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  -- 'global' = todos veem; 'pessoal' = só o criador.
  visibilidade text not null default 'global' check (visibilidade in ('global','pessoal')),
  -- [{ tipo: 'atribuir_agente'|'atribuir_equipe'|'mudar_status'|'adicionar_etiqueta'
  --    |'remover_etiqueta'|'enviar_mensagem'|'adicionar_nota'|'mudar_prioridade', valor: ... }]
  acoes jsonb not null default '[]'::jsonb,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 8. AUTOMAÇÕES — condições → ações
-- =====================================================================

create table if not exists public.atendimento_automations (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  evento text not null default 'conversa_criada'
    check (evento in ('conversa_criada','conversa_atualizada','mensagem_criada','conversa_resolvida')),
  -- [{ campo, operador, valor }] — todas as condições precisam bater (AND).
  condicoes jsonb not null default '[]'::jsonb,
  acoes jsonb not null default '[]'::jsonb,
  ativo boolean not null default true,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Log de execução (para depurar "por que essa conversa foi atribuída?").
create table if not exists public.atendimento_automation_logs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid references public.atendimento_automations(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete cascade,
  resultado text,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 9. ATRIBUTOS PERSONALIZADOS
-- =====================================================================

create table if not exists public.atendimento_custom_attributes (
  id uuid primary key default gen_random_uuid(),
  chave text not null,
  nome text not null,
  descricao text,
  tipo text not null default 'texto'
    check (tipo in ('texto','numero','link','data','lista','booleano')),
  opcoes text[] not null default '{}',
  aplica_a text not null default 'conversa' check (aplica_a in ('conversa','contato')),
  created_at timestamptz not null default now(),
  unique (chave, aplica_a)
);

-- =====================================================================
-- 10. EMPRESAS + NOTAS DE CONTATO
-- =====================================================================

create table if not exists public.atendimento_companies (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  dominio text,
  telefone text,
  email text,
  site text,
  cidade text,
  uf text,
  setor text,
  tamanho text,
  observacoes text,
  custom_attributes jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_companies_nome on public.atendimento_companies(nome);

-- Contato (lead) pertence a uma empresa + atributos personalizados + bloqueio.
alter table public.leads
  add column if not exists company_id uuid references public.atendimento_companies(id) on delete set null,
  add column if not exists custom_attributes jsonb not null default '{}'::jsonb,
  add column if not exists bloqueado boolean not null default false,
  add column if not exists avatar_url text;

create table if not exists public.atendimento_contact_notes (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  texto text not null,
  autor_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_contact_notes_lead on public.atendimento_contact_notes(lead_id, created_at desc);

-- =====================================================================
-- 11. SEGMENTOS (filtros salvos)
-- =====================================================================

create table if not exists public.atendimento_segments (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'conversa' check (tipo in ('conversa','contato')),
  filtros jsonb not null default '[]'::jsonb,
  visibilidade text not null default 'global' check (visibilidade in ('global','pessoal')),
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 12. PERFIL DO AGENTE — assinatura, tema, disponibilidade
-- =====================================================================

alter table public.profiles
  add column if not exists assinatura text,
  add column if not exists atendimento_tema text not null default 'sistema'
    check (atendimento_tema in ('claro','escuro','sistema')),
  add column if not exists disponibilidade text not null default 'online'
    check (disponibilidade in ('online','ocupado','ausente','offline')),
  add column if not exists notificacoes jsonb not null default '{}'::jsonb;

-- =====================================================================
-- 13. RLS — tudo liberado para quem tem acesso ao atendimento
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'atendimento_inboxes','atendimento_inbox_members','atendimento_business_hours',
    'atendimento_sla_policies','atendimento_csat','atendimento_macros',
    'atendimento_automations','atendimento_automation_logs',
    'atendimento_custom_attributes','atendimento_companies',
    'atendimento_contact_notes','atendimento_segments'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format(
      'create policy "%s_read" on public.%I for select using (public.fn_has_atendimento(auth.uid()))', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all using (public.fn_has_atendimento(auth.uid())) with check (public.fn_has_atendimento(auth.uid()))', t, t);
  end loop;
end $$;

-- =====================================================================
-- 14. AUTOMAÇÃO DE SNOOZE — conversa adiada volta a "aberta" no prazo
-- =====================================================================

create or replace function public.fn_despertar_conversas_adiadas()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare n integer;
begin
  update public.conversations
     set status = 'aberta', snoozed_until = null
   where status = 'adiada'
     and snoozed_until is not null
     and snoozed_until <= now();
  get diagnostics n = row_count;
  return n;
end $$;

-- =====================================================================
-- 15. SEEDS — caixa padrão, SLA padrão, horário comercial
-- =====================================================================

insert into public.atendimento_inboxes (nome, canal, saudacao_ativa, saudacao_texto, mensagem_ausencia, horario_comercial_ativo)
select
  'WhatsApp — Arini', 'whatsapp', false,
  'Olá! Aqui é da Arini Negócios Imobiliários. Como posso ajudar?',
  'Nosso atendimento é de segunda a sexta, das 8h às 18h. Deixe sua mensagem que respondemos assim que abrirmos.',
  true
where not exists (select 1 from public.atendimento_inboxes);

-- Horário comercial padrão da primeira caixa (seg–sex 8–18, sáb 8–12).
insert into public.atendimento_business_hours (inbox_id, dia_semana, aberto, abre, fecha)
select i.id, d.dia, d.aberto, d.abre::time, d.fecha::time
from public.atendimento_inboxes i
cross join (values
  (0, false, '08:00', '12:00'),
  (1, true,  '08:00', '18:00'),
  (2, true,  '08:00', '18:00'),
  (3, true,  '08:00', '18:00'),
  (4, true,  '08:00', '18:00'),
  (5, true,  '08:00', '18:00'),
  (6, true,  '08:00', '12:00')
) as d(dia, aberto, abre, fecha)
where not exists (select 1 from public.atendimento_business_hours b where b.inbox_id = i.id);

insert into public.atendimento_sla_policies (nome, descricao, primeira_resposta_min, proxima_resposta_min, resolucao_min)
select 'Padrão', 'Responder em até 15 min e resolver em até 24 h úteis.', 15, 30, 1440
where not exists (select 1 from public.atendimento_sla_policies);

insert into public.atendimento_custom_attributes (chave, nome, tipo, aplica_a, opcoes)
select * from (values
  ('orcamento',   'Orçamento',         'numero', 'contato',  '{}'::text[]),
  ('bairro',      'Bairro de interesse','texto',  'contato',  '{}'::text[]),
  ('motivo',      'Motivo do contato', 'lista',  'conversa', array['comprar','alugar','vender','avaliar','suporte','outro'])
) as v(chave, nome, tipo, aplica_a, opcoes)
where not exists (select 1 from public.atendimento_custom_attributes);

insert into public.atendimento_macros (nome, descricao, acoes)
select 'Resolver e agradecer',
       'Envia agradecimento, etiqueta como atendido e resolve a conversa.',
       '[{"tipo":"enviar_mensagem","valor":"Obrigado pelo contato! Qualquer coisa, é só chamar. 😊"},
         {"tipo":"adicionar_etiqueta","valor":"atendido"},
         {"tipo":"mudar_status","valor":"resolvida"}]'::jsonb
where not exists (select 1 from public.atendimento_macros);
