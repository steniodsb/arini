-- =====================================================================
-- 0052 — MENU DE RAMAIS (o "digite 1 para Compra e Venda")
--
-- Pedido na especificação de 18/09/2026 (Fluxograma — CRM Omnichannel +
-- Ramal Arini): saudação, menu numérico e roteamento automático para o
-- setor que o cliente escolher.
--
-- POR QUE ISSO NÃO CABE NO MOTOR DE AUTOMAÇÕES QUE JÁ EXISTE
-- ----------------------------------------------------------
-- O motor (`atendimento_automations`) é SEM ESTADO: avalia cada mensagem
-- isolada, sem saber o que veio antes. A regra possível seria "mensagem
-- contém 1 → fila Venda Urbana" — e aí "vou chegar às 11h" cai no ramal
-- 1, para sempre.
--
-- Um menu precisa lembrar de uma coisa só, mas precisa: "mandei as opções
-- e estou esperando a resposta". É o que `atendimento_menu_estado` guarda.
-- Fora dessa janela, "1" é só um número numa frase.
--
-- O QUE ESTA MIGRATION *NÃO* CRIA, DE PROPÓSITO
-- ---------------------------------------------
-- Saudação, mensagem de ausência e horário comercial JÁ EXISTEM em
-- `atendimento_inboxes` e `atendimento_business_hours` (e a tela de
-- Configurações já os edita). O que não existia era alguém LER esses
-- campos fora do widget do site — no WhatsApp nada era enviado. Isso se
-- resolve no código, não com colunas novas: duplicar "mensagem de fim de
-- semana" aqui criaria dois lugares para editar a mesma frase.
--
-- As mensagens 5 e 6 do fluxograma (sábado/domingo e fora do horário) são
-- o MESMO mecanismo: expediente fechado. A diferença entre elas é só o
-- que está cadastrado em `atendimento_business_hours`.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. O MENU
-- ---------------------------------------------------------------------
create table if not exists public.atendimento_menus (
  id uuid primary key default gen_random_uuid(),
  -- Um menu pertence a uma CAIXA, não a um número: é a caixa que conhece
  -- o expediente e a saudação, e é ela que o roteamento já usa.
  inbox_id uuid not null references public.atendimento_inboxes(id) on delete cascade,
  nome text not null,
  ativo boolean not null default true,

  -- Textos. Todos aceitam as variáveis de `lib/atendimento/variaveis.ts`
  -- ({{saudacao_nome}}, {{primeiro_nome}}, {{fila}}…).
  --
  -- `saudacao` vazia = usa `atendimento_inboxes.saudacao_texto`, para a
  -- frase de boas-vindas continuar tendo UM dono só.
  saudacao text not null default '',
  cabecalho text not null default '',
  confirmacao text not null default '',
  -- O que dizer quando a resposta não é uma opção válida.
  nao_entendi text not null default '',

  -- Quantas vezes repetir o menu antes de desistir. Sem teto, um cliente
  -- confuso fica em laço com o robô — que é o pior resultado possível.
  max_tentativas integer not null default 3 check (max_tentativas between 1 and 5),
  -- Para onde vai quem estourou as tentativas. Nulo = fica na caixa
  -- central, que é o comportamento de hoje para quem não foi triado.
  fila_escape uuid references public.atendimento_teams(id) on delete set null,

  -- Conversa parada esquece que havia menu aberto. Sem isso, o "1" que o
  -- cliente mandar daqui a três semanas seria lido como resposta do menu.
  expira_minutos integer not null default 1440 check (expira_minutos > 0),

  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- Duas regras disputando a mesma caixa é bug garantido e silencioso.
create unique index if not exists atendimento_menus_um_ativo_por_caixa
  on public.atendimento_menus (inbox_id)
  where ativo;

-- ---------------------------------------------------------------------
-- 2. AS OPÇÕES (os ramais)
-- ---------------------------------------------------------------------
create table if not exists public.atendimento_menu_opcoes (
  id uuid primary key default gen_random_uuid(),
  menu_id uuid not null references public.atendimento_menus(id) on delete cascade,
  ordem integer not null default 0,

  -- O que o cliente digita. TEXTO, não inteiro: amanhã pode ser "0" para
  -- voltar, ou uma letra. O código normaliza antes de comparar.
  chave text not null,
  rotulo text not null,

  -- O destino. `team_id` é a fila; `responsavel_id` é o atalho para o
  -- caso real da Arini, onde vários setores têm uma pessoa só.
  team_id uuid references public.atendimento_teams(id) on delete set null,
  responsavel_id uuid references public.profiles(id) on delete set null,

  -- Etiqueta opcional aplicada na escolha — é o que faz o relatório
  -- "quantos procuraram Locação" existir sem tabela nova.
  etiqueta text,
  -- Sobrescreve a confirmação do menu, quando este ramal precisa dizer
  -- algo diferente ("envie a matrícula do imóvel", por exemplo).
  confirmacao text,

  ativo boolean not null default true,
  created_at timestamptz not null default now(),

  unique (menu_id, chave)
);

create index if not exists atendimento_menu_opcoes_menu_idx
  on public.atendimento_menu_opcoes (menu_id, ordem);

-- ---------------------------------------------------------------------
-- 3. O ESTADO — a única coisa que o motor de automações não tem
-- ---------------------------------------------------------------------
-- Chave primária na CONVERSA: no máximo um menu aberto por conversa, sem
-- precisar de regra no código para garantir isso.
--
-- A linha sobrevive à resposta (`respondido_em` preenchido) porque ela é
-- a prova de que o menu foi respondido, e é o que impede reenviar o menu
-- a cada mensagem seguinte. O histórico de QUEM escolheu O QUE não fica
-- aqui: vai para `atendimento_transferencias`, junto das transferências
-- feitas por gente — um lugar só para responder "quem mandou esse cliente
-- para cá?".
create table if not exists public.atendimento_menu_estado (
  conversation_id uuid primary key references public.conversations(id) on delete cascade,
  menu_id uuid not null references public.atendimento_menus(id) on delete cascade,
  enviado_em timestamptz not null default now(),
  tentativas integer not null default 0,
  respondido_em timestamptz,
  opcao_id uuid references public.atendimento_menu_opcoes(id) on delete set null
);

create index if not exists atendimento_menu_estado_aguardando_idx
  on public.atendimento_menu_estado (menu_id)
  where respondido_em is null;

-- ---------------------------------------------------------------------
-- 4. RLS — mesmo padrão das demais tabelas do atendimento (0031)
-- ---------------------------------------------------------------------
-- NOTA HONESTA: este padrão dá escrita a QUALQUER perfil com acesso ao
-- atendimento, não só ao administrador. A tela restringe a edição do menu
-- à diretoria; o banco, não. É a mesma lacuna já registrada em
-- `atendimento_settings` (ver docs/ATENDIMENTO-PENDENCIAS.md, item 9) e
-- fechá-la é uma mudança de política que vale para todas as tabelas de
-- uma vez — não para esta sozinha, criando um terceiro padrão.
do $$
declare t text;
begin
  foreach t in array array[
    'atendimento_menus','atendimento_menu_opcoes','atendimento_menu_estado'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "%s_read" on public.%I', t, t);
    execute format('drop policy if exists "%s_write" on public.%I', t, t);
    execute format(
      'create policy "%s_read" on public.%I for select using (public.fn_has_atendimento(auth.uid()))', t, t);
    execute format(
      'create policy "%s_write" on public.%I for all using (public.fn_has_atendimento(auth.uid())) with check (public.fn_has_atendimento(auth.uid()))', t, t);
  end loop;
end $$;
