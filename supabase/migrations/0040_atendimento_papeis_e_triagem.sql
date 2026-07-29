-- =====================================================================
-- 0040 — ATENDIMENTO: papéis próprios, caixa central e triagem.
--
-- O QUE ESTAVA ERRADO
-- -------------------
-- A visibilidade das conversas era decidida pelo SETOR DO CRM
-- (`fn_user_sector`: captacao, marketing, juridico, financeiro…). Isso
-- misturava duas coisas que não têm relação:
--   · o setor diz o que a pessoa faz no CRM de imóveis;
--   · o atendimento precisa saber quem tria, quem atende e quem
--     administra — que é outro eixo.
-- Na prática, quem era do setor "recepcao" ou "administrativo" via TODAS
-- as conversas, e um corretor via as do setor inteiro. Não é o que a
-- operação precisa.
--
-- O MODELO NOVO
-- -------------
--   administrador → vê tudo, assume, transfere, reabre.
--   recepcao      → vê a CAIXA CENTRAL (o que ainda não foi triado) e faz
--                   a triagem. Se acompanha o que já atribuiu é
--                   configurável (`recepcao_ve_atribuidas`).
--   atendente     → vê o que está nas FILAS dele (equipes) e o que está
--                   atribuído a ele. Não vê fila de que não participa.
--
-- FILA = EQUIPE (`atendimento_teams`). Não criamos conceito novo: a
-- equipe já tem cadastro, membros e tela pronta.
--
-- Idempotente. Aplique após 0039.
-- =====================================================================

-- =====================================================================
-- 1. PAPEL NO ATENDIMENTO — independente do setor do CRM
-- =====================================================================

alter table public.profiles
  add column if not exists atendimento_papel text not null default 'atendente';

do $$ begin
  alter table public.profiles drop constraint if exists profiles_atendimento_papel_check;
  alter table public.profiles
    add constraint profiles_atendimento_papel_check
    check (atendimento_papel in ('administrador','recepcao','atendente'));
end $$;

-- Quem já é diretoria vira administrador do atendimento — senão ninguém
-- conseguiria administrar depois que as políticas novas entrarem.
update public.profiles
   set atendimento_papel = 'administrador'
 where is_admin_central and atendimento_papel = 'atendente';

-- =====================================================================
-- 2. TRIAGEM — o que separa a caixa central do resto
-- =====================================================================

alter table public.conversations
  add column if not exists triada_em timestamptz,
  add column if not exists triada_por uuid references public.profiles(id);

-- Índice parcial: a caixa central lê só o que NÃO foi triado, e sem isso
-- varreria a tabela inteira a cada abertura da tela.
create index if not exists idx_conversations_caixa_central
  on public.conversations(last_message_at desc) where triada_em is null;

-- Conversa que já tem equipe é, por definição, triada. Alinha o histórico.
update public.conversations
   set triada_em = coalesce(triada_em, created_at)
 where team_id is not null and triada_em is null;

-- A recepção acompanha o que já foi atribuído?
alter table public.atendimento_settings
  add column if not exists recepcao_ve_atribuidas boolean not null default true;

comment on column public.atendimento_settings.recepcao_ve_atribuidas is
  'true = a recepção continua vendo a conversa depois de atribuir (segundo par de olhos). false = ela só enxerga a caixa central.';

-- =====================================================================
-- 3. FUNÇÕES DE APOIO
--
-- SECURITY DEFINER porque elas leem `profiles` e
-- `atendimento_team_members` — se rodassem com a permissão do usuário,
-- a própria RLS dessas tabelas entraria em recursão.
-- =====================================================================

create or replace function public.fn_atendimento_papel(uid uuid)
returns text language sql stable security definer set search_path = public as $$
  select case
           when p.is_admin_central then 'administrador'
           else coalesce(p.atendimento_papel, 'atendente')
         end
    from public.profiles p
   where p.id = uid and p.ativo
$$;

create or replace function public.fn_atendimento_eh_admin(uid uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(public.fn_atendimento_papel(uid) = 'administrador', false)
$$;

/** As filas (equipes) de que o usuário participa. */
create or replace function public.fn_atendimento_minhas_equipes(uid uuid)
returns setof uuid language sql stable security definer set search_path = public as $$
  select team_id from public.atendimento_team_members where profile_id = uid
$$;

/**
 * Regra única de visibilidade da conversa. Fica numa função só para a
 * política de `conversations` e a de `messages` nunca divergirem — foi
 * assim que o modelo antigo criou buraco (mensagem visível de conversa
 * que não era).
 */
create or replace function public.fn_pode_ver_conversa(
  uid uuid,
  p_responsavel uuid,
  p_team uuid,
  p_triada timestamptz
)
returns boolean language sql stable security definer set search_path = public as $$
  select
    -- Sem acesso ao atendimento, não vê nada.
    public.fn_has_atendimento(uid)
    and (
      -- Administrador enxerga tudo.
      public.fn_atendimento_eh_admin(uid)
      -- Recepção: caixa central sempre; o resto conforme a configuração.
      or (
        public.fn_atendimento_papel(uid) = 'recepcao'
        and (
          p_triada is null
          or coalesce((select s.recepcao_ve_atribuidas from public.atendimento_settings s where s.id), true)
        )
      )
      -- Atribuída a mim.
      or p_responsavel = uid
      -- Na minha fila (equipe). A fila é compartilhada: quem está nela vê
      -- as conversas dela, inclusive as ainda sem responsável — é o que
      -- permite cobrir férias sem depender do administrador redistribuir.
      or (p_team is not null and p_team in (select public.fn_atendimento_minhas_equipes(uid)))
    )
$$;

-- =====================================================================
-- 4. RLS — conversas
-- =====================================================================

drop policy if exists "conv_read" on public.conversations;
drop policy if exists "conv_write" on public.conversations;

create policy "conv_read" on public.conversations for select using (
  public.fn_pode_ver_conversa(auth.uid(), responsavel_id, team_id, triada_em)
);

-- Escrita segue a leitura: quem enxerga a conversa pode agir nela. Quem
-- não enxerga não consegue nem atribuir para si.
create policy "conv_write" on public.conversations for all using (
  public.fn_pode_ver_conversa(auth.uid(), responsavel_id, team_id, triada_em)
) with check (
  public.fn_pode_ver_conversa(auth.uid(), responsavel_id, team_id, triada_em)
);

-- =====================================================================
-- 5. RLS — mensagens (seguem a conversa-mãe)
-- =====================================================================

drop policy if exists "msg_read" on public.messages;
drop policy if exists "msg_write" on public.messages;

create policy "msg_read" on public.messages for select using (
  exists (
    select 1 from public.conversations c
     where c.id = messages.conversation_id
       and public.fn_pode_ver_conversa(auth.uid(), c.responsavel_id, c.team_id, c.triada_em)
  )
);

create policy "msg_write" on public.messages for all using (
  exists (
    select 1 from public.conversations c
     where c.id = messages.conversation_id
       and public.fn_pode_ver_conversa(auth.uid(), c.responsavel_id, c.team_id, c.triada_em)
  )
) with check (
  exists (
    select 1 from public.conversations c
     where c.id = messages.conversation_id
       and public.fn_pode_ver_conversa(auth.uid(), c.responsavel_id, c.team_id, c.triada_em)
  )
);

-- =====================================================================
-- 6. HISTÓRICO DE TRIAGEM E TRANSFERÊNCIA
--
-- "Quem tirou esse cliente de mim?" precisa ter resposta. Sem este log,
-- transferência é uma alteração silenciosa de coluna.
-- =====================================================================

create table if not exists public.atendimento_transferencias (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  acao text not null check (acao in ('triagem','transferencia','assumir','devolver')),
  de_equipe uuid references public.atendimento_teams(id) on delete set null,
  para_equipe uuid references public.atendimento_teams(id) on delete set null,
  de_agente uuid references public.profiles(id) on delete set null,
  para_agente uuid references public.profiles(id) on delete set null,
  motivo text,
  feito_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_transferencias_conversa
  on public.atendimento_transferencias(conversation_id, created_at desc);

alter table public.atendimento_transferencias enable row level security;
drop policy if exists "transferencias_read" on public.atendimento_transferencias;
drop policy if exists "transferencias_write" on public.atendimento_transferencias;
create policy "transferencias_read" on public.atendimento_transferencias for select using (
  exists (
    select 1 from public.conversations c
     where c.id = atendimento_transferencias.conversation_id
       and public.fn_pode_ver_conversa(auth.uid(), c.responsavel_id, c.team_id, c.triada_em)
  )
);
create policy "transferencias_write" on public.atendimento_transferencias for insert with check (
  public.fn_has_atendimento(auth.uid())
);

-- =====================================================================
-- 7. SEED — as 9 filas de triagem
-- =====================================================================

insert into public.atendimento_teams (nome, descricao)
select * from (values
  ('Venda Urbana',   'Imóveis urbanos: casas, apartamentos, terrenos e comerciais. ia:comprar'),
  ('Fazenda',        'Rural: fazendas, sítios, chácaras e ranchos.'),
  ('Locação',        'Aluguel: locatários, locadores e administração de contratos. ia:alugar'),
  ('Consórcio',      'Cartas de consórcio e planos.'),
  ('Documentação',   'Matrícula, certidões e regularização.'),
  ('Financeiro',     'Pagamentos, repasses, boletos e cobrança.'),
  ('Jurídico',       'Contratos, análise e questões legais.'),
  ('Marketing',      'Divulgação, portais e redes sociais.'),
  ('Administrativo', 'Assuntos internos e o que não se encaixa nas demais.')
) as v(nome, descricao)
where not exists (
  select 1 from public.atendimento_teams t where t.nome = v.nome
);
