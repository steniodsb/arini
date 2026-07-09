-- =====================================================================
-- Cadastro de CORRETORES como PESSOA (diretorio), separado de "cliente" e
-- "proprietario". Cada tipo de pessoa tem seu proprio cadastro e visualizacao.
--
-- Um corretor com login no sistema pode ser vinculado ao seu usuario
-- (user_id -> profiles); corretores sem login (parceiros) ficam com user_id
-- nulo. Decisao do cliente: o campo corretor_id de leads/imoveis continua
-- apontando para profiles (so quem tem login e atribuido como responsavel);
-- esta tabela e o diretorio de pessoas + vinculo opcional ao usuario.
--
-- Idempotente (create table if not exists + drop/create policy).
-- =====================================================================

create table if not exists public.corretores (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  cpf_cnpj text,
  creci text,
  telefone text,
  email text,
  observacoes text,
  user_id uuid unique references public.profiles(id) on delete set null,
  ativo boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

alter table public.corretores enable row level security;

drop policy if exists "corretores_read" on public.corretores;
create policy "corretores_read" on public.corretores for select using (
  public.fn_user_sector(auth.uid()) in ('administrativo','juridico','financeiro','admin_central')
  or public.fn_is_admin_central(auth.uid())
);

drop policy if exists "corretores_write" on public.corretores;
create policy "corretores_write" on public.corretores for all using (
  public.fn_user_sector(auth.uid()) in ('administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
) with check (
  public.fn_user_sector(auth.uid()) in ('administrativo','admin_central')
  or public.fn_is_admin_central(auth.uid())
);
