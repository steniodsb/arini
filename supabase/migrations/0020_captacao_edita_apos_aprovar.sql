-- =====================================================================
-- 0020 — CAPTAÇÃO PODE EDITAR O PRÓPRIO IMÓVEL EM QUALQUER STATUS
-- Idempotente. Aplique após 0019.
--
-- Decisão do cliente (revisa a trava do 0009): a captação precisa conseguir
-- corrigir/editar o PRÓPRIO imóvel mesmo DEPOIS de aprovado (antes só era
-- permitido nos status de pré-aprovação). Diretoria, administrativo e jurídico
-- seguem editando sempre; marketing segue editando na fase de marketing.
--
-- Observação: a EXCLUSÃO do imóvel pela captação continua restrita ao período
-- pré-aprovação (policy props_delete_admin / regra de negócio) — aqui só
-- liberamos a EDIÇÃO.
-- =====================================================================

drop policy if exists "props_update" on public.properties;
create policy "props_update" on public.properties for update using (
  public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) = 'administrativo'
  or (
    -- Captação edita o PRÓPRIO imóvel em qualquer status (antes era restrito
    -- a 'rascunho','aguardando_aprovacao_captacao','aprovado_captacao').
    public.fn_user_sector(auth.uid()) = 'captacao'
    and captador_id = auth.uid()
  )
  or (
    public.fn_user_sector(auth.uid()) = 'marketing'
    and status in ('aprovado_captacao','em_marketing','aguardando_aprovacao_marketing')
  )
  or public.fn_user_sector(auth.uid()) = 'juridico'
);

-- Nota sobre observações por setor: a RLS de sector_observations (migration
-- 0007, policy "sobs_insert") JÁ permite que qualquer usuário autenticado crie
-- observações, independentemente do status do imóvel. O bloqueio "antes de
-- aprovar" era apenas na interface — corrigido no componente da página do
-- imóvel (src/app/admin/captacao/[id]/page.tsx). Nenhuma mudança de banco é
-- necessária para liberar as observações.
