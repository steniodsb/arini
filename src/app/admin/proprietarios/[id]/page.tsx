import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home } from "lucide-react";
import { PROPERTY_TYPE_LABELS, type PropertyType } from "@/lib/types";
import { formatCurrencyBRL } from "@/lib/utils";
import { TransactionActions } from "@/components/crm/TransactionActions";

interface Owner {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
}

type OwnerProperty = {
  id: string;
  codigo: string;
  titulo: string | null;
  type: PropertyType;
  cidade: string | null;
  status: string;
  valor: number | null;
};

export default async function ProprietarioDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const { profile } = await requireSector(["administrativo", "admin_central"]);
  const canManage = isDiretoria(profile);
  const supabase = createSupabaseServer();

  const { data: owner } = await supabase
    .from("owners")
    .select("*")
    .eq("id", params.id)
    .single();
  if (!owner) notFound();
  const o = owner as Owner;

  // Imóveis desta pessoa (vínculo direto via properties.owner_id).
  const { data: propsData } = await supabase
    .from("properties")
    .select("id, codigo, titulo, type, cidade, status, valor")
    .eq("owner_id", o.id)
    .order("created_at", { ascending: false });
  const imoveis = (propsData ?? []) as OwnerProperty[];

  return (
    <div className="space-y-6 max-w-4xl">
      <Link
        href="/admin/proprietarios"
        className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-arini transition-colors"
      >
        <ArrowLeft size={16} /> Voltar para proprietários
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">{o.nome}</h1>
          <div className="mt-2">
            <Badge variant="gold">Proprietário</Badge>
          </div>
        </div>
        {canManage && (
          <TransactionActions
            table="owners"
            id={o.id}
            title="Editar proprietário"
            canManage={canManage}
            redirectTo="/admin/proprietarios"
            editLabel="Editar"
            fields={[
              { name: "nome", label: "Nome", type: "text", value: o.nome },
              { name: "cpf_cnpj", label: "CPF/CNPJ", type: "text", value: o.cpf_cnpj },
              { name: "telefone", label: "Telefone", type: "text", value: o.telefone },
              { name: "email", label: "E-mail", type: "text", value: o.email },
              { name: "observacoes", label: "Observações", type: "text", value: o.observacoes },
            ]}
          />
        )}
      </div>

      <Card>
        <CardHeader><CardTitle>Dados</CardTitle></CardHeader>
        <CardContent className="grid md:grid-cols-2 gap-2 text-sm">
          <div>CPF/CNPJ: {o.cpf_cnpj ?? "—"}</div>
          <div>Telefone: {o.telefone ?? "—"}</div>
          <div>E-mail: {o.email ?? "—"}</div>
          {o.observacoes && (
            <div className="md:col-span-2 text-muted-foreground whitespace-pre-line">
              {o.observacoes}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Imóveis deste proprietário ({imoveis.length})</CardTitle>
        </CardHeader>
        <CardContent>
          {imoveis.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">
              Nenhum imóvel vinculado a este proprietário.
            </p>
          ) : (
            <ul className="divide-y">
              {imoveis.map((p) => (
                <li key={p.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="font-medium text-arini truncate">
                      {p.titulo ?? PROPERTY_TYPE_LABELS[p.type]}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.codigo} · {PROPERTY_TYPE_LABELS[p.type]}
                      {p.cidade ? ` · ${p.cidade}` : ""} · {p.status}
                      {p.valor != null ? ` · ${formatCurrencyBRL(p.valor)}` : ""}
                    </div>
                  </div>
                  <Button asChild variant="ghost" size="sm">
                    <Link href={`/admin/captacao/${p.id}`}>
                      <Home size={14} /> Abrir
                    </Link>
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
