-- =====================================================================
-- 0054 — PESSOA DESATIVADA PERDE O ACESSO NO BANCO, NÃO SÓ NA TELA
--
-- Duas camadas discordavam:
--
--   · a aplicação (`lib/atendimento-auth.ts`) recusa quem tem
--     `ativo = false` — a pessoa não abre tela nenhuma;
--   · a política do banco (`fn_has_atendimento`) olhava SÓ
--     `atendimento_access or is_admin_central`, e ignorava `ativo`.
--
-- Efeito prático: alguém desligado, com a sessão ainda válida, era barrado
-- nas telas mas continuava passando pela RLS. Quem soubesse chamar a API
-- direto leria as conversas dos clientes.
--
-- Nunca foi exercitado porque ninguém foi desligado até hoje. Vira risco
-- real agora, que a diretoria passa a criar e desativar contas pela tela
-- de Agentes — desativar precisa significar desativado.
--
-- `fn_has_atendimento` é a base da RLS de conversations, messages e das
-- tabelas de configuração do atendimento, então esta linha fecha todas de
-- uma vez. `ativo` é NOT NULL com default true: ninguém perde acesso por
-- causa desta mudança.
-- =====================================================================

create or replace function public.fn_has_atendimento(uid uuid)
returns boolean language sql stable as $$
  select coalesce(
    (
      select ativo and (atendimento_access or is_admin_central)
        from public.profiles
       where id = uid
    ),
    false
  );
$$;
