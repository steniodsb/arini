-- =====================================================================
-- ARINI NEGÓCIOS IMOBILIÁRIOS — CRM COMPLETO
-- Migration única idempotente. Aplique no SQL Editor do Supabase.
-- =====================================================================

-- =========== EXTENSIONS ===============================================
create extension if not exists "pgcrypto";

-- =========== ENUMS ====================================================
do $$ begin
  create type sector as enum (
    'captacao','marketing','administrativo','juridico',
    'recepcao','financeiro','admin_central'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type property_type as enum (
    'casa','apartamento','lote','terreno','fazenda',
    'sitio','chacara','comercial','galpao','rural','outros'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type property_category as enum ('venda','locacao','venda_locacao','rural');
exception when duplicate_object then null; end $$;

do $$ begin
  create type property_status as enum (
    'rascunho',
    'aguardando_aprovacao_captacao',
    'aprovado_captacao',
    'em_marketing',
    'aguardando_aprovacao_marketing',
    'publicado',
    'reservado',
    'vendido',
    'locado',
    'inativo'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type legal_status as enum (
    'nao_iniciado','em_analise','pendente','aprovado','reprovado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_stage as enum (
    'novo','atendimento','agendado','visitou',
    'proposta','negociacao','fechado','perdido','pos_venda'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_origin as enum (
    'instagram','facebook','site','whatsapp','ligacao',
    'indicacao','trafego_pago','placa','portal','outros'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_stage as enum (
    'captacao','marketing','juridico',
    'financeiro_imovel','financeiro_empresarial','outro'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type approval_status as enum (
    'pendente','aprovado','reprovado','corrigir'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type expense_status as enum (
    'pendente','pago','vencido','renegociado'
  );
exception when duplicate_object then null; end $$;

do $$ begin
  create type commission_status as enum ('pendente','parcial','pago');
exception when duplicate_object then null; end $$;

do $$ begin
  create type operation_type as enum ('venda','locacao','permuta','parceria');
exception when duplicate_object then null; end $$;

-- =========== TABLES ===================================================

-- PROFILES (1:1 com auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null,
  email text not null,
  telefone text,
  sector sector not null default 'recepcao',
  is_admin_central boolean not null default false,
  ativo boolean not null default true,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- SECTOR PERMISSIONS MATRIX
create table if not exists public.sector_permissions (
  sector sector not null,
  resource text not null,
  can_read boolean not null default false,
  can_write boolean not null default false,
  can_approve boolean not null default false,
  primary key (sector, resource)
);

-- PROPERTY CODE SEQUENCES
create table if not exists public.property_code_sequences (
  type property_type not null,
  category property_category not null,
  prefix text not null,
  next_seq int not null default 1,
  primary key (type, category)
);

-- OWNERS
create table if not exists public.owners (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf_cnpj text,
  telefone text,
  email text,
  observacoes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- PROPERTIES
create table if not exists public.properties (
  id uuid primary key default gen_random_uuid(),
  codigo text unique not null,
  type property_type not null,
  category property_category not null,
  status property_status not null default 'rascunho',
  titulo text,
  descricao text,
  endereco text,
  bairro text,
  cidade text,
  uf text,
  cep text,
  lat double precision,
  lng double precision,
  valor numeric(14,2),
  valor_fechado numeric(14,2),
  area_total numeric(12,2),
  area_construida numeric(12,2),
  dormitorios int,
  suites int,
  banheiros int,
  vagas int,
  ano_construcao int,
  captador_id uuid references public.profiles(id),
  owner_id uuid references public.owners(id),
  exclusividade boolean not null default false,
  exclusividade_de text,
  exclusividade_prazo date,
  exclusividade_contrato_url text,
  placa_status text check (placa_status in ('colocada','nao_colocada','retirada')) default 'nao_colocada',
  data_entrada date not null default current_date,
  data_fechamento date,
  fonte_leads text,
  slug_publico text unique,
  publicado_no_site boolean not null default false,
  destaque boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_properties_status on public.properties(status);
create index if not exists idx_properties_publicado on public.properties(publicado_no_site);
create index if not exists idx_properties_categoria on public.properties(category);
create index if not exists idx_properties_cidade on public.properties(cidade);

-- PROPERTY MEDIA
create table if not exists public.property_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tipo text not null check (tipo in ('imagem','video','tour','reels','drone')),
  url text not null,
  storage_path text,
  ordem int not null default 0,
  captado_com text check (captado_com in ('camera','drone','gimbal','celular','outro')),
  tamanho int,
  capa boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_media_property on public.property_media(property_id);

-- PROPERTY CAPTURE INFO
create table if not exists public.property_capture_info (
  property_id uuid primary key references public.properties(id) on delete cascade,
  utilizou_camera boolean not null default false,
  utilizou_drone boolean not null default false,
  utilizou_gimbal boolean not null default false,
  utilizou_celular boolean not null default false,
  materiais jsonb not null default '{"foto":false,"video":false,"reels":false,"tour":false,"drone":false}'::jsonb,
  relatorio_texto text,
  placa_colocada boolean not null default false,
  observacoes text,
  updated_at timestamptz not null default now()
);

-- MARKETING CAMPAIGNS
create table if not exists public.marketing_campaigns (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  plataformas jsonb not null default '{"instagram":false,"facebook":false,"site":false,"portal":false,"whatsapp":false}'::jsonb,
  tipos_conteudo jsonb not null default '{"feed":false,"reels":false,"story":false,"banner":false,"video":false,"tour_virtual":false}'::jsonb,
  responsavel_id uuid references public.profiles(id),
  data_publicacao_prevista date,
  data_publicacao_realizada date,
  observacoes text,
  link_pasta_nuvem text,
  status text not null default 'rascunho' check (status in ('rascunho','aguardando_aprovacao','publicado','reprovado')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_mkt_property on public.marketing_campaigns(property_id);

-- PROPERTY DOCUMENTS
create table if not exists public.property_documents (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  tipo text not null check (tipo in ('matricula','escritura','iptu','contrato','anexo','outro')),
  url text not null,
  storage_path text,
  nome text,
  validado_por uuid references public.profiles(id),
  validado_em timestamptz,
  observacoes text,
  created_at timestamptz not null default now()
);

-- LEGAL RECORDS
create table if not exists public.legal_records (
  id uuid primary key default gen_random_uuid(),
  property_id uuid unique not null references public.properties(id) on delete cascade,
  status legal_status not null default 'nao_iniciado',
  responsavel_id uuid references public.profiles(id),
  matricula_atualizada boolean,
  tem_onus boolean,
  apto_juridicamente boolean,
  observacoes text,
  data_analise date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- CONTRACTS
create table if not exists public.contracts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  tipo text not null check (tipo in ('captacao','exclusividade','venda','locacao','parceria','permuta')),
  partes jsonb,
  valor numeric(14,2),
  status_assinatura text not null default 'pendente' check (status_assinatura in ('pendente','digital','fisica','assinado','cancelado')),
  arquivo_url text,
  storage_path text,
  criado_por uuid references public.profiles(id),
  criado_em timestamptz not null default now(),
  assinado_em timestamptz
);

-- LEADS
create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  telefone text,
  whatsapp text,
  email text,
  origem lead_origin not null default 'site',
  interesse jsonb not null default '{"compra":false,"locacao":false,"rural":false,"urbano":false,"investimento":false}'::jsonb,
  imovel_interesse_id uuid references public.properties(id),
  stage lead_stage not null default 'novo',
  corretor_id uuid references public.profiles(id),
  perfil text,
  faixa_valor_min numeric(14,2),
  faixa_valor_max numeric(14,2),
  urgencia text check (urgencia in ('baixa','media','alta','imediata')),
  observacoes text,
  created_at timestamptz not null default now(),
  ultima_interacao_em timestamptz not null default now()
);
create index if not exists idx_leads_stage on public.leads(stage);
create index if not exists idx_leads_corretor on public.leads(corretor_id);

-- LEAD INTERACTIONS
create table if not exists public.lead_interactions (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in ('ligacao','whatsapp','reuniao','visita','proposta','email','nota','stage_change')),
  conteudo text,
  user_id uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_interactions_lead on public.lead_interactions(lead_id);

-- LEAD APPOINTMENTS
create table if not exists public.lead_appointments (
  id uuid primary key default gen_random_uuid(),
  lead_id uuid not null references public.leads(id) on delete cascade,
  tipo text not null check (tipo in ('visita','reuniao','ligacao','retorno','assinatura')),
  data_hora timestamptz not null,
  responsavel_id uuid references public.profiles(id),
  confirmado boolean not null default false,
  observacoes text,
  created_at timestamptz not null default now()
);

-- PROPERTY FINANCIALS
create table if not exists public.property_financials (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  operation_type operation_type not null,
  valor_fechado numeric(14,2) not null,
  data_fechamento date not null default current_date,
  forma_pagamento text check (forma_pagamento in ('a_vista','financiamento','parcelado','permuta')),
  comissao_pct numeric(5,2),
  comissao_valor numeric(14,2),
  divisao jsonb,
  status_comissao commission_status not null default 'pendente',
  observacoes text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- COMMISSIONS
create table if not exists public.commissions (
  id uuid primary key default gen_random_uuid(),
  property_financial_id uuid not null references public.property_financials(id) on delete cascade,
  beneficiario_id uuid references public.profiles(id),
  beneficiario_tipo text check (beneficiario_tipo in ('captador','corretor','parceiro','imobiliaria')),
  beneficiario_nome text,
  percentual numeric(5,2),
  valor numeric(14,2) not null,
  status commission_status not null default 'pendente',
  pago_em date,
  created_at timestamptz not null default now()
);

-- EXPENSE CATEGORIES
create table if not exists public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  ativo boolean not null default true
);

-- EXPENSES
create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  categoria_id uuid references public.expense_categories(id),
  fornecedor text,
  descricao text,
  valor numeric(14,2) not null,
  vencimento date not null,
  status expense_status not null default 'pendente',
  recorrencia text not null default 'none' check (recorrencia in ('none','mensal','quinzenal','anual')),
  pago_em date,
  forma_pagamento text check (forma_pagamento in ('pix','boleto','cartao','debito','transferencia')),
  comprovante_url text,
  centro_custo text,
  criado_por uuid references public.profiles(id),
  aprovado_por uuid references public.profiles(id),
  aprovado_em timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- INCOMES
create table if not exists public.incomes (
  id uuid primary key default gen_random_uuid(),
  origem text not null check (origem in ('comissao','locacao','parceria','servico','outros')),
  valor numeric(14,2) not null,
  data date not null default current_date,
  ref_property_id uuid references public.properties(id),
  ref_lead_id uuid references public.leads(id),
  descricao text,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- APPROVALS (inbox central)
create table if not exists public.approvals (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  stage approval_stage not null,
  status approval_status not null default 'pendente',
  solicitado_por uuid references public.profiles(id),
  aprovador_id uuid references public.profiles(id),
  comentario text,
  payload jsonb,
  created_at timestamptz not null default now(),
  decidido_em timestamptz
);
create index if not exists idx_approvals_status on public.approvals(status);
create index if not exists idx_approvals_entity on public.approvals(entity_table, entity_id);

-- AUDIT LOG
create table if not exists public.audit_log (
  id bigserial primary key,
  user_id uuid,
  sector sector,
  action text not null,
  entity_table text,
  entity_id uuid,
  diff jsonb,
  ip text,
  created_at timestamptz not null default now()
);
create index if not exists idx_audit_user on public.audit_log(user_id);
create index if not exists idx_audit_entity on public.audit_log(entity_table, entity_id);
create index if not exists idx_audit_created on public.audit_log(created_at desc);

-- NOTIFICATIONS
create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete cascade,
  sector sector,
  tipo text not null,
  titulo text not null,
  mensagem text,
  link text,
  payload jsonb,
  lida boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_notifications_user on public.notifications(user_id, lida);

-- LOGIN ACTIVITY
create table if not exists public.activity_log_login (
  id bigserial primary key,
  user_id uuid references public.profiles(id) on delete cascade,
  login_em timestamptz not null default now(),
  ip text,
  user_agent text
);

-- =========== FUNCTIONS ================================================

create or replace function public.fn_generate_property_code(p_type property_type, p_category property_category)
returns text language plpgsql as $$
declare
  v_prefix text;
  v_seq int;
  v_code text;
begin
  insert into public.property_code_sequences(type, category, prefix, next_seq)
  values (p_type, p_category,
    upper(left(p_type::text,2)) || upper(left(p_category::text,1)),
    1)
  on conflict (type, category) do update set next_seq = property_code_sequences.next_seq
  returning prefix, next_seq into v_prefix, v_seq;

  update public.property_code_sequences
  set next_seq = next_seq + 1
  where type = p_type and category = p_category
  returning next_seq - 1 into v_seq;

  v_code := v_prefix || '-' || lpad(v_seq::text, 5, '0');
  return v_code;
end $$;

-- Generic audit trigger
create or replace function public.fn_audit_changes()
returns trigger language plpgsql security definer as $$
declare
  v_diff jsonb;
  v_user uuid;
  v_sector sector;
begin
  v_user := auth.uid();
  select sector into v_sector from public.profiles where id = v_user;

  if TG_OP = 'DELETE' then
    v_diff := to_jsonb(OLD);
  elsif TG_OP = 'INSERT' then
    v_diff := to_jsonb(NEW);
  else
    v_diff := jsonb_build_object('old', to_jsonb(OLD), 'new', to_jsonb(NEW));
  end if;

  insert into public.audit_log(user_id, sector, action, entity_table, entity_id, diff)
  values (
    v_user, v_sector, TG_OP, TG_TABLE_NAME,
    coalesce((NEW).id, (OLD).id),
    v_diff
  );
  return coalesce(NEW, OLD);
end $$;

-- updated_at touch
create or replace function public.fn_touch_updated_at()
returns trigger language plpgsql as $$
begin
  NEW.updated_at := now();
  return NEW;
end $$;

-- Auto-create profile when a new auth user is created
create or replace function public.fn_handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.profiles(id, nome, email, sector)
  values (
    NEW.id,
    coalesce(NEW.raw_user_meta_data->>'nome', NEW.email),
    NEW.email,
    coalesce((NEW.raw_user_meta_data->>'sector')::sector, 'recepcao')
  )
  on conflict (id) do nothing;
  return NEW;
end $$;

-- helper para checagem
create or replace function public.fn_is_admin_central(uid uuid)
returns boolean language sql stable as $$
  select coalesce((select is_admin_central from public.profiles where id = uid), false);
$$;

create or replace function public.fn_user_sector(uid uuid)
returns sector language sql stable as $$
  select sector from public.profiles where id = uid;
$$;

-- =========== TRIGGERS =================================================

drop trigger if exists trg_profiles_touch on public.profiles;
create trigger trg_profiles_touch before update on public.profiles
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_properties_touch on public.properties;
create trigger trg_properties_touch before update on public.properties
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_marketing_touch on public.marketing_campaigns;
create trigger trg_marketing_touch before update on public.marketing_campaigns
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_legal_touch on public.legal_records;
create trigger trg_legal_touch before update on public.legal_records
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_expenses_touch on public.expenses;
create trigger trg_expenses_touch before update on public.expenses
  for each row execute function public.fn_touch_updated_at();

-- Audit triggers on critical tables
drop trigger if exists trg_audit_properties on public.properties;
create trigger trg_audit_properties after insert or update or delete on public.properties
  for each row execute function public.fn_audit_changes();

drop trigger if exists trg_audit_marketing on public.marketing_campaigns;
create trigger trg_audit_marketing after insert or update or delete on public.marketing_campaigns
  for each row execute function public.fn_audit_changes();

drop trigger if exists trg_audit_approvals on public.approvals;
create trigger trg_audit_approvals after insert or update or delete on public.approvals
  for each row execute function public.fn_audit_changes();

drop trigger if exists trg_audit_expenses on public.expenses;
create trigger trg_audit_expenses after insert or update or delete on public.expenses
  for each row execute function public.fn_audit_changes();

drop trigger if exists trg_audit_legal on public.legal_records;
create trigger trg_audit_legal after insert or update or delete on public.legal_records
  for each row execute function public.fn_audit_changes();

drop trigger if exists trg_audit_contracts on public.contracts;
create trigger trg_audit_contracts after insert or update or delete on public.contracts
  for each row execute function public.fn_audit_changes();

drop trigger if exists trg_audit_financials on public.property_financials;
create trigger trg_audit_financials after insert or update or delete on public.property_financials
  for each row execute function public.fn_audit_changes();

-- Auto profile
drop trigger if exists trg_auth_new_user on auth.users;
create trigger trg_auth_new_user after insert on auth.users
  for each row execute function public.fn_handle_new_user();

-- =========== RLS ======================================================
alter table public.profiles                enable row level security;
alter table public.sector_permissions      enable row level security;
alter table public.property_code_sequences enable row level security;
alter table public.owners                  enable row level security;
alter table public.properties              enable row level security;
alter table public.property_media          enable row level security;
alter table public.property_capture_info   enable row level security;
alter table public.marketing_campaigns     enable row level security;
alter table public.property_documents      enable row level security;
alter table public.legal_records           enable row level security;
alter table public.contracts               enable row level security;
alter table public.leads                   enable row level security;
alter table public.lead_interactions       enable row level security;
alter table public.lead_appointments       enable row level security;
alter table public.property_financials     enable row level security;
alter table public.commissions             enable row level security;
alter table public.expense_categories      enable row level security;
alter table public.expenses                enable row level security;
alter table public.incomes                 enable row level security;
alter table public.approvals               enable row level security;
alter table public.audit_log               enable row level security;
alter table public.notifications           enable row level security;
alter table public.activity_log_login      enable row level security;

-- Drop existing policies (idempotente)
do $$
declare r record;
begin
  for r in
    select policyname, schemaname, tablename from pg_policies where schemaname='public'
  loop
    execute format('drop policy if exists %I on %I.%I', r.policyname, r.schemaname, r.tablename);
  end loop;
end $$;

-- PROFILES
create policy "profiles_self_read" on public.profiles
  for select using (id = auth.uid() or public.fn_is_admin_central(auth.uid())
    or public.fn_user_sector(auth.uid()) = 'administrativo');
create policy "profiles_self_update" on public.profiles
  for update using (id = auth.uid() or public.fn_is_admin_central(auth.uid()));
create policy "profiles_admin_all" on public.profiles
  for all using (public.fn_is_admin_central(auth.uid()))
  with check (public.fn_is_admin_central(auth.uid()));

-- SECTOR PERMISSIONS (admin only)
create policy "perms_read_all" on public.sector_permissions for select using (auth.uid() is not null);
create policy "perms_admin_write" on public.sector_permissions for all
  using (public.fn_is_admin_central(auth.uid()))
  with check (public.fn_is_admin_central(auth.uid()));

-- SEQUENCES (read all auth)
create policy "seq_read" on public.property_code_sequences for select using (auth.uid() is not null);
create policy "seq_admin_write" on public.property_code_sequences for all
  using (public.fn_is_admin_central(auth.uid()))
  with check (public.fn_is_admin_central(auth.uid()));

-- OWNERS (administrativo, juridico, financeiro, admin_central)
create policy "owners_read" on public.owners for select using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "owners_write" on public.owners for all using (
  public.fn_user_sector(auth.uid()) in ('administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- PROPERTIES
create policy "props_read_public_anon" on public.properties for select
  using (publicado_no_site = true);
create policy "props_read_auth" on public.properties for select
  using (auth.uid() is not null);
create policy "props_insert" on public.properties for insert
  with check (public.fn_user_sector(auth.uid()) in ('captacao','administrativo','admin_central'));
create policy "props_update" on public.properties for update using (
  public.fn_is_admin_central(auth.uid())
  or public.fn_user_sector(auth.uid()) in ('administrativo','marketing','juridico','captacao','financeiro')
);
create policy "props_delete_admin" on public.properties for delete using (
  public.fn_is_admin_central(auth.uid())
  or public.fn_user_sector(auth.uid()) = 'administrativo'
);

-- PROPERTY MEDIA
create policy "media_read_public" on public.property_media for select using (
  exists (select 1 from public.properties p where p.id = property_id and p.publicado_no_site = true)
  or auth.uid() is not null
);
create policy "media_write" on public.property_media for all using (
  public.fn_user_sector(auth.uid()) in ('captacao','marketing','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('captacao','marketing','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- PROPERTY CAPTURE INFO
create policy "capture_read" on public.property_capture_info for select using (auth.uid() is not null);
create policy "capture_write" on public.property_capture_info for all using (
  public.fn_user_sector(auth.uid()) in ('captacao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('captacao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- MARKETING
create policy "mkt_read" on public.marketing_campaigns for select using (auth.uid() is not null);
create policy "mkt_write" on public.marketing_campaigns for all using (
  public.fn_user_sector(auth.uid()) in ('marketing','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('marketing','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- DOCUMENTS / LEGAL / CONTRACTS
create policy "docs_read" on public.property_documents for select using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "docs_write" on public.property_documents for all using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "legal_read" on public.legal_records for select using (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "legal_write" on public.legal_records for all using (
  public.fn_user_sector(auth.uid()) in ('juridico','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('juridico','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "contracts_read" on public.contracts for select using (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "contracts_write" on public.contracts for all using (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- LEADS (recepcao + administrativo + admin_central; criador anônimo via service role no API route)
create policy "leads_read" on public.leads for select using (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central','financeiro')
  or public.fn_is_admin_central(auth.uid())
);
create policy "leads_write" on public.leads for all using (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "interactions_read" on public.lead_interactions for select using (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "interactions_write" on public.lead_interactions for all using (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "appts_read" on public.lead_appointments for select using (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "appts_write" on public.lead_appointments for all using (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- FINANCIALS
create policy "fin_read" on public.property_financials for select using (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "fin_write" on public.property_financials for all using (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "comm_read" on public.commissions for select using (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "comm_write" on public.commissions for all using (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "expcat_read" on public.expense_categories for select using (auth.uid() is not null);
create policy "expcat_write" on public.expense_categories for all using (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "exp_read" on public.expenses for select using (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "exp_write" on public.expenses for all using (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

create policy "inc_read" on public.incomes for select using (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "inc_write" on public.incomes for all using (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- APPROVALS (todos leem, decisão administrativo/admin_central)
create policy "appr_read" on public.approvals for select using (auth.uid() is not null);
create policy "appr_insert" on public.approvals for insert with check (auth.uid() is not null);
create policy "appr_update" on public.approvals for update using (
  public.fn_user_sector(auth.uid()) in ('administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- AUDIT (admin only)
create policy "audit_read_admin" on public.audit_log for select using (
  public.fn_user_sector(auth.uid()) in ('administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- NOTIFICATIONS (self)
create policy "notif_self_read" on public.notifications for select using (
  user_id = auth.uid() or sector = public.fn_user_sector(auth.uid())
);
create policy "notif_self_update" on public.notifications for update using (
  user_id = auth.uid()
);
create policy "notif_insert_auth" on public.notifications for insert with check (auth.uid() is not null);

create policy "login_read_self" on public.activity_log_login for select using (
  user_id = auth.uid() or public.fn_is_admin_central(auth.uid())
);
create policy "login_insert" on public.activity_log_login for insert with check (auth.uid() is not null);

-- =========== SEED =====================================================

insert into public.expense_categories (nome) values
  ('Água'),('Energia'),('Internet'),('Aluguel'),('Funcionários'),
  ('Marketing'),('Sistema/CRM'),('Tráfego Pago'),('Combustível'),
  ('Jurídico'),('Impostos'),('Outros')
on conflict (nome) do nothing;

-- pre-popular sequências
insert into public.property_code_sequences(type, category, prefix, next_seq) values
  ('casa','venda','CSV',1),('casa','locacao','CSL',1),
  ('apartamento','venda','APV',1),('apartamento','locacao','APL',1),
  ('lote','venda','LTV',1),('terreno','venda','TRV',1),
  ('fazenda','rural','FZR',1),('sitio','rural','STR',1),
  ('chacara','rural','CHR',1),('comercial','venda','CMV',1),
  ('comercial','locacao','CML',1),('galpao','locacao','GPL',1),
  ('rural','rural','RUR',1),('outros','venda','OUV',1)
on conflict (type, category) do nothing;

-- matriz de permissões (informativa — políticas reais estão nas RLS acima)
insert into public.sector_permissions(sector, resource, can_read, can_write, can_approve) values
  ('captacao','properties',true,true,false),
  ('captacao','property_media',true,true,false),
  ('marketing','properties',true,true,false),
  ('marketing','marketing_campaigns',true,true,false),
  ('administrativo','*',true,true,true),
  ('juridico','legal_records',true,true,false),
  ('juridico','contracts',true,true,false),
  ('recepcao','leads',true,true,false),
  ('financeiro','property_financials',true,true,false),
  ('financeiro','expenses',true,true,false),
  ('admin_central','*',true,true,true)
on conflict do nothing;
