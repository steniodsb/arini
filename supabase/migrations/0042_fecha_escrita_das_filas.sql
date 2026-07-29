-- =====================================================================
-- 0042 — Só o administrador mexe na composição das filas.
--
-- O FURO
-- ------
-- A policy de `atendimento_team_members` (0030) usava
-- `fn_has_atendimento` para leitura E escrita. Isso era inofensivo quando
-- equipe servia só para agrupar gente. Depois da 0040 deixou de ser: a
-- fila passou a DECIDIR quem enxerga qual conversa.
--
-- Na prática, qualquer atendente com acesso ao sistema podia inserir a
-- si mesmo em `atendimento_team_members` via API e passar a ver as
-- conversas do Jurídico, do Financeiro ou da Fazenda. A tela escondia o
-- botão, mas a tela não é a fronteira de segurança.
--
-- A CORREÇÃO
-- ----------
-- Leitura continua aberta a quem tem atendimento (a UI precisa listar
-- quem está em cada fila para oferecer o atendente certo na triagem, e o
-- vínculo equipe↔perfil não é dado sensível). ESCRITA só para
-- administrador.
--
-- A mesma lógica vale para `atendimento_teams`: criar ou renomear uma
-- fila é decisão de administração.
--
-- Idempotente. Aplique após 0041.
-- =====================================================================

-- ---- Quem está em cada fila -----------------------------------------
drop policy if exists "atendimento_team_members_read" on public.atendimento_team_members;
drop policy if exists "atendimento_team_members_write" on public.atendimento_team_members;

create policy "atendimento_team_members_read" on public.atendimento_team_members
  for select using (public.fn_has_atendimento(auth.uid()));

create policy "atendimento_team_members_write" on public.atendimento_team_members
  for all using (public.fn_atendimento_eh_admin(auth.uid()))
  with check (public.fn_atendimento_eh_admin(auth.uid()));

-- ---- As filas em si --------------------------------------------------
drop policy if exists "atendimento_teams_read" on public.atendimento_teams;
drop policy if exists "atendimento_teams_write" on public.atendimento_teams;

create policy "atendimento_teams_read" on public.atendimento_teams
  for select using (public.fn_has_atendimento(auth.uid()));

create policy "atendimento_teams_write" on public.atendimento_teams
  for all using (public.fn_atendimento_eh_admin(auth.uid()))
  with check (public.fn_atendimento_eh_admin(auth.uid()));

-- ---- O papel de cada pessoa -----------------------------------------
-- `profiles` já tem a RLS do CRM, mas vale explicitar: mudar o próprio
-- `atendimento_papel` para 'administrador' seria escalada de privilégio.
-- A alteração passa pela rota /api/atendimento/agentes, que confere o
-- papel de quem pede e grava com a service role.
comment on column public.profiles.atendimento_papel is
  'Papel no atendimento. NUNCA altere pelo cliente — use /api/atendimento/agentes, que valida quem pede e registra auditoria.';
