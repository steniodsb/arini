-- =====================================================================
-- 0010 — CORRIGE GERAÇÃO DE CÓDIGO DO IMÓVEL NA CAPTAÇÃO
-- Idempotente. Aplique após 0009.
--
-- Problema: fn_generate_property_code faz INSERT/UPDATE em
-- property_code_sequences, cuja RLS só permite escrita para admin_central.
-- Como a função não era SECURITY DEFINER, rodava com as permissões do
-- usuário; assim, um usuário do setor "captacao" era bloqueado pela RLS e
-- a criação do imóvel falhava (erro mascarado como "[object Object]").
--
-- Solução: recriar a função como SECURITY DEFINER, fixando o search_path.
-- =====================================================================

create or replace function public.fn_generate_property_code(p_type property_type, p_category property_category)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_prefix text;
  v_seq int;
  v_code text;
begin
  insert into public.property_code_sequences(type, category, prefix, next_seq)
  values (p_type, p_category,
    upper(left(p_type::text,2)) || upper(left(p_category::text,1)),
    1)
  on conflict (type, category) do update set next_seq = property_code_sequences.next_seq
  returning prefix, next_seq into v_prefix, v_seq;

  update public.property_code_sequences
  set next_seq = next_seq + 1
  where type = p_type and category = p_category
  returning next_seq - 1 into v_seq;

  v_code := v_prefix || '-' || lpad(v_seq::text, 5, '0');
  return v_code;
end $$;
