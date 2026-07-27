-- =====================================================================
-- 0038 — AGENDA: campos que as visualizações novas exigem.
--
-- A agenda tinha só `data_hora` e `confirmado`. Isso basta para uma lista,
-- mas não para timeline (precisa de duração para desenhar a barra), nem
-- para um kanban de verdade (precisa de status com mais de dois estados e
-- de ordem dentro da coluna).
--
-- Idempotente. Aplique após 0037.
-- =====================================================================

-- =====================================================================
-- 1. DURAÇÃO — sem isso a timeline não tem o que desenhar
-- =====================================================================

alter table public.agenda_events
  add column if not exists duracao_min integer not null default 60;

alter table public.lead_appointments
  add column if not exists duracao_min integer not null default 60;

-- =====================================================================
-- 2. STATUS — `confirmado` (bool) não descreve o ciclo de vida
--
-- Um compromisso passa por agendado → confirmado → concluído, e pode ser
-- cancelado ou virar não comparecimento. Com um booleano, "cancelado" e
-- "ainda não confirmado" ficam indistinguíveis, e o kanban não teria
-- colunas que façam sentido.
-- =====================================================================

do $$ begin
  alter table public.agenda_events
    add column if not exists status text not null default 'agendado';
  alter table public.agenda_events drop constraint if exists agenda_events_status_check;
  alter table public.agenda_events
    add constraint agenda_events_status_check
    check (status in ('agendado','confirmado','concluido','cancelado','nao_compareceu'));
end $$;

do $$ begin
  alter table public.lead_appointments
    add column if not exists status text not null default 'agendado';
  alter table public.lead_appointments drop constraint if exists lead_appointments_status_check;
  alter table public.lead_appointments
    add constraint lead_appointments_status_check
    check (status in ('agendado','confirmado','concluido','cancelado','nao_compareceu'));
end $$;

-- Alinha o status ao que o booleano já dizia, para as linhas existentes.
update public.agenda_events set status = 'confirmado'
 where confirmado and status = 'agendado';
update public.lead_appointments set status = 'confirmado'
 where confirmado and status = 'agendado';

-- `confirmado` continua existindo porque o resto do CRM lê essa coluna.
-- Um trigger mantém os dois em sincronia, para não haver duas verdades.
create or replace function public.fn_agenda_sincroniza_confirmado()
returns trigger language plpgsql as $$
begin
  NEW.confirmado := NEW.status in ('confirmado','concluido');
  return NEW;
end $$;

drop trigger if exists trg_agenda_events_confirmado on public.agenda_events;
create trigger trg_agenda_events_confirmado
  before insert or update of status on public.agenda_events
  for each row execute function public.fn_agenda_sincroniza_confirmado();

drop trigger if exists trg_lead_appointments_confirmado on public.lead_appointments;
create trigger trg_lead_appointments_confirmado
  before insert or update of status on public.lead_appointments
  for each row execute function public.fn_agenda_sincroniza_confirmado();

-- =====================================================================
-- 3. ORDEM NA COLUNA — kanban sem ordem manual não é kanban
-- =====================================================================

alter table public.agenda_events
  add column if not exists ordem integer not null default 0;

alter table public.lead_appointments
  add column if not exists ordem integer not null default 0;

-- =====================================================================
-- 4. COR E LOCAL
-- =====================================================================

alter table public.agenda_events
  add column if not exists cor text,
  -- Endereço ou link da reunião. Hoje isso vive espremido em `observacoes`.
  add column if not exists local text;

alter table public.lead_appointments
  add column if not exists local text;

-- Imóvel visitado: a visita quase sempre é a UM imóvel, e hoje não há
-- como saber qual sem ler a observação.
alter table public.lead_appointments
  add column if not exists property_id uuid references public.properties(id) on delete set null;

alter table public.agenda_events
  add column if not exists property_id uuid references public.properties(id) on delete set null;

-- =====================================================================
-- 5. ÍNDICES — as visualizações filtram por período o tempo todo
-- =====================================================================

create index if not exists idx_agenda_events_periodo
  on public.agenda_events(data_hora, status);
create index if not exists idx_agenda_events_responsavel
  on public.agenda_events(responsavel_id, data_hora);
create index if not exists idx_lead_appointments_periodo
  on public.lead_appointments(data_hora, status);
create index if not exists idx_lead_appointments_responsavel
  on public.lead_appointments(responsavel_id, data_hora);

-- =====================================================================
-- 6. PREFERÊNCIA DE VISUALIZAÇÃO POR USUÁRIO
--
-- Quem trabalha na timeline não quer reabrir no kanban toda vez.
-- =====================================================================

alter table public.profiles
  add column if not exists agenda_vista text not null default 'kanban'
    check (agenda_vista in ('kanban','timeline','mes','semana','lista'));
