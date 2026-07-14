import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { EditPropertyForm } from "./EditPropertyForm";
import { PropertyMediaBlock } from "@/components/crm/PropertyMediaBlock";
import { PropertyClientsPanel, type ClientOption, type LinkedClient, type OwnerOption } from "@/components/crm/PropertyClientsPanel";
import type { ClientType, MarketingMedia, Property, PropertyMedia } from "@/lib/types";

export default async function EditPropertyPage({ params }: { params: { id: string } }) {
  const { profile } = await requireSector(["captacao", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data } = await supabase.from("properties").select("*").eq("id", params.id).single();
  if (!data) notFound();
  const [{ data: owners }, { data: media }, { data: edited }, { data: campaign }] = await Promise.all([
    supabase.from("owners").select("id, nome, cpf_cnpj, telefone, email").order("nome"),
    supabase.from("property_media").select("*").eq("property_id", params.id).order("ordem"),
    supabase.from("marketing_media").select("*").eq("property_id", params.id).eq("fase", "editada").order("created_at", { ascending: false }),
    supabase.from("marketing_campaigns").select("id").eq("property_id", params.id).maybeSingle(),
  ]);
  const p = data as Property;

  // Controle interno (origem / clientes vinculados): administrativo, jurídico e
  // diretoria — mesma regra do detalhe e da RLS de property_clients.
  const canControl =
    profile?.is_admin_central || profile?.sector === "administrativo" || profile?.sector === "juridico";
  let linkedClients: LinkedClient[] = [];
  let clientOptions: ClientOption[] = [];
  if (canControl) {
    const [{ data: links }, { data: clients }] = await Promise.all([
      supabase
        .from("property_clients")
        .select("id, client_id, papel, observacao, client:clients(nome, telefone)")
        .eq("property_id", params.id)
        .order("created_at", { ascending: true }),
      supabase.from("clients").select("id, nome, tipo, cpf_cnpj").eq("ativo", true).order("nome"),
    ]);
    linkedClients = (links ?? []).map((r) => {
      const cli = r.client as { nome?: string; telefone?: string | null } | { nome?: string; telefone?: string | null }[] | null;
      const c = Array.isArray(cli) ? cli[0] : cli;
      return {
        id: r.id as string,
        client_id: r.client_id as string,
        papel: r.papel as ClientType,
        observacao: (r.observacao as string | null) ?? null,
        nome: c?.nome ?? "—",
        telefone: c?.telefone ?? null,
      };
    });
    clientOptions = (clients ?? []).map((c) => ({
      id: c.id as string,
      nome: c.nome as string,
      tipo: c.tipo as ClientType,
      cpf_cnpj: (c.cpf_cnpj as string | null) ?? null,
    }));
  }

  const ownerOptions: OwnerOption[] = ((owners ?? []) as { id: string; nome: string; cpf_cnpj: string | null; telefone: string | null; email: string | null }[]).map((o) => ({
    id: o.id,
    nome: o.nome,
    cpf_cnpj: o.cpf_cnpj ?? null,
    telefone: o.telefone ?? null,
    email: o.email ?? null,
  }));

  return (
    <div className="max-w-4xl">
      <h1 className="font-display text-3xl text-arini">Editar imóvel</h1>
      <p className="text-muted-foreground mt-1">Código: <span className="font-mono">{p.codigo}</span></p>
      <div className="mt-6 space-y-6">
        <EditPropertyForm property={p} owners={ownerOptions} />
        <PropertyMediaBlock
          propertyId={params.id}
          coverUrl={p.foto_principal_url}
          coverPath={p.foto_principal_path}
          campaignId={(campaign?.id as string | undefined) ?? null}
          rawMedia={(media ?? []) as PropertyMedia[]}
          editedMedia={(edited ?? []) as MarketingMedia[]}
        />
        {canControl && (
          <PropertyClientsPanel propertyId={params.id} initial={linkedClients} clients={clientOptions} owners={ownerOptions} />
        )}
      </div>
    </div>
  );
}
