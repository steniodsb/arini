-- =====================================================================
-- FIX:
--   1. "Database error querying schema" no login causado por colunas
--      de token NULL em auth.users (GoTrue espera string vazia).
--   2. Função fn_handle_new_user (SECURITY DEFINER) precisa de
--      search_path explícito e permissão para supabase_auth_admin.
-- =====================================================================

-- 1. Normaliza tokens NULL para '' em auth.users (idempotente)
update auth.users set
  confirmation_token         = coalesce(confirmation_token, ''),
  recovery_token             = coalesce(recovery_token, ''),
  email_change_token_new     = coalesce(email_change_token_new, ''),
  email_change               = coalesce(email_change, ''),
  phone_change               = coalesce(phone_change, ''),
  phone_change_token         = coalesce(phone_change_token, ''),
  email_change_token_current = coalesce(email_change_token_current, ''),
  reauthentication_token     = coalesce(reauthentication_token, '')
where
  confirmation_token is null
  or recovery_token is null
  or email_change_token_new is null
  or email_change is null
  or phone_change is null
  or phone_change_token is null
  or email_change_token_current is null
  or reauthentication_token is null;

-- 2. Garante permissões para o role do GoTrue
grant usage on schema public to supabase_auth_admin;
grant select, insert, update on public.profiles to supabase_auth_admin;

-- 3. Recria a função com search_path explícito (qualificando tudo)
create or replace function public.fn_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into public.profiles(id, nome, email, sector)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', new.email),
    new.email,
    coalesce((new.raw_user_meta_data->>'sector')::public.sector, 'recepcao'::public.sector)
  )
  on conflict (id) do nothing;
  return new;
exception when others then
  -- nunca derrubar o login por erro no profile
  return new;
end $$;

-- 3. Recria o trigger garantindo que está vinculado certo
drop trigger if exists trg_auth_new_user on auth.users;
create trigger trg_auth_new_user
  after insert on auth.users
  for each row execute function public.fn_handle_new_user();
