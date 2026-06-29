import { notFound } from "next/navigation";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CLIENT_TYPE_LABELS, CLIENT_TYPES, type Client, type ClientDocument, type ClientType, type PropertyType } from "@/lib/types";
import { ClientDocuments } from "./ClientDocuments";
import { TransactionActions } from "@/components/crm/TransactionActions";
import { ClientPropertiesPanel, type LinkedProperty, type PropertyOption } from "@/components/crm/ClientPropertiesPanel";

const CLIENT_TYPE_OPTS = CLIENT_TYPES.map((t) => ({ value: t, label: CLIENT_TYPE_LABELS[t] }));

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  const { profile } = await requireSector(["juridico", "administrativo", "admin_central"]);
  const canManage = isDiretoria(profile);
  const supabase = createSupabaseServer();
  const { data: client } = await supabase.from("clients").select("*").eq("id", params.id).single();
  if (!client) notFound();
  const c = client as Client;

  const { data: docs } = await supabase
    .from("client_documents")
    .select("*")
    .eq("client_id", c.id)
    .order("created_at", { ascending: false });

  // Imóveis vinculados a este cliente (origem / controle interno) + lista de
  // imóveis disponíveis para vincular pela própria página do cliente.
  const [{ data: linksData }, { data: propsData }] = await Promise.all([
    supabase
      .from("property_clients")
      .select("id, papel, observacao, property:properties(id, codigo, titulo, type, cidade)")
      .eq("client_id", c.id)
      .order("created_at", { ascending: false }),
    supabase
      .from("properties")
      .select("id, codigo, titulo, type, cidade")
      .order("created_at", { ascending: false })
      .limit(500),
  ]);
  const linkedProperties: LinkedProperty[] = (linksData ?? []).map((r) => {
    const prop = r.property as
      | { id: string; codigo: string; titulo: string | null; type: PropertyType; cidade: string | null }
      | { id: string; codigo: string; titulo: string | null; type: PropertyType; cidade: string | null }[]
      | null;
    const pr = Array.isArray(prop) ? prop[0] : prop;
    return {
      id: r.id as string,
      property_id: pr?.id ?? "",
      codigo: pr?.codigo ?? "—",
      titulo: pr?.titulo ?? null,
      type: (pr?.type ?? "outro") as PropertyType,
      cidade: pr?.cidade ?? null,
      papel: r.papel as ClientType,
      observacao: (r.observacao as string | null) ?? null,
    };
  });
  const propertyOptions = (propsData ?? []) as PropertyOption[];

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">{c.nome}</h1>
          <div className="mt-2 flex gap-2">
            <Badge variant="gold">{CLIENT_TYPE_LABELS[c.tipo as ClientType] ?? c.tipo}</Badge>
            {!c.ativo && <Badge variant="muted">Inativo</Badge>}
          </div>
        </div>
        {canManage && (
          <TransactionActions
            table="clients"
            id={c.id}
            title="Editar cliente"
            canManage={canManage}
            redirectTo="/admin/clientes"
            editLabel="Editar"
            fields={[
              { name: "nome", label: "Nome", type: "text", value: c.nome },
              { name: "tipo", label: "Tipo de cliente", type: "select", value: c.tipo, options: CLIENT_TYPE_OPTS },
              { name: "cpf_cnpj", label: "CPF/CNPJ", type: "text", value: c.cpf_cnpj },
              { name: "telefone", label: "Telefone", type: "text", value: c.telefone },
              { name: "whatsapp", label: "WhatsApp", type: "text", value: c.whatsapp },
              { name: "email", label: "E-mail", type: "text", value: c.email },
              { name: "cidade", label: "Cidade", type: "text", value: c.cidade },
              { name: "observacoes", label: "Observações", type: "text", value: c.observacoes },
            ]}
          />
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2 text-sm">
          <div>CPF/CNPJ: {c.cpf_cnpj ?? "—"}</div>
          <div>Telefone: {c.telefone ?? "—"}</div>
          <div>WhatsApp: {c.whatsapp ?? "—"}</div>
          <div>E-mail: {c.email ?? "—"}</div>
          <div className="md:col-span-2">Endereço: {[c.endereco, c.cidade, c.uf].filter(Boolean).join(", ") || "—"}</div>
          {c.observacoes && <div className="md:col-span-2 text-muted-foreground whitespace-pre-line">{c.observacoes}</div>}
        </CardContent>
      </Card>

      <ClientPropertiesPanel
        clientId={c.id}
        defaultPapel={c.tipo as ClientType}
        initial={linkedProperties}
        properties={propertyOptions}
      />

      <ClientDocuments clientId={c.id} initial={(docs ?? []) as ClientDocument[]} />
    </div>
  );
}
