-- =====================================================================
-- Leads: marcar "não é lead" e excluir — restrito a recepção e diretoria.
--
-- O PEDIDO (call de 21/08/2026, Carlos):
--   "aqui tem leads e não leads. […] 'Isso aqui não é lead'. Eu venho cá,
--    já exclui ele imediatamente." — e logo em seguida o limite:
--   "só dentro do setor administrativo central e do setor de recepção.
--    Eu não quero que libera para todo mundo, não."
--
-- POR QUE NO BANCO E NÃO SÓ ESCONDENDO O BOTÃO
-- --------------------------------------------
-- `leads_write` hoje é uma policy ALL para recepcao + administrativo +
-- admin_central. Ou seja: o `administrativo` PODE deletar lead pelo
-- PostgREST, mesmo que a tela não ofereça o botão. Esconder o botão não é
-- restrição, é decoração — qualquer chamada direta à API passa reto.
--
-- Aqui a regra passa a existir onde ela é verdade: RLS separada para
-- DELETE, e trigger para o descarte (que é um UPDATE e por isso não dá
-- para separar por policy sem quebrar a edição normal do lead).
--
-- DESCARTE É REVERSÍVEL, DELETE NÃO
-- ---------------------------------
-- "Não é lead" marca `descartado` e some do quadro. O lead continua no
-- banco, com quem descartou e quando — se alguém errar, dá para voltar.
-- O DELETE de verdade continua existindo para os mesmos dois setores.
-- =====================================================================

alter table leads add column if not exists descartado boolean not null default false;
alter table leads add column if not exists descartado_em timestamptz;
alter table leads add column if not exists descartado_por uuid references profiles(id) on delete set null;

-- O quadro lê sempre "não descartados"; sem índice isso vira scan na
-- tabela inteira a cada abertura da tela.
create index if not exists leads_descartado_idx on leads (descartado, ultima_interacao_em desc);

-- ---------------------------------------------------------------------
-- Quem pode descartar / excluir: recepção e diretoria. Só eles.
-- ---------------------------------------------------------------------
create or replace function fn_pode_descartar_lead(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select fn_user_sector(uid) = any (array['recepcao'::sector, 'admin_central'::sector])
      or fn_is_admin_central(uid);
$$;

-- DELETE deixa de vir junto no ALL e passa a ter regra própria.
-- Os três drops são obrigatórios: `scripts/apply-migrations.js` reaplica
-- TODOS os arquivos a cada `npm run db:migrate`, então uma migração que
-- não pode rodar duas vezes quebra o deploy inteiro na próxima execução.
drop policy if exists leads_write on leads;
drop policy if exists leads_update on leads;
drop policy if exists leads_delete on leads;

create policy leads_write on leads
  for insert
  with check (
    fn_user_sector(auth.uid()) = any (array['recepcao'::sector, 'administrativo'::sector, 'admin_central'::sector])
    or fn_is_admin_central(auth.uid())
  );

create policy leads_update on leads
  for update
  using (
    fn_user_sector(auth.uid()) = any (array['recepcao'::sector, 'administrativo'::sector, 'admin_central'::sector])
    or fn_is_admin_central(auth.uid())
  )
  with check (
    fn_user_sector(auth.uid()) = any (array['recepcao'::sector, 'administrativo'::sector, 'admin_central'::sector])
    or fn_is_admin_central(auth.uid())
  );

create policy leads_delete on leads
  for delete
  using (fn_pode_descartar_lead(auth.uid()));

-- ---------------------------------------------------------------------
-- Descarte: é UPDATE, então a policy de update não consegue distinguir.
-- O trigger distingue — e de quebra carimba quem foi e quando, sem
-- depender de a tela lembrar de preencher.
-- ---------------------------------------------------------------------
create or replace function fn_leads_descarte_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.descartado is distinct from old.descartado then
    if not fn_pode_descartar_lead(auth.uid()) then
      raise exception 'somente recepção e diretoria podem marcar um lead como "não é lead"'
        using errcode = '42501';
    end if;
    if new.descartado then
      new.descartado_em  := now();
      new.descartado_por := auth.uid();
    else
      new.descartado_em  := null;
      new.descartado_por := null;
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists leads_descarte_guard on leads;
create trigger leads_descarte_guard
  before update on leads
  for each row
  execute function fn_leads_descarte_guard();
