-- =====================================================================
-- 0041 — `fn_pode_ver_conversa` devolvia NULL em vez de FALSE.
--
-- O DEFEITO
-- ---------
-- A comparação `p_responsavel = uid` resulta em NULL quando a conversa
-- ainda não tem responsável (que é o caso mais comum: tudo que está na
-- caixa central). Como `false or NULL` é NULL em SQL de três valores, a
-- função inteira devolvia NULL para um atendente olhando uma conversa
-- não triada.
--
-- POR QUE ISSO NÃO QUEBROU NADA (ainda)
-- -------------------------------------
-- Uma política de RLS trata NULL como "não passa", então o isolamento
-- funcionava. O problema é a fragilidade: qualquer uso NEGADO da função
-- (`not fn_pode_ver_conversa(...)`, ou um `where ... = false`) se
-- comportaria de forma silenciosamente errada, porque `not NULL` é NULL.
-- Uma função de permissão precisa responder sim ou não, nunca "talvez".
--
-- A CORREÇÃO
-- ----------
-- `is not distinct from` no lugar de `=` (compara nulos sem virar NULL)
-- e `coalesce(..., false)` no resultado. Mesma semântica de acesso, sem
-- o terceiro valor.
--
-- Idempotente. Aplique após 0040.
-- =====================================================================

create or replace function public.fn_pode_ver_conversa(
  uid uuid,
  p_responsavel uuid,
  p_team uuid,
  p_triada timestamptz
)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    public.fn_has_atendimento(uid)
    and (
      -- Administrador enxerga tudo.
      coalesce(public.fn_atendimento_eh_admin(uid), false)
      -- Recepção: caixa central sempre; o resto conforme a configuração.
      or (
        coalesce(public.fn_atendimento_papel(uid) = 'recepcao', false)
        and (
          p_triada is null
          or coalesce((select s.recepcao_ve_atribuidas from public.atendimento_settings s where s.id), true)
        )
      )
      -- Atribuída a mim. `is not distinct from` em vez de `=`: com
      -- `p_responsavel` nulo, o `=` devolveria NULL e contaminaria o OR.
      or (uid is not null and p_responsavel is not distinct from uid)
      -- Na minha fila (equipe). Compartilhada de propósito: quem está nela
      -- vê as conversas da fila, inclusive as sem responsável — é o que
      -- cobre férias sem depender do administrador redistribuir.
      or (
        p_team is not null
        and exists (
          select 1 from public.atendimento_team_members m
           where m.team_id = p_team and m.profile_id = uid
        )
      )
    ),
    false
  )
$$;
