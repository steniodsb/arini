-- =====================================================================
-- 0032 — CENTRAL DE AJUDA (portais/categorias/artigos) e CAMPANHAS
-- (disparo em massa + campanhas ao vivo no widget do site).
--
-- Por que juntar as duas coisas numa migração só: ambas são "conteúdo
-- que o time publica para o contato" e entram na mesma onda de telas
-- (Central de Ajuda, Campanhas e Agentes IA — a IA lê os artigos).
--
-- Idempotente. Aplique após 0031.
-- =====================================================================

-- =====================================================================
-- 1. CENTRAL DE AJUDA — portais
--
-- Um portal = um site de ajuda publicável (slug vira a URL). Guardamos
-- domínio customizado desde já para não precisar migrar de novo quando
-- ligarmos o portal público em ajuda.<dominio>.
-- =====================================================================

create table if not exists public.atendimento_portals (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  slug text not null unique,
  descricao text,
  cor text not null default '#092316',
  idioma text not null default 'pt-BR',
  dominio_customizado text,
  ativo boolean not null default true,
  created_at timestamptz not null default now()
);

-- Colunas adicionadas defensivamente: se a tabela já existir de uma
-- aplicação parcial anterior, o create acima é ignorado.
alter table public.atendimento_portals
  add column if not exists descricao text,
  add column if not exists cor text not null default '#092316',
  add column if not exists idioma text not null default 'pt-BR',
  add column if not exists dominio_customizado text,
  add column if not exists ativo boolean not null default true;

-- =====================================================================
-- 2. CATEGORIAS — agrupam artigos dentro de um portal
-- =====================================================================

create table if not exists public.atendimento_categories (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null references public.atendimento_portals(id) on delete cascade,
  nome text not null,
  slug text not null,
  descricao text,
  -- Ordem manual na barra lateral do portal (menor aparece primeiro).
  ordem integer not null default 0,
  created_at timestamptz not null default now(),
  unique (portal_id, slug)
);

create index if not exists idx_atd_categories_portal
  on public.atendimento_categories(portal_id, ordem);

-- =====================================================================
-- 3. ARTIGOS — conteúdo em markdown, com ciclo de publicação
-- =====================================================================

create table if not exists public.atendimento_articles (
  id uuid primary key default gen_random_uuid(),
  portal_id uuid not null references public.atendimento_portals(id) on delete cascade,
  -- Categoria é opcional: artigo pode existir "solto" enquanto é rascunho.
  category_id uuid references public.atendimento_categories(id) on delete set null,
  titulo text not null,
  slug text not null,
  resumo text,
  conteudo text,
  status text not null default 'rascunho'
    check (status in ('rascunho','publicado','arquivado')),
  autor_id uuid references public.profiles(id),
  visualizacoes integer not null default 0,
  ordem integer not null default 0,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (portal_id, slug)
);

create index if not exists idx_atd_articles_portal_status
  on public.atendimento_articles(portal_id, status, updated_at desc);
create index if not exists idx_atd_articles_category
  on public.atendimento_articles(category_id);

-- Mantém updated_at sem depender do cliente lembrar de enviar.
create or replace function public.fn_touch_atendimento_article()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists trg_touch_atendimento_article on public.atendimento_articles;
create trigger trg_touch_atendimento_article
  before update on public.atendimento_articles
  for each row execute function public.fn_touch_atendimento_article();

-- =====================================================================
-- 4. CAMPANHAS — disparo em massa (WhatsApp) e ao vivo (widget do site)
--
-- `publico` guarda os FILTROS que geraram a audiência (etapas, origens,
-- etc.) ou, no caso "ao vivo", as condições de exibição do widget
-- (URL contém, tempo na página). Guardar o filtro — e não só o
-- resultado — permite recalcular o público depois.
-- =====================================================================

create table if not exists public.atendimento_campaigns (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'disparo' check (tipo in ('ao_vivo','disparo')),
  -- Sem FK obrigatória: a campanha sobrevive à exclusão da caixa.
  inbox_id uuid references public.atendimento_inboxes(id) on delete set null,
  mensagem text,
  publico jsonb not null default '[]'::jsonb,
  agendado_para timestamptz,
  status text not null default 'rascunho'
    check (status in ('rascunho','agendada','enviando','concluida','cancelada')),
  enviados integer not null default 0,
  falhas integer not null default 0,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

create index if not exists idx_atd_campaigns_status
  on public.atendimento_campaigns(status, created_at desc);

-- =====================================================================
-- 5. ALVOS DA CAMPANHA — 1 linha por contato, com resultado do envio
--
-- É esta tabela que um worker/cron vai percorrer para disparar de fato.
-- =====================================================================

create table if not exists public.atendimento_campaign_targets (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid not null references public.atendimento_campaigns(id) on delete cascade,
  lead_id uuid not null references public.leads(id) on delete cascade,
  status text not null default 'pendente' check (status in ('pendente','enviado','falha')),
  erro text,
  enviado_em timestamptz,
  unique (campaign_id, lead_id)
);

create index if not exists idx_atd_campaign_targets_pendentes
  on public.atendimento_campaign_targets(campaign_id, status);

-- =====================================================================
-- 6. RLS — leitura e escrita para quem tem acesso ao atendimento
-- =====================================================================

do $$
declare t text;
begin
  foreach t in array array[
    'atendimento_portals','atendimento_categories','atendimento_articles',
    'atendimento_campaigns','atendimento_campaign_targets'
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
-- 7. SEEDS — portal padrão e categorias iniciais (só se vazio)
-- =====================================================================

insert into public.atendimento_portals (nome, slug, descricao, cor, idioma)
select
  'Central de Ajuda Arini', 'ajuda',
  'Artigos de autoatendimento para clientes da Arini Negócios Imobiliários.',
  '#092316', 'pt-BR'
where not exists (select 1 from public.atendimento_portals);

insert into public.atendimento_categories (portal_id, nome, slug, descricao, ordem)
select p.id, c.nome, c.slug, c.descricao, c.ordem
from public.atendimento_portals p
cross join (values
  ('Primeiros passos',  'primeiros-passos',  'Como começar a usar nossos serviços.', 0),
  ('Comprar e alugar',  'comprar-e-alugar',  'Dúvidas sobre compra, locação e documentação.', 1),
  ('Dúvidas frequentes','duvidas-frequentes','As perguntas que mais recebemos.', 2)
) as c(nome, slug, descricao, ordem)
where p.slug = 'ajuda'
  and not exists (select 1 from public.atendimento_categories);
