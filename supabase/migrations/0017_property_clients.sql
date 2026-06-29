-- =====================================================================
-- 0017 — VÍNCULO CLIENTE ↔ IMÓVEL (origem / controle interno)
-- Idempotente. Aplique após 0016.
--
-- Regra de negócio (decisão do cliente):
--   O administrativo/jurídico precisa registrar de QUEM veio o imóvel
--   (parceiro que trouxe, vendedor dono, proprietário, etc.) reaproveitando
--   o CADASTRO DE CLIENTES já existente. Um cliente (ex.: um parceiro) pode
--   estar ligado a vários imóveis; um imóvel pode ter vários clientes ligados
--   (ex.: vendedor + parceiro que indicou).
--
--   Este é um CONTROLE INTERNO: visível apenas para administrativo, jurídico
--   e diretoria (admin_central). Os demais setores NÃO enxergam.
-- =====================================================================

create table if not exists public.property_clients (
  id uuid primary key default gen_random_uuid(),
  property_id uuid not null references public.properties(id) on delete cascade,
  client_id uuid not null references public.clients(id) on delete cascade,
  -- papel reaproveita os tipos de cliente (comprador, vendedor, parceiro, …)
  papel text not null default 'parceiro' check (papel in (
    'comprador','vendedor','locatario','locador','proprietario',
    'fornecedor','parceiro','investidor','outro'
  )),
  observacao text,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  -- evita duplicar exatamente o mesmo vínculo (mesmo cliente, mesmo papel)
  unique (property_id, client_id, papel)
);
create index if not exists idx_property_clients_property on public.property_clients(property_id);
create index if not exists idx_property_clients_client on public.property_clients(client_id);

alter table public.property_clients enable row level security;

-- Leitura e escrita restritas ao controle interno: administrativo, jurídico e diretoria.
drop policy if exists "property_clients_read" on public.property_clients;
drop policy if exists "property_clients_write" on public.property_clients;
create policy "property_clients_read" on public.property_clients for select using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
create policy "property_clients_write" on public.property_clients for all using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
