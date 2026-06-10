-- =====================================================================
-- 0011 — AGENDA DELEGÁVEL, DIVISÃO DE COMISSÃO E INTEGRAÇÕES P/ MARKETING
-- Idempotente. Aplique após 0010.
-- =====================================================================

-- =========== AGENDA: eventos próprios e delegados a setores ==========
create table if not exists public.agenda_events (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  tipo text not null default 'reuniao'
    check (tipo in ('visita','reuniao','ligacao','retorno','assinatura','gravacao','outro')),
  data_hora timestamptz not null,
  criado_por uuid references public.profiles(id),
  criado_por_sector sector,
  setor_destino sector,
  responsavel_id uuid references public.profiles(id),
  observacoes text,
  confirmado boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists idx_agenda_events_data on public.agenda_events(data_hora);
create index if not exists idx_agenda_events_setor on public.agenda_events(setor_destino);

alter table public.agenda_events enable row level security;

drop policy if exists "agenda_read" on public.agenda_events;
drop policy if exists "agenda_insert" on public.agenda_events;
drop policy if exists "agenda_update" on public.agenda_events;
drop policy if exists "agenda_delete" on public.agenda_events;

-- Lê: criador, responsável, setor de destino, setor do criador e diretoria.
create policy "agenda_read" on public.agenda_events for select using (
  criado_por = auth.uid()
  or responsavel_id = auth.uid()
  or setor_destino = public.fn_user_sector(auth.uid())
  or criado_por_sector = public.fn_user_sector(auth.uid())
  or public.fn_is_diretoria(auth.uid())
);
create policy "agenda_insert" on public.agenda_events for insert
  with check (auth.uid() is not null and criado_por = auth.uid());
create policy "agenda_update" on public.agenda_events for update using (
  criado_por = auth.uid()
  or responsavel_id = auth.uid()
  or setor_destino = public.fn_user_sector(auth.uid())
  or public.fn_is_diretoria(auth.uid())
);
create policy "agenda_delete" on public.agenda_events for delete using (
  criado_por = auth.uid() or public.fn_is_diretoria(auth.uid())
);

-- Notifica o setor de destino quando um compromisso é delegado a ele.
create or replace function public.fn_agenda_notify()
returns trigger language plpgsql security definer as $$
begin
  if NEW.setor_destino is not null then
    insert into public.notifications(sector, user_id, tipo, titulo, mensagem, link)
    values (
      NEW.setor_destino,
      NEW.responsavel_id,
      'agenda',
      'Novo compromisso na agenda',
      NEW.titulo || ' — ' || to_char(NEW.data_hora at time zone 'America/Sao_Paulo', 'DD/MM HH24:MI'),
      '/admin/agenda'
    );
  end if;
  return NEW;
end $$;

drop trigger if exists trg_agenda_notify on public.agenda_events;
create trigger trg_agenda_notify after insert on public.agenda_events
  for each row execute function public.fn_agenda_notify();

-- =========== COMISSÕES: divisão percentual (empresa x terceiros) =====
alter table public.commissions add column if not exists divisao jsonb;

-- =========== INTEGRAÇÕES: marketing também configura =================
drop policy if exists "social_write_diretoria" on public.social_integrations;
drop policy if exists "social_write" on public.social_integrations;
create policy "social_write" on public.social_integrations for all
  using (
    public.fn_is_diretoria(auth.uid())
    or public.fn_user_sector(auth.uid()) = 'marketing'
  )
  with check (
    public.fn_is_diretoria(auth.uid())
    or public.fn_user_sector(auth.uid()) = 'marketing'
  );
