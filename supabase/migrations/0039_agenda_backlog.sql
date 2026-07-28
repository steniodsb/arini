-- =====================================================================
-- 0039 — AGENDA: compromisso ainda SEM data (backlog).
--
-- `data_hora` era NOT NULL, então todo compromisso nascia agendado. Isso
-- impede o padrão que o cliente pediu: um painel lateral com o que ainda
-- não tem data, de onde se arrasta para o calendário.
--
-- Também acrescenta `dia_inteiro`, para o mês distinguir "reunião das 14h"
-- de "viagem de 3 dias" — com só `duracao_min` os dois viram a mesma coisa.
--
-- Idempotente. Aplique após 0038.
-- =====================================================================

alter table public.agenda_events alter column data_hora drop not null;
alter table public.lead_appointments alter column data_hora drop not null;

alter table public.agenda_events
  add column if not exists dia_inteiro boolean not null default false;
alter table public.lead_appointments
  add column if not exists dia_inteiro boolean not null default false;

-- Índice parcial para o painel de não agendados: ele lê só estas linhas,
-- e sem isso varreria a tabela inteira toda vez que a tela abre.
create index if not exists idx_agenda_events_sem_data
  on public.agenda_events(created_at desc) where data_hora is null;
create index if not exists idx_lead_appointments_sem_data
  on public.lead_appointments(created_at desc) where data_hora is null;

-- Um compromisso sem data não pode estar "confirmado" nem "concluído" —
-- seria mentira no relatório. O trigger de 0038 já deriva `confirmado` do
-- status; aqui garantimos que o status volte para 'agendado' quando a data
-- é removida (arrastar do calendário de volta para o painel lateral).
create or replace function public.fn_agenda_sem_data_volta_agendado()
returns trigger language plpgsql as $$
begin
  if NEW.data_hora is null and NEW.status in ('confirmado','concluido','nao_compareceu') then
    NEW.status := 'agendado';
  end if;
  return NEW;
end $$;

drop trigger if exists trg_agenda_events_sem_data on public.agenda_events;
create trigger trg_agenda_events_sem_data
  before insert or update of data_hora, status on public.agenda_events
  for each row execute function public.fn_agenda_sem_data_volta_agendado();

drop trigger if exists trg_lead_appointments_sem_data on public.lead_appointments;
create trigger trg_lead_appointments_sem_data
  before insert or update of data_hora, status on public.lead_appointments
  for each row execute function public.fn_agenda_sem_data_volta_agendado();
