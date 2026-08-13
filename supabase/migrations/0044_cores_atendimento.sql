-- =====================================================================
-- 0044 — Paleta de cores do Atendimento.
--
-- Duas camadas, de propósito:
--   · atendimento_settings.cor_padrao  → o padrão da empresa (diretoria)
--   · profiles.atendimento_cor         → a escolha do agente; NULL quer
--     dizer "seguir o padrão da conta", que é o estado em que todo mundo
--     nasce. Sem o NULL, mudar o padrão da empresa não alcançaria mais
--     ninguém: todo perfil já teria um valor gravado.
--
-- O CHECK amarra a lista às paletas que existem em src/lib/atendimento/
-- cores.ts. Ao criar uma paleta nova, esta lista precisa crescer junto —
-- é barulhento de propósito: cor inválida no banco vira tela sem estilo.
-- =====================================================================

alter table public.profiles
  add column if not exists atendimento_cor text;

alter table public.atendimento_settings
  add column if not exists cor_padrao text not null default 'whatsapp';

alter table public.profiles
  drop constraint if exists profiles_atendimento_cor_check;
alter table public.profiles
  add constraint profiles_atendimento_cor_check
  check (
    atendimento_cor is null
    or atendimento_cor in ('whatsapp', 'verde_arini', 'grafite', 'azul', 'dourado')
  );

alter table public.atendimento_settings
  drop constraint if exists atendimento_settings_cor_padrao_check;
alter table public.atendimento_settings
  add constraint atendimento_settings_cor_padrao_check
  check (cor_padrao in ('whatsapp', 'verde_arini', 'grafite', 'azul', 'dourado'));

comment on column public.profiles.atendimento_cor is
  'Paleta escolhida pelo agente no Atendimento. NULL = segue atendimento_settings.cor_padrao.';
comment on column public.atendimento_settings.cor_padrao is
  'Paleta padrão da conta, definida pela diretoria em Configurações › Aparência.';
