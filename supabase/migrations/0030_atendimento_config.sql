-- =====================================================================
-- 0030 — CONFIGURAÇÕES DO ATENDIMENTO: catálogo de etiquetas, equipes
-- (times) e atribuição de conversa a equipe. Base para os painéis de
-- Configurações estilo Chatwoot.
-- Idempotente. Aplique após 0029.
-- =====================================================================

-- Catálogo de etiquetas (com cor) — diferente das tags livres da conversa.
create table if not exists public.atendimento_labels (
  id uuid primary key default gen_random_uuid(),
  nome text unique not null,
  cor text not null default '#6366f1',
  created_at timestamptz not null default now()
);

-- Equipes (times) de atendimento.
create table if not exists public.atendimento_teams (
  id uuid primary key default gen_random_uuid(),
  nome text not null,
  descricao text,
  created_at timestamptz not null default now()
);

create table if not exists public.atendimento_team_members (
  team_id uuid not null references public.atendimento_teams(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  primary key (team_id, profile_id)
);

-- Conversa pode ser atribuída a uma equipe (além do agente).
alter table public.conversations
  add column if not exists team_id uuid references public.atendimento_teams(id);

-- =========== RLS ======================================================
alter table public.atendimento_labels enable row level security;
alter table public.atendimento_teams enable row level security;
alter table public.atendimento_team_members enable row level security;

do $$
declare t text;
begin
  foreach t in array array['atendimento_labels','atendimento_teams','atendimento_team_members'] loop
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format(
      'create policy "%s_read" on public.%I for select using (public.fn_has_atendimento(auth.uid()))', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all using (public.fn_has_atendimento(auth.uid())) with check (public.fn_has_atendimento(auth.uid()))', t, t);
  end loop;
end $$;

-- Semear algumas etiquetas úteis (só se vazio).
insert into public.atendimento_labels (nome, cor)
select * from (values
  ('quente', '#ef4444'),
  ('morno', '#f59e0b'),
  ('frio', '#3b82f6'),
  ('financiamento', '#8b5cf6'),
  ('rural', '#10b981')
) as v(nome, cor)
where not exists (select 1 from public.atendimento_labels);
