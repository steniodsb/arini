-- =====================================================================
-- 0019 — GESTÃO DE ALUGUÉIS (locação): contratos + recebíveis/repasses
-- Idempotente. Aplique após 0018 (que adiciona o setor 'aluguel').
--
-- Regra de negócio (decisão do cliente):
--   Dentro do financeiro de imóveis existe uma gestão de aluguéis. Ela puxa do
--   CRM os imóveis que estão alugados (status 'locado'), guarda o contrato de
--   locação e os pagamentos, e controla: vencimento do aluguel (inquilino),
--   repasse ao proprietário e se o inquilino está em dia ou atrasado.
--   Comunica com: financeiro-imóvel (valores), administrativo/diretoria
--   (controle total) e jurídico (parte jurídica). Acesso também ao setor
--   'aluguel' (perfil dedicado futuro).
-- =====================================================================

-- ---------------------------------------------------------------------
-- CONTRATOS DE LOCAÇÃO
-- ---------------------------------------------------------------------
create table if not exists public.lease_contracts (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  owner_id uuid references public.owners(id),            -- proprietário (repasse)
  client_id uuid references public.clients(id),          -- inquilino/locatário (cadastro)
  inquilino_nome text,                                   -- fallback sem cadastro
  inquilino_telefone text,
  valor_aluguel numeric(14,2) not null default 0,
  taxa_administracao numeric(6,2) not null default 0,    -- % retido pela imobiliária
  dia_vencimento int not null default 10
    check (dia_vencimento between 1 and 31),             -- dia do mês que o inquilino paga
  dias_repasse int not null default 5,                   -- dias após o pagamento p/ repassar
  data_inicio date not null default current_date,
  data_fim date,
  contrato_url text,                                     -- link/arquivo do contrato de locação
  status text not null default 'ativo'
    check (status in ('ativo','encerrado','suspenso')),
  observacoes text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists idx_lease_contracts_property on public.lease_contracts(property_id);
create index if not exists idx_lease_contracts_status on public.lease_contracts(status);

-- ---------------------------------------------------------------------
-- RECEBÍVEIS DE ALUGUEL (parcelas mensais + repasse)
-- ---------------------------------------------------------------------
create table if not exists public.lease_payments (
  id uuid primary key default gen_random_uuid(),
  contract_id uuid not null references public.lease_contracts(id) on delete cascade,
  competencia date not null,             -- mês de referência (sempre dia 1)
  vencimento date not null,              -- vencimento do aluguel (inquilino)
  valor numeric(14,2) not null default 0,
  status text not null default 'pendente'
    check (status in ('pendente','pago','atrasado','cancelado')),
  pago_em date,
  repasse_vencimento date,               -- data prevista de repasse ao proprietário
  valor_repasse numeric(14,2),           -- valor - taxa de administração
  repasse_status text not null default 'pendente'
    check (repasse_status in ('pendente','repassado','retido')),
  repasse_em date,
  conta_id uuid references public.bank_accounts(id),
  observacoes text,
  created_at timestamptz not null default now(),
  unique (contract_id, competencia)
);
create index if not exists idx_lease_payments_contract on public.lease_payments(contract_id);
create index if not exists idx_lease_payments_vencimento on public.lease_payments(vencimento);
create index if not exists idx_lease_payments_status on public.lease_payments(status);

-- updated_at automático nos contratos
create or replace function public.fn_lease_touch()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
drop trigger if exists trg_lease_touch on public.lease_contracts;
create trigger trg_lease_touch before update on public.lease_contracts
  for each row execute function public.fn_lease_touch();

-- ---------------------------------------------------------------------
-- RLS — controle interno (administrativo, jurídico, financeiro, diretoria
-- e o perfil dedicado 'aluguel'). Escrita exclui jurídico (somente leitura).
-- ---------------------------------------------------------------------
alter table public.lease_contracts enable row level security;
alter table public.lease_payments  enable row level security;

drop policy if exists "lease_contracts_read"  on public.lease_contracts;
drop policy if exists "lease_contracts_write" on public.lease_contracts;
create policy "lease_contracts_read" on public.lease_contracts for select using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','financeiro','aluguel','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "lease_contracts_write" on public.lease_contracts for all using (
  public.fn_user_sector(auth.uid()) in ('administrativo','financeiro','aluguel','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('administrativo','financeiro','aluguel','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

drop policy if exists "lease_payments_read"  on public.lease_payments;
drop policy if exists "lease_payments_write" on public.lease_payments;
create policy "lease_payments_read" on public.lease_payments for select using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','financeiro','aluguel','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "lease_payments_write" on public.lease_payments for all using (
  public.fn_user_sector(auth.uid()) in ('administrativo','financeiro','aluguel','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('administrativo','financeiro','aluguel','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
