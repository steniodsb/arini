-- =====================================================================
-- Ponto por COLABORADOR, não por login.
--
-- O DEFEITO REAL (diagnosticado em 26/08/2026)
-- --------------------------------------------
-- A ata da call de 21/08 registrou: "o registro de ponto está amarrado ao
-- setor, e não ao colaborador". Não é isso. `time_entries` sempre teve
-- `user_id` — o ponto já era por pessoa. O que existe é UM LOGIN POR
-- SETOR ("Marketing Demo", "Captador Demo", "Recepção Demo"). As três
-- pessoas do marketing entram na mesma conta, então batem o mesmo ponto.
--
-- Nenhuma mudança em `time_entries.user_id` conserta isso: o problema não
-- é a coluna, é o fato de a identidade de quem trabalha não existir no
-- sistema. É por isso que a correção é uma TABELA NOVA, e não um ALTER.
--
-- POR QUE COLABORADOR É SEPARADO DE `profiles`
-- --------------------------------------------
-- 1. Quem bate ponto não é necessariamente quem tem login. O terminal
--    central (também pedido na call) é uma máquina só, na recepção: a
--    pessoa se identifica ali, ela não está logada como ela mesma. Se o
--    ponto dependesse de login, o terminal seria impossível.
-- 2. `profiles` é espelho de `auth.users` — criar login para cada
--    colaborador significaria conta, senha e cadeira no Supabase Auth
--    para quem só precisa marcar entrada e saída.
--
-- `user_id` continua em `time_entries` e passa a significar outra coisa:
-- QUEM OPEROU o terminal. `colaborador_id` é DE QUEM é o ponto. Os dois
-- juntos respondem "quem bateu, e em qual máquina/conta" — que é
-- exatamente o que um relatório de ponto precisa poder auditar.
-- =====================================================================

create table if not exists colaboradores (
  id             uuid primary key default gen_random_uuid(),
  nome           text not null,
  cpf            text unique,
  setor          sector,
  cargo          text,
  -- Vínculo OPCIONAL com um login. Quem tem conta no CRM pode bater ponto
  -- pela própria tela; quem não tem, bate no terminal. Os dois caem na
  -- mesma tabela e no mesmo relatório.
  profile_id     uuid references profiles(id) on delete set null,

  -- Jornada — "carga horária do Stênio 8 horas, que hora que o Stênio
  -- almoça, pausa pro café, tudo assim".
  carga_horaria_min  integer not null default 480,     -- 8h em minutos
  almoco_inicio      time,
  almoco_min         integer not null default 60,
  pausa_inicio       time,
  pausa_min          integer not null default 15,
  -- Escala: "se ela trabalha de segunda a sexta ou de segunda a domingo".
  -- 0 = domingo … 6 = sábado. Default seg–sex.
  dias_semana        smallint[] not null default '{1,2,3,4,5}',

  -- Código curto para identificação rápida no terminal, sem digitar CPF
  -- na frente da fila.
  codigo         text unique,
  ativo          boolean not null default true,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

comment on column colaboradores.cpf is
  'Dado pessoal. Leitura restrita a administrativo/diretoria pela RLS abaixo.';

create index if not exists colaboradores_ativo_idx on colaboradores (ativo, nome);

-- ---------------------------------------------------------------------
-- Liga o ponto ao colaborador.
-- ---------------------------------------------------------------------
alter table time_entries add column if not exists colaborador_id uuid references colaboradores(id) on delete restrict;

create index if not exists time_entries_colaborador_idx
  on time_entries (colaborador_id, registrado_em desc);

-- ---------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------
alter table colaboradores enable row level security;

-- Ler a lista: qualquer pessoa autenticada precisa ver NOME e CÓDIGO para
-- o terminal funcionar (é uma lista de escolha). O CPF é o que não pode
-- vazar — por isso a view abaixo, que é o que a tela do terminal usa.
drop policy if exists colaboradores_read on colaboradores;
create policy colaboradores_read on colaboradores
  for select
  using (
    fn_user_sector(auth.uid()) = any (array['administrativo'::sector, 'admin_central'::sector])
    or fn_is_admin_central(auth.uid())
  );

drop policy if exists colaboradores_write on colaboradores;
create policy colaboradores_write on colaboradores
  for all
  using (
    fn_user_sector(auth.uid()) = any (array['administrativo'::sector, 'admin_central'::sector])
    or fn_is_admin_central(auth.uid())
  )
  with check (
    fn_user_sector(auth.uid()) = any (array['administrativo'::sector, 'admin_central'::sector])
    or fn_is_admin_central(auth.uid())
  );

-- O terminal precisa listar quem pode bater ponto SEM expor CPF. Uma view
-- sem a coluna resolve isso melhor que uma policy: o dado não sai do
-- banco, em vez de sair e a tela prometer não mostrar.
create or replace view colaboradores_terminal
with (security_invoker = false) as
  select id, nome, codigo, setor, cargo, carga_horaria_min, dias_semana
    from colaboradores
   where ativo;

grant select on colaboradores_terminal to authenticated;

-- Bater ponto para outra pessoa: o INSERT existente exige
-- `user_id = auth.uid()`, o que continua valendo (é o operador do
-- terminal). O `colaborador_id` é livre justamente porque o terminal
-- registra por terceiros — é essa a função dele.
drop policy if exists time_read on time_entries;
create policy time_read on time_entries
  for select
  using (
    user_id = auth.uid()
    or fn_user_sector(auth.uid()) = any (array['administrativo'::sector, 'admin_central'::sector])
    or fn_is_admin_central(auth.uid())
  );

create or replace function fn_touch_colaboradores()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists colaboradores_touch on colaboradores;
create trigger colaboradores_touch
  before update on colaboradores
  for each row execute function fn_touch_colaboradores();
