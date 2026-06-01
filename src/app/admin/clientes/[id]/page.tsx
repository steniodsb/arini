import { notFound } from "next/navigation";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { CLIENT_TYPE_LABELS, type Client, type ClientDocument, type ClientType } from "@/lib/types";
import { ClientDocuments } from "./ClientDocuments";

export default async function ClienteDetailPage({ params }: { params: { id: string } }) {
  await requireSector(["juridico", "administrativo", "admin_central"]);
  const supabase = createSupabaseServer();
  const { data: client } = await supabase.from("clients").select("*").eq("id", params.id).single();
  if (!client) notFound();
  const c = client as Client;

  const { data: docs } = await supabase
    .from("client_documents")
    .select("*")
    .eq("client_id", c.id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-3xl text-arini">{c.nome}</h1>
        <div className="mt-2 flex gap-2">
          <Badge variant="gold">{CLIENT_TYPE_LABELS[c.tipo as ClientType] ?? c.tipo}</Badge>
          {!c.ativo && <Badge variant="muted">Inativo</Badge>}
        </div>
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

      <ClientDocuments clientId={c.id} initial={(docs ?? []) as ClientDocument[]} />
    </div>
  );
}
