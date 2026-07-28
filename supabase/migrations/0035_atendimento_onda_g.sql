-- =====================================================================
-- 0035 — ONDA G: o que ainda faltava para fechar a paridade.
--
--   · participantes da conversa (watchers) e "marcar como não lida"
--   · apagar mensagem (soft delete, preservando o rastro)
--   · templates de mensagem do WhatsApp (exigidos pela Meta em campanha)
--   · portal público da Central de Ajuda (idioma, SEO, visualizações)
--   · categorias de respostas rápidas
--   · papéis personalizados (permissões granulares)
--   · integrações (Slack, Dialogflow, apps do painel)
--   · configurações gerais da conta
--
-- Idempotente. Aplique após 0034.
-- =====================================================================

-- =====================================================================
-- 1. PARTICIPANTES DA CONVERSA (watchers)
-- =====================================================================

-- No Chatwoot, "participante" é quem acompanha a conversa sem ser o
-- responsável: recebe as menções e notificações, mas não aparece como
-- dono. Serve para o gerente seguir um caso sem tomá-lo do atendente.
create table if not exists public.atendimento_conversation_participants (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (conversation_id, profile_id)
);
create index if not exists idx_participants_profile
  on public.atendimento_conversation_participants(profile_id);

-- "Marcar como não lida": o contador some quando o agente abre a conversa,
-- então precisamos de um sinal separado, que o próprio agente controla.
alter table public.conversations
  add column if not exists marcada_nao_lida boolean not null default false;

-- =====================================================================
-- 2. APAGAR MENSAGEM (soft delete)
-- =====================================================================

-- Apagar de verdade destrói o histórico e quebra a auditoria. O Chatwoot
-- também só esconde o conteúdo e deixa o rastro "mensagem apagada".
alter table public.messages
  add column if not exists apagada_em timestamptz,
  add column if not exists apagada_por uuid references public.profiles(id);

-- =====================================================================
-- 3. TEMPLATES DE MENSAGEM DO WHATSAPP
-- =====================================================================

-- Fora da janela de 24 h, a Meta só aceita template aprovado. Sem esta
-- tabela, campanha de WhatsApp por API oficial é impossível.
create table if not exists public.atendimento_templates (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid references public.atendimento_channels(id) on delete cascade,
  nome text not null,
  -- Idioma no formato da Meta (pt_BR, en_US…).
  idioma text not null default 'pt_BR',
  categoria text not null default 'MARKETING'
    check (categoria in ('MARKETING','UTILITY','AUTHENTICATION')),
  -- Status na Meta. 'local' = criado aqui e ainda não submetido.
  status text not null default 'local'
    check (status in ('local','PENDING','APPROVED','REJECTED','PAUSED','DISABLED')),
  -- Componentes no formato da Graph API (header/body/footer/buttons).
  componentes jsonb not null default '[]'::jsonb,
  -- Corpo em texto puro, para pré-visualizar sem interpretar o jsonb.
  corpo text,
  -- Quantas variáveis {{1}}, {{2}}… o corpo espera.
  variaveis integer not null default 0,
  meta_id text,
  motivo_rejeicao text,
  sincronizado_em timestamptz,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  unique (channel_id, nome, idioma)
);

-- A campanha pode disparar via template (obrigatório fora da janela).
alter table public.atendimento_campaigns
  add column if not exists template_id uuid references public.atendimento_templates(id) on delete set null,
  add column if not exists template_variaveis jsonb not null default '[]'::jsonb;

-- =====================================================================
-- 4. PORTAL PÚBLICO DA CENTRAL DE AJUDA
-- =====================================================================

alter table public.atendimento_portals
  add column if not exists meta_titulo text,
  add column if not exists meta_descricao text,
  add column if not exists logo_url text,
  add column if not exists cor_destaque text default '#092316',
  add column if not exists mostrar_busca boolean not null default true,
  add column if not exists rodape_html text,
  add column if not exists visualizacoes integer not null default 0;

alter table public.atendimento_categories
  add column if not exists icone text;

-- Voto de utilidade do artigo ("isso ajudou?") — é o feedback que diz
-- quais artigos reescrever.
create table if not exists public.atendimento_article_votes (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null references public.atendimento_articles(id) on delete cascade,
  util boolean not null,
  comentario text,
  -- Visitante anônimo: guardamos só um token de navegador, sem IP.
  visitante_token text,
  created_at timestamptz not null default now()
);
create index if not exists idx_article_votes on public.atendimento_article_votes(article_id);

-- =====================================================================
-- 5. CATEGORIAS DE RESPOSTAS RÁPIDAS
-- =====================================================================

alter table public.canned_responses
  add column if not exists categoria text;

-- =====================================================================
-- 6. PAPÉIS PERSONALIZADOS (permissões granulares)
-- =====================================================================

create table if not exists public.atendimento_roles (
  id uuid primary key default gen_random_uuid(),
  nome text not null unique,
  descricao text,
  -- Lista de permissões. Ex.: 'conversa:ver_todas', 'relatorio:ver',
  -- 'config:editar', 'contato:excluir'. A UI oferece o catálogo.
  permissoes text[] not null default '{}',
  -- Papel de sistema não pode ser excluído nem renomeado.
  sistema boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.profiles
  add column if not exists atendimento_role_id uuid references public.atendimento_roles(id) on delete set null;

-- =====================================================================
-- 7. INTEGRAÇÕES E APPS DO PAINEL
-- =====================================================================

create table if not exists public.atendimento_integrations (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('slack','dialogflow','webhook_app','dashboard_app','google_translate')),
  nome text not null,
  -- Credenciais do serviço. Contém segredo → RLS de diretoria.
  config jsonb not null default '{}'::jsonb,
  ativo boolean not null default false,
  ultimo_erro text,
  created_at timestamptz not null default now()
);

-- App do painel: um iframe que aparece ao lado da conversa (CRM externo,
-- rastreio de pedido, o que o cliente quiser).
create table if not exists public.atendimento_dashboard_apps (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  -- A URL recebe ?conversation_id=&contact_id=&agent_id= ao abrir.
  url text not null,
  ativo boolean not null default true,
  ordem integer not null default 0,
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 8. CONFIGURAÇÕES GERAIS DA CONTA
-- =====================================================================

-- Linha única (id fixo) — mais simples que uma tabela de chave/valor
-- para um punhado de campos que a tela edita junto.
create table if not exists public.atendimento_settings (
  id boolean primary key default true check (id),
  nome_conta text not null default 'Arini Negócios Imobiliários',
  idioma text not null default 'pt-BR',
  fuso text not null default 'America/Sao_Paulo',
  -- Encerra sozinha a conversa resolvida sem resposta há N dias (0 = nunca).
  auto_resolver_dias integer not null default 0,
  -- Esconde o nome do agente do cliente (responde como a empresa).
  ocultar_nome_agente boolean not null default false,
  notificacao_som boolean not null default true,
  logo_url text,
  updated_at timestamptz not null default now()
);
insert into public.atendimento_settings (id) values (true) on conflict (id) do nothing;

-- =====================================================================
-- 9. RLS
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'atendimento_conversation_participants','atendimento_templates',
    'atendimento_article_votes','atendimento_roles','atendimento_dashboard_apps',
    'atendimento_settings'
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

-- Integrações guardam token de Slack/Google → só diretoria.
alter table public.atendimento_integrations enable row level security;
drop policy if exists "atendimento_integrations_read" on public.atendimento_integrations;
drop policy if exists "atendimento_integrations_write" on public.atendimento_integrations;
create policy "atendimento_integrations_read" on public.atendimento_integrations
  for select using (public.fn_is_diretoria(auth.uid()));
create policy "atendimento_integrations_write" on public.atendimento_integrations
  for all using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));

-- =====================================================================
-- 10. SEEDS — papéis de sistema
-- =====================================================================

insert into public.atendimento_roles (nome, descricao, permissoes, sistema)
select * from (values
  ('Administrador',
   'Acesso total: configurações, canais, relatórios e todas as conversas.',
   array['conversa:ver_todas','conversa:atribuir','conversa:excluir','contato:ver',
         'contato:editar','contato:excluir','relatorio:ver','relatorio:exportar',
         'config:ver','config:editar','canal:gerenciar','agente:gerenciar'],
   true),
  ('Supervisor',
   'Vê todas as conversas e os relatórios, mas não mexe em canais nem agentes.',
   array['conversa:ver_todas','conversa:atribuir','contato:ver','contato:editar',
         'relatorio:ver','relatorio:exportar','config:ver'],
   true),
  ('Atendente',
   'Vê e responde as conversas atribuídas a ele e as não atribuídas.',
   array['conversa:ver_proprias','contato:ver','contato:editar'],
   true)
) as v(nome, descricao, permissoes, sistema)
where not exists (select 1 from public.atendimento_roles);
