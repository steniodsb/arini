-- =====================================================================
-- 0026 — ACESSO AO SISTEMA DE ATENDIMENTO (login separado)
-- O Atendimento é um sistema à parte (atendimento.<dominio>), com login
-- próprio. Mesmo pool de usuários do Supabase Auth, mas o acesso é
-- controlado por uma flag dedicada: dá para ter um atendente que NUNCA
-- entra no CRM, e alguém do CRM liberado nos dois.
-- Idempotente. Aplique após 0025.
-- =====================================================================

alter table public.profiles
  add column if not exists atendimento_access boolean not null default false;

comment on column public.profiles.atendimento_access is
  'Libera o acesso ao sistema de Atendimento (atendimento.<dominio>). Independente do setor do CRM.';

-- Diretoria entra sempre; os demais dependem da flag.
create or replace function public.fn_has_atendimento(uid uuid)
returns boolean language sql stable as $$
  select coalesce(
    (select atendimento_access or is_admin_central from public.profiles where id = uid),
    false
  );
$$;

-- =========== RLS: conversas/mensagens reconhecem o atendente ==========
-- Antes o acesso era só por setor do CRM. Agora quem tem a flag de
-- atendimento também enxerga as conversas (é o operador do sistema novo).
drop policy if exists "conv_read" on public.conversations;
drop policy if exists "conv_write" on public.conversations;
drop policy if exists "msg_read" on public.messages;
drop policy if exists "msg_write" on public.messages;

create policy "conv_read" on public.conversations for select using (
  public.fn_has_atendimento(auth.uid())
  or public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or setor_responsavel = public.fn_user_sector(auth.uid())
);
create policy "conv_write" on public.conversations for all using (
  public.fn_has_atendimento(auth.uid())
  or public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or setor_responsavel = public.fn_user_sector(auth.uid())
) with check (
  public.fn_has_atendimento(auth.uid())
  or public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or setor_responsavel = public.fn_user_sector(auth.uid())
);

create policy "msg_read" on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (
        public.fn_has_atendimento(auth.uid())
        or public.fn_is_diretoria(auth.uid())
        or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
        or c.setor_responsavel = public.fn_user_sector(auth.uid())
      )
  )
);
create policy "msg_write" on public.messages for all using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (
        public.fn_has_atendimento(auth.uid())
        or public.fn_is_diretoria(auth.uid())
        or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
        or c.setor_responsavel = public.fn_user_sector(auth.uid())
      )
  )
) with check (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (
        public.fn_has_atendimento(auth.uid())
        or public.fn_is_diretoria(auth.uid())
        or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
        or c.setor_responsavel = public.fn_user_sector(auth.uid())
      )
  )
);

-- O atendente precisa ler os leads ligados às conversas (contexto do CRM),
-- mesmo sem pertencer aos setores do CRM.
drop policy if exists "leads_read_atendimento" on public.leads;
create policy "leads_read_atendimento" on public.leads for select using (
  public.fn_has_atendimento(auth.uid())
);
