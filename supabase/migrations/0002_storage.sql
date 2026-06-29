-- =====================================================================
-- STORAGE BUCKETS + POLICIES — Arini
-- Rodar após 0001_complete_schema.sql
-- =====================================================================

insert into storage.buckets (id, name, public)
values
  ('property-media', 'property-media', true),
  ('property-documents', 'property-documents', false),
  ('expense-receipts', 'expense-receipts', false),
  ('contracts', 'contracts', false),
  ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Política: property-media (público para leitura, write para captação/marketing/admin)
do $$ begin
  drop policy if exists "property-media read public" on storage.objects;
  drop policy if exists "property-media write" on storage.objects;
  drop policy if exists "property-documents read auth" on storage.objects;
  drop policy if exists "property-documents write" on storage.objects;
  drop policy if exists "avatars read public" on storage.objects;
  drop policy if exists "avatars write self" on storage.objects;
  drop policy if exists "expense-receipts read" on storage.objects;
  drop policy if exists "expense-receipts write" on storage.objects;
  drop policy if exists "contracts read" on storage.objects;
  drop policy if exists "contracts write" on storage.objects;
end $$;

create policy "property-media read public" on storage.objects for select
  using (bucket_id = 'property-media');
create policy "property-media write" on storage.objects for all
  using (
    bucket_id = 'property-media'
    and (
      public.fn_user_sector(auth.uid()) in ('captacao','marketing','administrativo','admin_central')
      or public.fn_is_admin_central(auth.uid())
    )
  )
  with check (
    bucket_id = 'property-media'
    and (
      public.fn_user_sector(auth.uid()) in ('captacao','marketing','administrativo','admin_central')
      or public.fn_is_admin_central(auth.uid())
    )
  );

create policy "property-documents read auth" on storage.objects for select
  using (
    bucket_id = 'property-documents'
    and public.fn_user_sector(auth.uid()) in ('administrativo','juridico','financeiro','admin_central')
  );
create policy "property-documents write" on storage.objects for all
  using (
    bucket_id = 'property-documents'
    and public.fn_user_sector(auth.uid()) in ('administrativo','juridico','admin_central')
  )
  with check (
    bucket_id = 'property-documents'
    and public.fn_user_sector(auth.uid()) in ('administrativo','juridico','admin_central')
  );

create policy "avatars read public" on storage.objects for select
  using (bucket_id = 'avatars');
create policy "avatars write self" on storage.objects for all
  using (bucket_id = 'avatars' and auth.uid() is not null)
  with check (bucket_id = 'avatars' and auth.uid() is not null);

create policy "expense-receipts read" on storage.objects for select
  using (
    bucket_id = 'expense-receipts'
    and public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  );
create policy "expense-receipts write" on storage.objects for all
  using (
    bucket_id = 'expense-receipts'
    and public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  )
  with check (
    bucket_id = 'expense-receipts'
    and public.fn_user_sector(auth.uid()) in ('financeiro','admin_central')
  );

create policy "contracts read" on storage.objects for select
  using (
    bucket_id = 'contracts'
    and public.fn_user_sector(auth.uid()) in ('juridico','administrativo','financeiro','admin_central')
  );
create policy "contracts write" on storage.objects for all
  using (
    bucket_id = 'contracts'
    and public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  )
  with check (
    bucket_id = 'contracts'
    and public.fn_user_sector(auth.uid()) in ('juridico','administrativo','admin_central')
  );
