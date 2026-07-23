-- =====================================================================
-- 0025 — ATENDIMENTO OMNICHANNEL (Fase 1): conversas + mensagens
-- Espinha do módulo de atendimento. Hoje o webhook cria UM LEAD por
-- mensagem recebida (duplica contato e perde a thread). Aqui criamos:
--   - conversations: uma thread por contato+canal, ligada a um lead.
--   - messages: cada mensagem (entrada/saída) da thread.
-- O webhook passa a identificar o contato (dedupe) e anexar a mensagem
-- à conversa, em vez de criar lead novo toda vez.
-- Idempotente. Aplique após 0024. NÃO adiciona setor novo (reusa o enum).
-- =====================================================================

-- =========== CONVERSAS ================================================
create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  -- Canal de origem da conversa (mesmos valores das plataformas do webhook).
  canal text not null check (canal in ('whatsapp','instagram','facebook','messenger')),
  -- Identificador do contato NAQUELE canal (wa_id no WhatsApp, sender.id na Meta).
  external_id text not null,
  -- Vínculo com o CRM: o lead/contato dono da conversa (dedupe aponta pra cá).
  lead_id uuid references public.leads(id) on delete set null,
  contato_nome text,
  contato_telefone text,
  -- Roteamento: setor e atendente responsáveis (preenchidos na triagem/atribuição).
  setor_responsavel sector,
  responsavel_id uuid references public.profiles(id),
  status text not null default 'aberta' check (status in ('aberta','pendente','resolvida')),
  -- Denormalização p/ listar o inbox sem varrer messages.
  last_message_at timestamptz not null default now(),
  last_message_preview text,
  unread_count integer not null default 0,
  created_at timestamptz not null default now()
);

-- Uma thread por contato+canal (é isso que evita o lead/conversa duplicado).
create unique index if not exists uq_conversations_canal_external
  on public.conversations(canal, external_id);
create index if not exists idx_conversations_inbox
  on public.conversations(setor_responsavel, status, last_message_at desc);
create index if not exists idx_conversations_lead
  on public.conversations(lead_id);

-- =========== MENSAGENS ================================================
create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  -- 'in' = do cliente p/ a Arini; 'out' = da Arini p/ o cliente.
  direcao text not null check (direcao in ('in','out')),
  -- Quem originou: cliente, atendente humano, ou sistema/automação (IA na fase 2).
  remetente text not null default 'cliente' check (remetente in ('cliente','atendente','sistema','ia')),
  autor_id uuid references public.profiles(id),
  tipo text not null default 'texto'
    check (tipo in ('texto','imagem','audio','documento','video','template','sistema')),
  conteudo text,
  media_url text,
  -- ID da mensagem na plataforma (dedupe de webhook reentregue pela Meta).
  external_id text,
  raw_payload jsonb,
  status text not null default 'recebida'
    check (status in ('recebida','enviada','entregue','lida','falha')),
  created_at timestamptz not null default now()
);

create index if not exists idx_messages_conversation
  on public.messages(conversation_id, created_at);
-- Evita gravar a mesma mensagem duas vezes (Meta reentrega webhooks).
create unique index if not exists uq_messages_external
  on public.messages(external_id) where external_id is not null;

-- =========== RLS ======================================================
-- Espelha a lógica de leads, mas por setor RESPONSÁVEL da conversa: o setor
-- dono vê a sua; recepção (triagem) e diretoria veem todas. Inbound entra
-- via service role (webhook), que ignora RLS.
alter table public.conversations enable row level security;
alter table public.messages enable row level security;

drop policy if exists "conv_read" on public.conversations;
drop policy if exists "conv_write" on public.conversations;
drop policy if exists "msg_read" on public.messages;
drop policy if exists "msg_write" on public.messages;

create policy "conv_read" on public.conversations for select using (
  public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or setor_responsavel = public.fn_user_sector(auth.uid())
);
create policy "conv_write" on public.conversations for all using (
  public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or setor_responsavel = public.fn_user_sector(auth.uid())
) with check (
  public.fn_is_diretoria(auth.uid())
  or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
  or setor_responsavel = public.fn_user_sector(auth.uid())
);

-- Mensagens seguem o acesso da conversa-mãe.
create policy "msg_read" on public.messages for select using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (
        public.fn_is_diretoria(auth.uid())
        or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
        or c.setor_responsavel = public.fn_user_sector(auth.uid())
      )
  )
);
create policy "msg_write" on public.messages for all using (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (
        public.fn_is_diretoria(auth.uid())
        or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
        or c.setor_responsavel = public.fn_user_sector(auth.uid())
      )
  )
) with check (
  exists (
    select 1 from public.conversations c
    where c.id = messages.conversation_id
      and (
        public.fn_is_diretoria(auth.uid())
        or public.fn_user_sector(auth.uid()) in ('recepcao','administrativo','admin_central')
        or c.setor_responsavel = public.fn_user_sector(auth.uid())
      )
  )
);

-- =========== TRIGGER: nova mensagem atualiza a conversa ===============
-- Mantém last_message_* e conta não-lidas (só para mensagens do cliente).
create or replace function public.fn_message_touch_conversation()
returns trigger language plpgsql security definer as $$
begin
  update public.conversations
    set last_message_at = NEW.created_at,
        last_message_preview = left(coalesce(NEW.conteudo, '[' || NEW.tipo || ']'), 140),
        unread_count = case when NEW.direcao = 'in'
                            then unread_count + 1
                            else 0 end
    where id = NEW.conversation_id;
  return NEW;
end $$;

drop trigger if exists trg_message_touch on public.messages;
create trigger trg_message_touch after insert on public.messages
  for each row execute function public.fn_message_touch_conversation();
