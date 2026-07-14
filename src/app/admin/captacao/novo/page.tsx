import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { NovaCaptacaoForm } from "./NovaCaptacaoForm";
import type { ClientOption, OwnerOption } from "@/components/crm/PropertyClientsPanel";
import type { ClientType } from "@/lib/types";

export default async function NovaCaptacaoPage() {
  const { profile } = await requireSector(["captacao", "administrativo", "admin_central"]);

  // Vínculo de cliente é controle interno (administrativo/jurídico/diretoria).
  const canControl =
    !!profile?.is_admin_central || profile?.sector === "administrativo" || profile?.sector === "juridico";
  let clients: ClientOption[] = [];
  let owners: OwnerOption[] = [];
  if (canControl) {
    const supabase = createSupabaseServer();
    const [{ data: clientData }, { data: ownerData }] = await Promise.all([
      supabase.from("clients").select("id, nome, tipo, cpf_cnpj").eq("ativo", true).order("nome"),
      supabase.from("owners").select("id, nome, cpf_cnpj, telefone, email").order("nome"),
    ]);
    clients = (clientData ?? []).map((c) => ({
      id: c.id as string,
      nome: c.nome as string,
      tipo: c.tipo as ClientType,
      cpf_cnpj: (c.cpf_cnpj as string | null) ?? null,
    }));
    owners = (ownerData ?? []).map((o) => ({
      id: o.id as string,
      nome: o.nome as string,
      cpf_cnpj: (o.cpf_cnpj as string | null) ?? null,
      telefone: (o.telefone as string | null) ?? null,
      email: (o.email as string | null) ?? null,
    }));
  }

  return (
    <div className="max-w-4xl">
      <div className="mb-8">
        <h1 className="font-display text-3xl text-arini">Nova captação</h1>
        <p className="text-muted-foreground mt-1">
          Preencha os dados do imóvel. Ao final, o registro será enviado para aprovação administrativa.
        </p>
      </div>
      <NovaCaptacaoForm canControl={canControl} clients={clients} owners={owners} />
    </div>
  );
}
