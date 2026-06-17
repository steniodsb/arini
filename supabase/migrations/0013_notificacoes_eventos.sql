-- =====================================================================
-- 0013 — NOTIFICAÇÕES AUTOMÁTICAS (criado / editado / aprovado)
-- Idempotente. Aplique após 0012.
--
-- Cria notificações no app automaticamente nos principais eventos, sem
-- precisar de código em cada tela. Direciona ao setor relevante.
-- =====================================================================

create or replace function public.fn_notify_event()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_sector sector;
  v_titulo text;
  v_msg text;
  v_link text;
begin
  -- ===== IMÓVEIS =====
  if TG_TABLE_NAME = 'properties' then
    if TG_OP = 'INSERT' then
      v_sector := 'administrativo';
      v_titulo := 'Novo imóvel cadastrado';
      v_msg := 'Código ' || NEW.codigo || ' aguardando aprovação.';
      v_link := '/admin/aprovacoes';
    elsif TG_OP = 'UPDATE' and NEW.status is distinct from OLD.status then
      if NEW.status = 'aprovado_captacao' then
        v_sector := 'captacao'; v_titulo := 'Imóvel aprovado';
        v_msg := NEW.codigo || ' foi aprovado pela administração.';
        v_link := '/admin/captacao/' || NEW.id;
      elsif NEW.status = 'aguardando_aprovacao_marketing' then
        v_sector := 'administrativo'; v_titulo := 'Marketing aguardando aprovação';
        v_msg := NEW.codigo || ' está pronto para publicação.';
        v_link := '/admin/aprovacoes';
      elsif NEW.status = 'publicado' then
        v_sector := 'captacao'; v_titulo := 'Imóvel publicado';
        v_msg := NEW.codigo || ' está no ar no site. 🎉';
        v_link := '/admin/captacao/' || NEW.id;
      else
        return NEW;
      end if;
    else
      return NEW;
    end if;

  -- ===== CONTRATOS =====
  elsif TG_TABLE_NAME = 'contracts' and TG_OP = 'INSERT' then
    v_sector := 'juridico'; v_titulo := 'Novo contrato';
    v_msg := 'Um contrato foi cadastrado.'; v_link := '/admin/juridico';

  -- ===== CLIENTES =====
  elsif TG_TABLE_NAME = 'clients' and TG_OP = 'INSERT' then
    v_sector := 'juridico'; v_titulo := 'Novo cliente';
    v_msg := coalesce(NEW.nome, 'Cliente') || ' foi cadastrado.';
    v_link := '/admin/clientes/' || NEW.id;

  -- ===== COMISSÕES =====
  elsif TG_TABLE_NAME = 'commissions' then
    if TG_OP = 'INSERT' then
      v_sector := 'financeiro'; v_titulo := 'Nova comissão';
      v_msg := 'Uma comissão foi lançada.'; v_link := '/admin/financeiro-empresarial';
    else
      v_sector := 'admin_central'; v_titulo := 'Comissão editada';
      v_msg := 'Um lançamento de comissão foi alterado.'; v_link := '/admin/financeiro-empresarial';
    end if;

  -- ===== DESPESAS =====
  elsif TG_TABLE_NAME = 'expenses' then
    if TG_OP = 'INSERT' then
      v_sector := 'financeiro'; v_titulo := 'Nova despesa';
      v_msg := 'Uma despesa foi lançada.'; v_link := '/admin/financeiro-empresarial';
    else
      v_sector := 'admin_central'; v_titulo := 'Despesa editada';
      v_msg := 'Um lançamento de despesa foi alterado.'; v_link := '/admin/financeiro-empresarial';
    end if;

  -- ===== JURÍDICO (legal_records) =====
  elsif TG_TABLE_NAME = 'legal_records' and TG_OP = 'UPDATE' then
    v_sector := 'administrativo'; v_titulo := 'Jurídico atualizado';
    v_msg := 'O status jurídico de um imóvel foi alterado.'; v_link := '/admin/juridico';

  else
    return coalesce(NEW, OLD);
  end if;

  insert into public.notifications(sector, tipo, titulo, mensagem, link)
  values (v_sector, lower(TG_OP), v_titulo, v_msg, v_link);

  return coalesce(NEW, OLD);
end $$;

-- ===== TRIGGERS =====
drop trigger if exists trg_notify_properties on public.properties;
create trigger trg_notify_properties after insert or update on public.properties
  for each row execute function public.fn_notify_event();

drop trigger if exists trg_notify_contracts on public.contracts;
create trigger trg_notify_contracts after insert on public.contracts
  for each row execute function public.fn_notify_event();

drop trigger if exists trg_notify_clients on public.clients;
create trigger trg_notify_clients after insert on public.clients
  for each row execute function public.fn_notify_event();

drop trigger if exists trg_notify_commissions on public.commissions;
create trigger trg_notify_commissions after insert or update on public.commissions
  for each row execute function public.fn_notify_event();

drop trigger if exists trg_notify_expenses on public.expenses;
create trigger trg_notify_expenses after insert or update on public.expenses
  for each row execute function public.fn_notify_event();

drop trigger if exists trg_notify_legal on public.legal_records;
create trigger trg_notify_legal after update on public.legal_records
  for each row execute function public.fn_notify_event();
