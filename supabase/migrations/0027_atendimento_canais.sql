-- =====================================================================
-- 0027 — CANAIS DO ATENDIMENTO (conexão de WhatsApp em 3 modos)
-- Até aqui as credenciais viviam em social_integrations: UMA linha por
-- plataforma, colada à mão no CRM. Isso não serve para o Atendimento,
-- que precisa de VÁRIOS números e de saber o estado da conexão.
--
-- Três modos de conectar o WhatsApp, cada um com um trade-off:
--   evolution            — Evolution API (não-oficial, QR Code). Sobe em
--                          minutos, sem burocracia com a Meta, mas há
--                          risco de bloqueio do número pelo WhatsApp.
--   cloud_api            — Cloud API oficial, onboarding clássico. O
--                          número MIGRA para a API e deixa de funcionar
--                          no app do celular.
--   cloud_api_coexistence— Cloud API oficial em Coexistence: o número
--                          continua no app do celular E na API. Exige
--                          Tech Provider/Solution Partner aprovado na
--                          Meta (Business Verification + App Review).
--
-- Idempotente. Aplique após 0026.
-- =====================================================================

create table if not exists public.atendimento_channels (
  id uuid primary key default gen_random_uuid(),
  -- Nome livre para o time distinguir os números ("Comercial", "Locação").
  nome text not null,
  -- Hoje só WhatsApp; a coluna existe para Instagram/Facebook entrarem depois.
  canal text not null default 'whatsapp'
    check (canal in ('whatsapp','instagram','facebook','messenger')),
  provedor text not null
    check (provedor in ('evolution','cloud_api','cloud_api_coexistence')),
  status text not null default 'desconectado'
    check (status in ('desconectado','aguardando_qr','conectando','conectado','erro')),
  -- Número exibido (E.164). Preenchido quando a conexão confirma.
  telefone text,
  -- Credenciais e parâmetros do provedor. O formato varia:
  --   evolution:  { base_url, api_key, instance_name }
  --   cloud_api*: { phone_number_id, waba_id, access_token, verify_token, app_secret }
  -- ATENÇÃO: contém segredos — a RLS abaixo restringe a leitura à diretoria.
  config jsonb not null default '{}'::jsonb,
  -- Última falha reportada pelo provedor (mostrada na tela de canais).
  ultimo_erro text,
  conectado_em timestamptz,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_atendimento_channels_status
  on public.atendimento_channels(status);

-- Um nome de instância da Evolution não pode repetir entre canais (é a
-- chave que a Evolution usa para rotear o webhook de volta pra cá).
create unique index if not exists uq_atendimento_channels_instance
  on public.atendimento_channels((config->>'instance_name'))
  where provedor = 'evolution' and config->>'instance_name' is not null;

-- Mesmo phone_number_id não pode estar em dois canais (webhook ambíguo).
create unique index if not exists uq_atendimento_channels_phone_number_id
  on public.atendimento_channels((config->>'phone_number_id'))
  where config->>'phone_number_id' is not null;

-- =========== Conversa passa a saber por qual canal entrou ============
alter table public.conversations
  add column if not exists channel_id uuid references public.atendimento_channels(id) on delete set null;

create index if not exists idx_conversations_channel
  on public.conversations(channel_id);

-- =========== RLS =====================================================
-- Leitura: quem opera o Atendimento precisa VER os canais (para saber se
-- está conectado e por qual número responder) — mas config carrega token,
-- então a leitura da tabela inteira fica só com a diretoria. Para os
-- atendentes existe a view saneada logo abaixo.
alter table public.atendimento_channels enable row level security;

drop policy if exists "channels_read" on public.atendimento_channels;
drop policy if exists "channels_write" on public.atendimento_channels;

create policy "channels_read" on public.atendimento_channels for select using (
  public.fn_is_diretoria(auth.uid())
);
create policy "channels_write" on public.atendimento_channels for all using (
  public.fn_is_diretoria(auth.uid())
) with check (
  public.fn_is_diretoria(auth.uid())
);

-- View sem segredos: o atendente vê estado da conexão, nunca os tokens.
-- Roda com o dono (padrão do Postgres), então atravessa a RLS restritiva
-- da tabela — de propósito, já que aqui não há credencial exposta.
create or replace view public.atendimento_channels_safe as
  select
    id, nome, canal, provedor, status, telefone, ultimo_erro,
    conectado_em, created_at,
    -- Só o necessário para a UI, nunca token/api_key/app_secret.
    config->>'instance_name' as instance_name
  from public.atendimento_channels;

comment on view public.atendimento_channels_safe is
  'Canais sem credenciais. Use esta view na UI do Atendimento; a tabela crua expõe tokens e é restrita à diretoria.';

revoke all on public.atendimento_channels_safe from anon;
grant select on public.atendimento_channels_safe to authenticated;

-- =========== updated_at ==============================================
create or replace function public.fn_touch_atendimento_channel()
returns trigger language plpgsql as $$
begin
  NEW.updated_at = now();
  return NEW;
end $$;

drop trigger if exists trg_touch_atendimento_channel on public.atendimento_channels;
create trigger trg_touch_atendimento_channel before update on public.atendimento_channels
  for each row execute function public.fn_touch_atendimento_channel();
