-- =====================================================================
-- 0015 — CORRIGE CÓDIGO SEQUENCIAL + LIMPA REGISTROS ÓRFÃOS
-- Idempotente. Aplique após 0014.
--
-- Problemas:
--  1) Ao deletar imóveis, a sequência de código NÃO voltava → novos imóveis
--     continuavam com número alto (006, 007...).
--  2) approvals e sector_observations de imóveis deletados ficavam órfãos,
--     inflando "aprovações pendentes" e mostrando itens inexistentes.
-- =====================================================================

-- ===== 1. LIMPEZA dos órfãos atuais =====
delete from public.approvals a
where a.entity_table = 'properties'
  and not exists (select 1 from public.properties p where p.id = a.entity_id);

delete from public.sector_observations s
where s.entity_table = 'properties'
  and not exists (select 1 from public.properties p where p.id = s.entity_id);

-- ===== 2. CÓDIGO segue a realidade (maior número existente + 1) =====
create or replace function public.fn_generate_property_code(p_type property_type, p_category property_category)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq int;
begin
  -- garante/recupera o prefixo configurado para o tipo+categoria
  insert into public.property_code_sequences(type, category, prefix, next_seq)
  values (p_type, p_category, upper(left(p_type::text, 2)) || upper(left(p_category::text, 1)), 1)
  on conflict (type, category) do update set next_seq = public.property_code_sequences.next_seq
  returning prefix into v_prefix;

  -- próximo número = maior sufixo numérico já existente desse prefixo + 1
  select coalesce(max(substring(codigo from '[0-9]+$')::int), 0) + 1
    into v_seq
  from public.properties
  where codigo like v_prefix || '-%';

  update public.property_code_sequences
    set next_seq = v_seq + 1
  where type = p_type and category = p_category;

  return v_prefix || '-' || lpad(v_seq::text, 5, '0');
end $$;

-- ===== 3. Ressincroniza a tabela de sequências com os imóveis atuais =====
update public.property_code_sequences s
set next_seq = coalesce(
  (select max(substring(p.codigo from '[0-9]+$')::int)
     from public.properties p
    where p.codigo like s.prefix || '-%'),
  0) + 1;

-- ===== 4. Ao DELETAR imóvel, limpa aprovações/observações dele =====
create or replace function public.fn_cleanup_property_refs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from public.approvals where entity_table = 'properties' and entity_id = OLD.id;
  delete from public.sector_observations where entity_table = 'properties' and entity_id = OLD.id;
  return OLD;
end $$;

drop trigger if exists trg_cleanup_property_refs on public.properties;
create trigger trg_cleanup_property_refs after delete on public.properties
  for each row execute function public.fn_cleanup_property_refs();
