-- =====================================================================
-- 0047 — Renomear e remover etiqueta DAS CONVERSAS.
--
-- A etiqueta vive em dois lugares: no catálogo (`atendimento_labels`) e
-- dentro de `conversations.tags`, que é text[]. Mexer só no catálogo
-- deixa o nome antigo pendurado nas conversas — vira um chip cinza, sem
-- cor e sem dono, que ninguém consegue explicar depois.
--
-- Por que função e não UPDATE direto da tela: array_replace/array_remove
-- em massa exige varrer a tabela inteira. Numa chamada do navegador isso
-- vira N requisições (uma por conversa) ou um update com filtro que a
-- RLS pode recortar pela metade — deixando parte das conversas com o
-- nome velho, que é o pior resultado possível: inconsistência silenciosa.
--
-- SECURITY DEFINER com guarda explícita: quem não tem acesso ao
-- atendimento recebe exceção, não uma alteração silenciosa.
-- =====================================================================

create or replace function public.fn_renomear_etiqueta(p_antigo text, p_novo text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afetadas integer;
begin
  if not public.fn_has_atendimento(auth.uid()) then
    raise exception 'sem permissão no atendimento';
  end if;
  if p_antigo is null or p_novo is null or btrim(p_novo) = '' then
    raise exception 'nome inválido';
  end if;

  update public.conversations
     set tags = array_replace(tags, p_antigo, p_novo)
   where tags @> array[p_antigo];

  get diagnostics afetadas = row_count;
  return afetadas;
end;
$$;

create or replace function public.fn_remover_etiqueta_das_conversas(p_nome text)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  afetadas integer;
begin
  if not public.fn_has_atendimento(auth.uid()) then
    raise exception 'sem permissão no atendimento';
  end if;
  if p_nome is null then
    raise exception 'nome inválido';
  end if;

  update public.conversations
     set tags = array_remove(tags, p_nome)
   where tags @> array[p_nome];

  get diagnostics afetadas = row_count;
  return afetadas;
end;
$$;

revoke all on function public.fn_renomear_etiqueta(text, text) from public;
revoke all on function public.fn_remover_etiqueta_das_conversas(text) from public;
grant execute on function public.fn_renomear_etiqueta(text, text) to authenticated;
grant execute on function public.fn_remover_etiqueta_das_conversas(text) to authenticated;

comment on function public.fn_renomear_etiqueta(text, text) is
  'Renomeia a etiqueta dentro de conversations.tags. Devolve quantas conversas mudaram.';
comment on function public.fn_remover_etiqueta_das_conversas(text) is
  'Tira a etiqueta de todas as conversas. Devolve quantas mudaram.';
