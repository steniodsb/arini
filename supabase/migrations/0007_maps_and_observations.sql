-- =====================================================================
-- 0007 — LINK GOOGLE MAPS + OBSERVAÇÕES DIRECIONADAS POR SETOR
-- Idempotente. Aplique após 0006.
-- =====================================================================

-- =========== MAPS URL =================================================
alter table public.properties
  add column if not exists maps_url text;

-- =========== OBSERVAÇÕES DIRECIONADAS =================================
-- Observação genérica que pode ser anexada a qualquer entidade (imóvel,
-- campanha de marketing, etc.) e direcionada a um setor específico que
-- "irá receber" a observação.
create table if not exists public.sector_observations (
  id uuid primary key default gen_random_uuid(),
  entity_table text not null,
  entity_id uuid not null,
  target_sector sector not null,
  autor_id uuid references public.profiles(id),
  autor_sector sector,
  texto text not null,
  resolvido boolean not null default false,
  resolvido_por uuid references public.profiles(id),
  resolvido_em timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists idx_sobs_entity on public.sector_observations(entity_table, entity_id);
create index if not exists idx_sobs_target on public.sector_observations(target_sector, resolvido);

alter table public.sector_observations enable row level security;

drop policy if exists "sobs_read" on public.sector_observations;
drop policy if exists "sobs_insert" on public.sector_observations;
drop policy if exists "sobs_update" on public.sector_observations;
drop policy if exists "sobs_delete" on public.sector_observations;

-- Todo usuário autenticado lê (a UI filtra por entidade/setor).
create policy "sobs_read" on public.sector_observations for select
  using (auth.uid() is not null);
-- Qualquer autenticado cria uma observação.
create policy "sobs_insert" on public.sector_observations for insert
  with check (auth.uid() is not null and autor_id = auth.uid());
-- Autor, setor de destino ou diretoria podem marcar como resolvida/editar.
create policy "sobs_update" on public.sector_observations for update using (
  autor_id = auth.uid()
  or target_sector = public.fn_user_sector(auth.uid())
  or public.fn_is_diretoria(auth.uid())
);
create policy "sobs_delete" on public.sector_observations for delete using (
  autor_id = auth.uid() or public.fn_is_diretoria(auth.uid())
);

-- =========== TRIGGER: notifica o setor de destino =====================
create or replace function public.fn_observation_notify()
returns trigger language plpgsql security definer as $$
begin
  insert into public.notifications(sector, tipo, titulo, mensagem, link, payload)
  values (
    NEW.target_sector,
    'observacao',
    'Nova observação para o seu setor',
    left(NEW.texto, 140),
    case
      when NEW.entity_table = 'properties' then '/admin/captacao/' || NEW.entity_id
      when NEW.entity_table = 'marketing_campaigns' then '/admin/marketing/' || NEW.entity_id
      else null
    end,
    jsonb_build_object(
      'observation_id', NEW.id,
      'entity_table', NEW.entity_table,
      'entity_id', NEW.entity_id
    )
  );
  return NEW;
end $$;

drop trigger if exists trg_observation_notify on public.sector_observations;
create trigger trg_observation_notify after insert on public.sector_observations
  for each row execute function public.fn_observation_notify();
