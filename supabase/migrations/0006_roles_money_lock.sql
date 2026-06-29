-- =====================================================================
-- 0006 — MODELO DE PAPÉIS (Gerência x Diretoria) + TRAVA DE DINHEIRO
-- Idempotente. Aplique após 0005.
--
-- Regra de negócio:
--   • Diretoria  = admin_central (flag is_admin_central OU sector='admin_central')
--                  → pode aprovar, EDITAR e EXCLUIR lançamentos e pedir relatórios.
--   • Gerência   = sector='administrativo' (e 'financeiro', que "entra no administrativo")
--                  → pode LANÇAR/CRIAR, mas NÃO edita nem exclui lançamentos de dinheiro.
-- =====================================================================

-- =========== HELPER ===================================================
create or replace function public.fn_is_diretoria(uid uuid)
returns boolean language sql stable as $$
  select coalesce(
    (select is_admin_central or sector = 'admin_central'
       from public.profiles where id = uid),
    false
  );
$$;

-- =========== TRAVA DE DINHEIRO ========================================
-- Para cada tabela financeira: INSERT liberado p/ gerência+financeiro+diretoria,
-- mas UPDATE/DELETE somente diretoria.

-- ---- EXPENSES --------------------------------------------------------
drop policy if exists "exp_write" on public.expenses;
drop policy if exists "exp_insert" on public.expenses;
drop policy if exists "exp_update_diretoria" on public.expenses;
drop policy if exists "exp_delete_diretoria" on public.expenses;

create policy "exp_insert" on public.expenses for insert with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_diretoria(auth.uid())
);
create policy "exp_update_diretoria" on public.expenses for update
  using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));
create policy "exp_delete_diretoria" on public.expenses for delete
  using (public.fn_is_diretoria(auth.uid()));

-- ---- INCOMES ---------------------------------------------------------
drop policy if exists "inc_write" on public.incomes;
drop policy if exists "inc_insert" on public.incomes;
drop policy if exists "inc_update_diretoria" on public.incomes;
drop policy if exists "inc_delete_diretoria" on public.incomes;

create policy "inc_insert" on public.incomes for insert with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_diretoria(auth.uid())
);
create policy "inc_update_diretoria" on public.incomes for update
  using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));
create policy "inc_delete_diretoria" on public.incomes for delete
  using (public.fn_is_diretoria(auth.uid()));

-- ---- PROPERTY FINANCIALS --------------------------------------------
drop policy if exists "fin_write" on public.property_financials;
drop policy if exists "fin_insert" on public.property_financials;
drop policy if exists "fin_update_diretoria" on public.property_financials;
drop policy if exists "fin_delete_diretoria" on public.property_financials;

create policy "fin_insert" on public.property_financials for insert with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_diretoria(auth.uid())
);
create policy "fin_update_diretoria" on public.property_financials for update
  using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));
create policy "fin_delete_diretoria" on public.property_financials for delete
  using (public.fn_is_diretoria(auth.uid()));

-- ---- COMMISSIONS -----------------------------------------------------
drop policy if exists "comm_write" on public.commissions;
drop policy if exists "comm_insert" on public.commissions;
drop policy if exists "comm_update_diretoria" on public.commissions;
drop policy if exists "comm_delete_diretoria" on public.commissions;

create policy "comm_insert" on public.commissions for insert with check (
  public.fn_user_sector(auth.uid()) in ('financeiro','administrativo','admin_central')
  or public.fn_is_diretoria(auth.uid())
);
create policy "comm_update_diretoria" on public.commissions for update
  using (public.fn_is_diretoria(auth.uid()))
  with check (public.fn_is_diretoria(auth.uid()));
create policy "comm_delete_diretoria" on public.commissions for delete
  using (public.fn_is_diretoria(auth.uid()));

-- =========== PROPERTIES: editar/excluir antes da aprovação ============
-- Captador pode excluir o próprio imóvel enquanto ainda não foi aprovado.
drop policy if exists "props_delete_admin" on public.properties;
create policy "props_delete_admin" on public.properties for delete using (
  public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) = 'administrativo'
  or (
    public.fn_user_sector(auth.uid()) = 'captacao'
    and captador_id = auth.uid()
    and status in ('rascunho','aguardando_aprovacao_captacao','aprovado_captacao')
  )
);
