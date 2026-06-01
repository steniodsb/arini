-- =====================================================================
-- 0009 — CLIENTES, CAIXA/CONTAS, PONTO, COMISSÕES GERAIS, MARKETING,
--        INTEGRAÇÕES SOCIAIS E TRAVA DE EDIÇÃO POR APROVAÇÃO
-- Idempotente. Aplique após 0008.
-- =====================================================================

-- =========== ENUMS: novas origens de lead ============================
-- (ADD VALUE IF NOT EXISTS é permitido fora/dentro de transação no PG12+,
--  desde que o valor não seja usado na MESMA transação.)
alter type lead_origin add value if not exists 'tiktok';
alter type lead_origin add value if not exists 'messenger';

-- =====================================================================
-- CLIENTES (cadastro de clientes + tipo de cliente)
-- =====================================================================
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  tipo text not null default 'comprador',
  -- comprador, vendedor, locatario, locador, proprietario, fornecedor, parceiro, investidor, outro
  cpf_cnpj text,
  telefone text,
  whatsapp text,
  email text,
  endereco text,
  cidade text,
  uf text,
  observacoes text,
  ativo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_clients_tipo on public.clients(tipo);
create index if not exists idx_clients_nome on public.clients(nome);

-- DOCUMENTOS DE CLIENTES (aba "Documentos" do jurídico)
create table if not exists public.client_documents (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete cascade,
  tipo text not null default 'outro',
  -- contrato, procuracao, rg_cpf, comprovante, certidao, escritura, outro
  nome text,
  url text not null,
  storage_path text,
  status text not null default 'pendente' check (status in ('pendente','entregue','assinado','cancelado')),
  observacoes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_client_docs_client on public.client_documents(client_id);

-- =====================================================================
-- CONTAS BANCÁRIAS / CAIXA (controle de saldo)
-- =====================================================================
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  nome text not null,                  -- ex.: "Caixa", "Banco do Brasil C/C"
  banco text,
  agencia text,
  conta text,
  tipo text not null default 'conta_corrente'
    check (tipo in ('conta_corrente','poupanca','caixa','investimento')),
  saldo_inicial numeric(14,2) not null default 0,
  ativo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- FINANCEIRO: vínculo com contas, datas e tipo de gasto
-- =====================================================================
-- EXPENSES: conta, tipo de gasto (empresa/imóvel/cliente), datas, vínculos
alter table public.expenses add column if not exists conta_id uuid references public.bank_accounts(id);
alter table public.expenses add column if not exists tipo_gasto text not null default 'empresa'
  check (tipo_gasto in ('empresa','imovel','cliente'));
alter table public.expenses add column if not exists property_id uuid references public.properties(id);
alter table public.expenses add column if not exists client_id uuid references public.clients(id);
alter table public.expenses add column if not exists data_inicio date;
alter table public.expenses add column if not exists data_fechamento date;

-- INCOMES: conta + datas
alter table public.incomes add column if not exists conta_id uuid references public.bank_accounts(id);
alter table public.incomes add column if not exists data_fechamento date;
alter table public.incomes add column if not exists client_id uuid references public.clients(id);

-- PROPERTY FINANCIALS: data de início (fechamento já existe) + conta
alter table public.property_financials add column if not exists data_inicio date;
alter table public.property_financials add column if not exists conta_id uuid references public.bank_accounts(id);

-- COMMISSIONS: comissões GERAIS (não só de imóvel) + datas
alter table public.commissions alter column property_financial_id drop not null;
alter table public.commissions add column if not exists tipo text not null default 'imovel'
  check (tipo in ('imovel','geral'));
alter table public.commissions add column if not exists descricao text;
alter table public.commissions add column if not exists data_inicio date;
alter table public.commissions add column if not exists data_fechamento date;
alter table public.commissions add column if not exists conta_id uuid references public.bank_accounts(id);
alter table public.commissions add column if not exists criado_por uuid references public.profiles(id);

-- VIEW: saldo atual por conta = saldo_inicial + entradas - saídas (pagas)
create or replace view public.bank_account_balances
  with (security_invoker = true) as
  select
    b.id,
    b.nome,
    b.banco,
    b.tipo,
    b.ativo,
    b.saldo_inicial,
    b.saldo_inicial
      + coalesce((select sum(i.valor) from public.incomes i where i.conta_id = b.id), 0)
      - coalesce((select sum(e.valor) from public.expenses e where e.conta_id = b.id and e.status = 'pago'), 0)
      as saldo_atual
  from public.bank_accounts b;

-- =====================================================================
-- MARKETING: gate de envio + mídias (bruta/editada) + conteúdos datados
-- =====================================================================
-- Gate: captação precisa ENVIAR explicitamente para o marketing.
alter table public.properties add column if not exists enviado_para_marketing boolean not null default false;
alter table public.properties add column if not exists enviado_marketing_em timestamptz;
alter table public.properties add column if not exists enviado_marketing_por uuid references public.profiles(id);

-- Mídias do marketing (brutas recebidas + editadas para subir)
create table if not exists public.marketing_media (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  fase text not null default 'editada' check (fase in ('bruta','editada')),
  tipo text not null default 'imagem' check (tipo in ('imagem','video','tour','reels','drone','arquivo')),
  url text not null,
  storage_path text,
  ordem int not null default 0,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_mkt_media_property on public.marketing_media(property_id);

-- Conteúdos de marketing com DATA de publicação por item
create table if not exists public.marketing_contents (
  id uuid primary key default gen_random_uuid(),
  campaign_id uuid references public.marketing_campaigns(id) on delete cascade,
  property_id uuid references public.properties(id) on delete cascade,
  tipo text not null default 'feed'
    check (tipo in ('feed','reels','story','banner','video','tour_virtual','outro')),
  titulo text,
  data_publicacao date,
  publicado boolean not null default false,
  observacoes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_mkt_contents_campaign on public.marketing_contents(campaign_id);

-- =====================================================================
-- PONTO ELETRÔNICO
-- =====================================================================
create table if not exists public.time_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  tipo text not null check (tipo in ('entrada','intervalo_inicio','intervalo_fim','saida')),
  registrado_em timestamptz not null default now(),
  origem text not null default 'web',
  observacoes text,
  created_at timestamptz not null default now()
);
create index if not exists idx_time_entries_user on public.time_entries(user_id, registrado_em desc);

-- =====================================================================
-- INTEGRAÇÕES SOCIAIS (credenciais de IG/FB/WhatsApp/TikTok)
-- =====================================================================
create table if not exists public.social_integrations (
  id uuid primary key default gen_random_uuid(),
  plataforma text unique not null
    check (plataforma in ('instagram','facebook','whatsapp','tiktok')),
  ativo boolean not null default false,
  config jsonb not null default '{}'::jsonb,  -- tokens, page_id, verify_token, etc.
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

-- LEADS: campos para mensagens recebidas via webhook
alter table public.leads add column if not exists mensagem text;
alter table public.leads add column if not exists external_id text;
alter table public.leads add column if not exists raw_payload jsonb;

insert into public.social_integrations (plataforma) values
  ('instagram'),('facebook'),('whatsapp'),('tiktok')
on conflict (plataforma) do nothing;

-- =====================================================================
-- TRIGGERS: updated_at
-- =====================================================================
drop trigger if exists trg_clients_touch on public.clients;
create trigger trg_clients_touch before update on public.clients
  for each row execute function public.fn_touch_updated_at();

drop trigger if exists trg_bank_touch on public.bank_accounts;
create trigger trg_bank_touch before update on public.bank_accounts
  for each row execute function public.fn_touch_updated_at();

-- Auditoria em dinheiro/comissões/clientes
drop trigger if exists trg_audit_commissions on public.commissions;
create trigger trg_audit_commissions after insert or update or delete on public.commissions
  for each row execute function public.fn_audit_changes();

drop trigger if exists trg_audit_incomes on public.incomes;
create trigger trg_audit_incomes after insert or update or delete on public.incomes
  for each row execute function public.fn_audit_changes();

-- =====================================================================
-- RLS
-- =====================================================================
alter table public.clients              enable row level security;
alter table public.client_documents     enable row level security;
alter table public.bank_accounts         enable row level security;
alter table public.marketing_media       enable row level security;
alter table public.marketing_contents    enable row level security;
alter table public.time_entries          enable row level security;
alter table public.social_integrations   enable row level security;

-- ---- CLIENTS ---------------------------------------------------------
drop policy if exists "clients_read" on public.clients;
drop policy if exists "clients_write" on public.clients;
create policy "clients_read" on public.clients for select using (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','financeiro','recepcao','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "clients_write" on public.clients for all using (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- ---- CLIENT DOCUMENTS ------------------------------------------------
drop policy if exists "cdocs_read" on public.client_documents;
drop policy if exists "cdocs_write" on public.client_documents;
create policy "cdocs_read" on public.client_documents for select using (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "cdocs_write" on public.client_documents for all using (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- ---- BANK ACCOUNTS ---------------------------------------------------
-- Leitura: financeiro/administrativo/diretoria. Escrita: só diretoria.
drop policy if exists "bank_read" on public.bank_accounts;
drop policy if exists "bank_write_diretoria" on public.bank_accounts;
create policy "bank_read" on public.bank_accounts for select using (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "bank_write_diretoria" on public.bank_accounts for all
  using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));

-- ---- MARKETING MEDIA / CONTENTS -------------------------------------
drop policy if exists "mktmedia_read" on public.marketing_media;
drop policy if exists "mktmedia_write" on public.marketing_media;
create policy "mktmedia_read" on public.marketing_media for select using (auth.uid() is not null);
create policy "mktmedia_write" on public.marketing_media for all using (
  public.fn_user_sector(auth.uid()) in ('marketing','captacao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('marketing','captacao','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

drop policy if exists "mktcontents_read" on public.marketing_contents;
drop policy if exists "mktcontents_write" on public.marketing_contents;
create policy "mktcontents_read" on public.marketing_contents for select using (auth.uid() is not null);
create policy "mktcontents_write" on public.marketing_contents for all using (
  public.fn_user_sector(auth.uid()) in ('marketing','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('marketing','administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

-- ---- TIME ENTRIES (ponto) -------------------------------------------
-- Cada usuário registra/lê o próprio ponto; diretoria/administrativo veem todos.
drop policy if exists "time_read" on public.time_entries;
drop policy if exists "time_insert_self" on public.time_entries;
create policy "time_read" on public.time_entries for select using (
  user_id = auth.uid()
  or public.fn_user_sector(auth.uid()) in ('administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "time_insert_self" on public.time_entries for insert
  with check (user_id = auth.uid());

-- ---- SOCIAL INTEGRATIONS (só diretoria configura) -------------------
drop policy if exists "social_read" on public.social_integrations;
drop policy if exists "social_write_diretoria" on public.social_integrations;
create policy "social_read" on public.social_integrations for select using (
  public.fn_user_sector(auth.uid()) in ('marketing','administrativo','recepcao','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "social_write_diretoria" on public.social_integrations for all
  using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));

-- =====================================================================
-- PROPERTIES: trava de edição por status/setor (antes da aprovação)
-- =====================================================================
-- Regra: diretoria e administrativo editam sempre. Captação só edita o
-- próprio imóvel enquanto ainda não aprovado. Marketing edita quando o
-- imóvel está na fase de marketing. Jurídico edita campos jurídicos.
drop policy if exists "props_update" on public.properties;
create policy "props_update" on public.properties for update using (
  public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) = 'administrativo'
  or (
    public.fn_user_sector(auth.uid()) = 'captacao'
    and captador_id = auth.uid()
    and status in ('rascunho','aguardando_aprovacao_captacao','aprovado_captacao')
  )
  or (
    public.fn_user_sector(auth.uid()) = 'marketing'
    and status in ('aprovado_captacao','em_marketing','aguardando_aprovacao_marketing')
  )
  or public.fn_user_sector(auth.uid()) = 'juridico'
);

-- =====================================================================
-- STORAGE: buckets de marketing e documentos de clientes
-- =====================================================================
insert into storage.buckets (id, name, public)
values
  ('marketing-media', 'marketing-media', true),
  ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

update storage.buckets
set file_size_limit = 1073741824, allowed_mime_types = null
where id = 'marketing-media';

update storage.buckets
set file_size_limit = 104857600
where id = 'client-documents';

do $$ begin
  drop policy if exists "marketing-media read public" on storage.objects;
  drop policy if exists "marketing-media write" on storage.objects;
  drop policy if exists "client-documents read" on storage.objects;
  drop policy if exists "client-documents write" on storage.objects;
end $$;

create policy "marketing-media read public" on storage.objects for select
  using (bucket_id = 'marketing-media');
create policy "marketing-media write" on storage.objects for all
  using (
    bucket_id = 'marketing-media'
    and (
      public.fn_user_sector(auth.uid()) in ('captacao','marketing','administrativo','admin_central')
      or public.fn_is_admin_central(auth.uid())
    )
  )
  with check (
    bucket_id = 'marketing-media'
    and (
      public.fn_user_sector(auth.uid()) in ('captacao','marketing','administrativo','admin_central')
      or public.fn_is_admin_central(auth.uid())
    )
  );

create policy "client-documents read" on storage.objects for select
  using (
    bucket_id = 'client-documents'
    and public.fn_user_sector(auth.uid()) in ('juridico','administrativo','financeiro','admin_central')
  );
create policy "client-documents write" on storage.objects for all
  using (
    bucket_id = 'client-documents'
    and public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  )
  with check (
    bucket_id = 'client-documents'
    and public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  );
