-- =====================================================================
-- 0051 — CHAT INTERNO DO CRM
--
-- POR QUE TABELAS NOVAS, E NÃO `sector_observations`
-- --------------------------------------------------
-- `sector_observations` é "observação presa a uma entidade, direcionada a
-- um SETOR, com estado resolvido/não". Três dos quatro atributos estão
-- errados para conversa: chat não é preso a entidade, precisa endereçar
-- PESSOA, e não tem estado de "resolvido". Hoje a caixa geral já grava
-- `entity_id = <id do usuário>` com `entity_table = 'comunicacao'` — uma
-- chave estrangeira fingida, sintoma de que a tabela está sendo esticada
-- além do que ela modela.
--
-- Ela CONTINUA existindo e fazendo o trabalho dela: delegação a partir de
-- um imóvel, com o gatilho de notificação que já existe. O chat lê essas
-- observações para mostrá-las dentro da conversa do setor, mas não grava
-- nelas.
--
-- POR QUE NÃO REUSAR `conversations` DO ATENDIMENTO
-- -------------------------------------------------
-- Aquela tabela tem `canal check (whatsapp|instagram|facebook|messenger)`,
-- `external_id not null` e `lead_id` — é conversa com CLIENTE. Misturar
-- conversa interna ali sujaria o inbox do atendimento e obrigaria a
-- afrouxar constraints que hoje protegem aquele fluxo.
--
-- O DESENHO
-- ---------
-- Duas naturezas de conversa, na MESMA lista para quem usa:
--   · `direta`  — entre duas pessoas. Chave única por par ordenado.
--   · `setor`   — um canal por setor, que todo mundo daquele setor lê.
-- Cinco dos sete setores da Arini têm UMA pessoa só; por isso conversa
-- direta não é luxo, é o caso comum. O canal de setor serve aos dois
-- setores com mais de uma pessoa (recepção, administrativo) e ao
-- "quem estiver disponível".
--
-- Idempotente. Aplique após 0050.
-- =====================================================================

-- =========== CONVERSAS ===============================================
create table if not exists public.chat_conversas (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('direta','setor')),
  -- Preenchido só quando tipo='setor'.
  setor sector,
  -- Par ORDENADO de participantes, só quando tipo='direta'. Guardar os
  -- dois aqui (além de chat_participantes) é o que permite o índice único
  -- que impede duas conversas para o mesmo par — condição de corrida
  -- clássica quando os dois abrem o chat um do outro ao mesmo tempo.
  membro_a uuid references public.profiles(id) on delete cascade,
  membro_b uuid references public.profiles(id) on delete cascade,
  -- Denormalização para listar sem varrer chat_mensagens.
  ultima_em timestamptz not null default now(),
  ultima_previa text,
  ultima_autor_id uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint chat_conversa_coerente check (
    (tipo = 'setor' and setor is not null and membro_a is null and membro_b is null)
    or
    -- `membro_a < membro_b` normaliza o par: sem isso (A,B) e (B,A) seriam
    -- duas conversas diferentes para as mesmas duas pessoas.
    (tipo = 'direta' and setor is null and membro_a is not null
     and membro_b is not null and membro_a < membro_b)
  )
);

create unique index if not exists uq_chat_conversa_setor
  on public.chat_conversas(setor) where tipo = 'setor';
create unique index if not exists uq_chat_conversa_direta
  on public.chat_conversas(membro_a, membro_b) where tipo = 'direta';
create index if not exists idx_chat_conversas_recentes
  on public.chat_conversas(ultima_em desc);

-- =========== PARTICIPANTES ===========================================
-- Existe mesmo com `membro_a/b` na conversa porque é aqui que mora o
-- ESTADO DE LEITURA de cada pessoa, e porque a conversa de setor tem N
-- participantes que mudam quando alguém troca de setor.
create table if not exists public.chat_participantes (
  conversa_id uuid not null references public.chat_conversas(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  -- Até onde esta pessoa leu. Nulo = nunca abriu.
  lido_em timestamptz,
  -- Deixa a conversa fora da lista sem apagar nada.
  arquivada boolean not null default false,
  created_at timestamptz not null default now(),
  primary key (conversa_id, profile_id)
);

create index if not exists idx_chat_participantes_pessoa
  on public.chat_participantes(profile_id, arquivada);

-- =========== MENSAGENS ===============================================
create table if not exists public.chat_mensagens (
  id uuid primary key default gen_random_uuid(),
  conversa_id uuid not null references public.chat_conversas(id) on delete cascade,
  autor_id uuid references public.profiles(id) on delete set null,
  texto text,
  -- Anexo: mesma ideia do atendimento (arquivo já hospedado no storage).
  media_url text,
  media_nome text,
  media_mime text,
  media_tamanho integer,
  -- Responder citando.
  responde_a uuid references public.chat_mensagens(id) on delete set null,
  editada_em timestamptz,
  -- Apagar não remove a linha: quem já leu precisa continuar vendo que
  -- existiu algo ali, e o "de → para" de uma decisão não pode sumir.
  apagada_em timestamptz,
  created_at timestamptz not null default now(),

  constraint chat_mensagem_tem_conteudo check (
    texto is not null or media_url is not null
  )
);

create index if not exists idx_chat_mensagens_thread
  on public.chat_mensagens(conversa_id, created_at desc);

-- =========== RLS =====================================================
alter table public.chat_conversas enable row level security;
alter table public.chat_participantes enable row level security;
alter table public.chat_mensagens enable row level security;

/**
 * Sou participante desta conversa?
 *
 * `security definer` para não depender da RLS de chat_participantes ao
 * responder — senão a policy de conversas consultaria participantes, cuja
 * policy consultaria conversas, e a recursão derruba a query.
 */
create or replace function public.fn_chat_participa(uid uuid, conv uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.chat_participantes p
     where p.conversa_id = conv and p.profile_id = uid
  );
$$;

-- ---- conversas ----
drop policy if exists "chat_conv_read" on public.chat_conversas;
drop policy if exists "chat_conv_insert" on public.chat_conversas;
drop policy if exists "chat_conv_update" on public.chat_conversas;

-- Lê quem participa. A conversa de SETOR é legível por quem é daquele
-- setor mesmo sem linha em participantes ainda — é assim que uma pessoa
-- nova enxerga o canal do setor dela no primeiro acesso, antes de
-- qualquer clique.
--
-- A terceira condição (ser membro do par) NÃO é redundante com a
-- primeira, e sem ela abrir conversa nova é impossível: `INSERT ...
-- RETURNING` — que é o que o cliente do Supabase faz em
-- `.insert().select()` — exige que a policy de SELECT passe na linha
-- recém-criada, e nesse instante ainda não existe linha em
-- `chat_participantes` (ela é gravada no passo seguinte). O insert
-- inteiro era recusado com "new row violates row-level security policy".
-- Ler pelo par também é mais barato: dispensa a consulta à tabela de
-- participantes.
create policy "chat_conv_read" on public.chat_conversas for select using (
  public.fn_chat_participa(auth.uid(), id)
  or (tipo = 'setor' and setor = public.fn_user_sector(auth.uid()))
  or (tipo = 'direta' and (membro_a = auth.uid() or membro_b = auth.uid()))
);

-- Qualquer pessoa ativa abre conversa. Numa equipe de 10 pessoas que se
-- falam o dia todo, exigir permissão para iniciar conversa só geraria
-- pedido de permissão.
create policy "chat_conv_insert" on public.chat_conversas for insert with check (
  auth.uid() is not null
  and (
    tipo = 'setor'
    -- Conversa direta precisa incluir quem está criando: sem isto daria
    -- para abrir conversa entre outras duas pessoas.
    or (tipo = 'direta' and (membro_a = auth.uid() or membro_b = auth.uid()))
  )
);

-- O update serve à denormalização (`ultima_*`), feita por trigger. Mesmas
-- três condições da leitura, pelo mesmo motivo.
create policy "chat_conv_update" on public.chat_conversas for update using (
  public.fn_chat_participa(auth.uid(), id)
  or (tipo = 'setor' and setor = public.fn_user_sector(auth.uid()))
  or (tipo = 'direta' and (membro_a = auth.uid() or membro_b = auth.uid()))
);

-- ---- participantes ----
drop policy if exists "chat_part_read" on public.chat_participantes;
drop policy if exists "chat_part_write" on public.chat_participantes;
drop policy if exists "chat_part_update" on public.chat_participantes;
drop policy if exists "chat_part_delete" on public.chat_participantes;

create policy "chat_part_read" on public.chat_participantes for select using (
  profile_id = auth.uid() or public.fn_chat_participa(auth.uid(), conversa_id)
);
-- Entrar numa conversa é por conta própria (é assim que se entra no canal
-- do próprio setor) ou colocando alguém numa conversa que você participa.
--
-- A terceira condição cobre o instante em que a conversa direta nasce: ao
-- gravar os DOIS participantes, a linha do outro é avaliada antes de a
-- minha estar visível (mesmo comando = mesmo snapshot), então
-- `fn_chat_participa` ainda responde `false` e o insert era recusado.
-- Quem é membro do par pode inscrever os dois lados — o `check` da
-- conversa já garante que o par é exatamente essas duas pessoas.
create policy "chat_part_write" on public.chat_participantes for insert with check (
  auth.uid() is not null
  and (
    profile_id = auth.uid()
    or public.fn_chat_participa(auth.uid(), conversa_id)
    or exists (
      select 1 from public.chat_conversas c
       where c.id = chat_participantes.conversa_id
         and c.tipo = 'direta'
         and (c.membro_a = auth.uid() or c.membro_b = auth.uid())
    )
  )
);
-- Só a própria pessoa mexe no próprio estado de leitura.
create policy "chat_part_update" on public.chat_participantes for update using (
  profile_id = auth.uid()
);
create policy "chat_part_delete" on public.chat_participantes for delete using (
  profile_id = auth.uid()
);

-- ---- mensagens ----
drop policy if exists "chat_msg_read" on public.chat_mensagens;
drop policy if exists "chat_msg_insert" on public.chat_mensagens;
drop policy if exists "chat_msg_update" on public.chat_mensagens;

create policy "chat_msg_read" on public.chat_mensagens for select using (
  public.fn_chat_participa(auth.uid(), conversa_id)
  or exists (
    select 1 from public.chat_conversas c
     where c.id = chat_mensagens.conversa_id
       and c.tipo = 'setor'
       and c.setor = public.fn_user_sector(auth.uid())
  )
);

create policy "chat_msg_insert" on public.chat_mensagens for insert with check (
  autor_id = auth.uid()
  and (
    public.fn_chat_participa(auth.uid(), conversa_id)
    or exists (
      select 1 from public.chat_conversas c
       where c.id = chat_mensagens.conversa_id
         and c.tipo = 'setor'
         and c.setor = public.fn_user_sector(auth.uid())
    )
  )
);

-- Editar/apagar: só o autor, e só a própria mensagem.
create policy "chat_msg_update" on public.chat_mensagens for update using (
  autor_id = auth.uid()
);

-- =========== DENORMALIZAÇÃO DA ÚLTIMA MENSAGEM =======================
-- Por trigger, e não pela aplicação: a lista do chat ordena por
-- `ultima_em`, e se quem escreve esquecer de atualizar, a conversa some do
-- topo. Regra que a lista inteira depende não pode morar em cada chamador.
create or replace function public.fn_chat_touch_conversa()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  update public.chat_conversas
     set ultima_em = NEW.created_at,
         ultima_previa = left(
           coalesce(NEW.texto, '[' || coalesce(NEW.media_nome, 'anexo') || ']'), 140
         ),
         ultima_autor_id = NEW.autor_id
   where id = NEW.conversa_id;
  return NEW;
end $$;

drop trigger if exists trg_chat_touch on public.chat_mensagens;
create trigger trg_chat_touch after insert on public.chat_mensagens
  for each row execute function public.fn_chat_touch_conversa();

-- =========== TEMPO REAL ==============================================
-- Mesmo caminho do inbox do Atendimento (migration 0029). O Realtime
-- respeita a RLS, então cada pessoa só recebe evento do que pode ver.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'chat_mensagens'
  ) then
    alter publication supabase_realtime add table public.chat_mensagens;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public'
       and tablename = 'chat_conversas'
  ) then
    alter publication supabase_realtime add table public.chat_conversas;
  end if;
end $$;

-- =========== CANAIS DE SETOR ==========================================
-- Um por setor, criados de uma vez: o chat precisa ter o que mostrar no
-- primeiro acesso. Sem isto a tela abriria vazia e pareceria quebrada.
insert into public.chat_conversas (tipo, setor)
select 'setor', s
  from unnest(enum_range(null::sector)) s
 where not exists (
   select 1 from public.chat_conversas c where c.tipo = 'setor' and c.setor = s
 );

-- Cada pessoa ativa entra no canal do próprio setor.
insert into public.chat_participantes (conversa_id, profile_id)
select c.id, p.id
  from public.profiles p
  join public.chat_conversas c on c.tipo = 'setor' and c.setor = p.sector
 where p.ativo
on conflict do nothing;

comment on table public.chat_conversas is
  'Chat interno do CRM. `direta` = entre duas pessoas; `setor` = canal do setor. '
  'Não confundir com `conversations`, que é conversa com CLIENTE no Atendimento.';
