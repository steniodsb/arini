-- =====================================================================
-- 0028 — INBOX ESTILO CHATWOOT: notas internas, etiquetas, respostas
-- rápidas e campos de resolução (para métricas).
-- Idempotente. Aplique após 0027.
-- =====================================================================

-- Nota interna: mensagem visível só para a equipe, nunca enviada ao cliente.
alter table public.messages
  add column if not exists interna boolean not null default false;

-- Etiquetas livres na conversa (ex.: "quente", "financiamento", "rural").
alter table public.conversations
  add column if not exists tags text[] not null default '{}';

-- Marcação de resolução (base para relatórios de atendimento).
alter table public.conversations
  add column if not exists resolvida_em timestamptz,
  add column if not exists resolvida_por uuid references public.profiles(id),
  add column if not exists primeira_resposta_em timestamptz;

-- =========== RESPOSTAS RÁPIDAS (canned responses) =====================
create table if not exists public.canned_responses (
  id uuid primary key default gen_random_uuid(),
  atalho text not null,          -- ex.: "horario", "endereco"
  titulo text not null,
  conteudo text not null,
  criado_por uuid references public.profiles(id),
  created_at timestamptz not null default now()
);
create index if not exists idx_canned_atalho on public.canned_responses(atalho);

alter table public.canned_responses enable row level security;
drop policy if exists "canned_read" on public.canned_responses;
drop policy if exists "canned_write" on public.canned_responses;
-- Biblioteca compartilhada: quem tem acesso ao atendimento lê e mantém.
create policy "canned_read" on public.canned_responses for select using (
  public.fn_has_atendimento(auth.uid())
);
create policy "canned_write" on public.canned_responses for all using (
  public.fn_has_atendimento(auth.uid())
) with check (
  public.fn_has_atendimento(auth.uid())
);

-- Semear algumas respostas úteis (só se a tabela estiver vazia).
insert into public.canned_responses (atalho, titulo, conteudo)
select * from (values
  ('saudacao', 'Saudação', 'Olá! Aqui é da Arini Negócios Imobiliários. Como posso ajudar você hoje?'),
  ('horario', 'Horário de atendimento', 'Nosso horário de atendimento é de segunda a sexta, das 8h às 18h, e sábado das 8h às 12h.'),
  ('aguarde', 'Pedir um momento', 'Certo! Só um momento que já verifico essa informação para você.'),
  ('visita', 'Agendar visita', 'Posso agendar uma visita para você. Qual o melhor dia e horário?')
) as v(atalho, titulo, conteudo)
where not exists (select 1 from public.canned_responses);
