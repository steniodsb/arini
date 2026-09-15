-- =====================================================================
-- 0050 — OPÇÕES DA INSTÂNCIA EVOLUTION (ligação recusada, histórico, etc.)
--
-- Por que existe: essas opções viviam como literais dentro de
-- `ensureInstance`, no corpo do `/instance/create`. Esse corpo só roda UMA
-- vez na vida da instância — quando ela já existe, a Evolution responde
-- 403 e o código cai no caminho de reconectar. Resultado: a mensagem que o
-- cliente recebia ao ligar ("Não atendemos ligações por aqui...") estava
-- congelada desde o primeiro pareamento e não havia como mudá-la pelo app,
-- nem editando o código.
--
-- A coluna é SEPARADA de `config` de propósito: `config` guarda segredos
-- (api_key, webhook_secret) e por isso tem leitura restrita à diretoria.
-- Estas opções são comportamento, não credencial, e precisam aparecer na
-- tela de quem configura o canal.
--
-- Idempotente. Aplique após 0049.
-- =====================================================================

alter table public.atendimento_channels
  add column if not exists opcoes jsonb not null default '{}'::jsonb;

comment on column public.atendimento_channels.opcoes is
  'Comportamento da instância Evolution: rejectCall, msgCall, groupsIgnore, '
  'alwaysOnline, readMessages, syncFullHistory. Sem segredos — ver `config` '
  'para credenciais. Aplicado via POST /settings/set/{instance}.';

-- Semeia os canais que já existem com o comportamento que estava fixo no
-- código, para que a tela mostre o que de fato está valendo hoje em vez de
-- aparecer vazia e sugerir que nada está configurado.
update public.atendimento_channels
set opcoes = jsonb_build_object(
  'rejectCall', true,
  'msgCall', 'Não atendemos ligações por aqui. Pode escrever que respondemos.',
  'groupsIgnore', true,
  'alwaysOnline', false,
  'readMessages', true,
  'syncFullHistory', false
)
where provedor = 'evolution' and opcoes = '{}'::jsonb;

-- A view que a UI lê precisa expor as opções — são comportamento, não
-- credencial, e a tela de configuração é justamente quem vai editá-las.
-- `create or replace view` não aceita ACRESCENTAR coluna no meio, mas
-- aceita no fim; por isso `opcoes` entra como última.
create or replace view public.atendimento_channels_safe as
  select
    id, nome, canal, provedor, status, telefone, ultimo_erro,
    conectado_em, created_at,
    -- Só o necessário para a UI, nunca token/api_key/app_secret.
    config->>'instance_name' as instance_name,
    opcoes
  from public.atendimento_channels;

comment on view public.atendimento_channels_safe is
  'Canais sem credenciais. Use esta view na UI do Atendimento; a tabela crua expõe tokens e é restrita à diretoria.';

revoke all on public.atendimento_channels_safe from anon;
grant select on public.atendimento_channels_safe to authenticated;
