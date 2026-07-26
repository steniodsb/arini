-- =====================================================================
-- 0033 — LIGA O SLA À CAIXA (e destrava o job de violação)
--
-- A 0031 criou as políticas de SLA e as colunas de prazo na conversa,
-- mas nada ligava as duas pontas: nenhuma caixa apontava para uma
-- política e nenhum prazo era calculado. Resultado: o painel de SLA
-- existia, mas nunca marcava violação.
--
-- Aqui: a caixa passa a ter uma política, e um trigger calcula os
-- prazos no momento em que a conversa nasce.
--
-- Idempotente. Aplique após 0032.
-- =====================================================================

alter table public.atendimento_inboxes
  add column if not exists sla_policy_id uuid;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'inboxes_sla_fk') then
    alter table public.atendimento_inboxes
      add constraint inboxes_sla_fk
      foreign key (sla_policy_id) references public.atendimento_sla_policies(id) on delete set null;
  end if;
end $$;

-- =====================================================================
-- Trigger: ao criar a conversa, herda a política da caixa e calcula os
-- prazos. Só age quando a caixa tem política — sem caixa, sem SLA.
-- =====================================================================
create or replace function public.fn_conversation_set_sla()
returns trigger language plpgsql security definer as $$
declare
  v_policy_id uuid;
  v_primeira integer;
  v_resolucao integer;
begin
  if NEW.inbox_id is null or NEW.sla_policy_id is not null then
    return NEW;
  end if;

  select i.sla_policy_id into v_policy_id
    from public.atendimento_inboxes i
   where i.id = NEW.inbox_id;

  if v_policy_id is null then
    return NEW;
  end if;

  select p.primeira_resposta_min, p.resolucao_min
    into v_primeira, v_resolucao
    from public.atendimento_sla_policies p
   where p.id = v_policy_id;

  NEW.sla_policy_id := v_policy_id;
  if v_primeira is not null then
    NEW.sla_first_response_due := coalesce(NEW.created_at, now()) + make_interval(mins => v_primeira);
  end if;
  if v_resolucao is not null then
    NEW.sla_resolution_due := coalesce(NEW.created_at, now()) + make_interval(mins => v_resolucao);
  end if;

  return NEW;
end $$;

drop trigger if exists trg_conversation_set_sla on public.conversations;
create trigger trg_conversation_set_sla before insert on public.conversations
  for each row execute function public.fn_conversation_set_sla();
