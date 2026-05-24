import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL } from "@/lib/utils";
import { Building2, Users, Search } from "lucide-react";

export default async function BuscaPage({ searchParams }: { searchParams: { q?: string } }) {
  await requireUser();
  const q = (searchParams.q ?? "").trim();
  if (!q) {
    return (
      <div className="text-center py-20">
        <Search className="mx-auto mb-3 opacity-40" />
        <p className="text-muted-foreground">Digite algo na barra de busca acima.</p>
      </div>
    );
  }
  const supabase = createSupabaseServer();
  const like = `%${q}%`;
  const [props, leads, owners] = await Promise.all([
    supabase.from("properties").select("id, codigo, titulo, cidade, bairro, valor, status").or(`codigo.ilike.${like},titulo.ilike.${like},bairro.ilike.${like},cidade.ilike.${like},endereco.ilike.${like}`).limit(20),
    supabase.from("leads").select("id, nome, telefone, whatsapp, email, stage").or(`nome.ilike.${like},telefone.ilike.${like},whatsapp.ilike.${like},email.ilike.${like}`).limit(20),
    supabase.from("owners").select("id, nome, cpf_cnpj, telefone, email").or(`nome.ilike.${like},cpf_cnpj.ilike.${like},telefone.ilike.${like},email.ilike.${like}`).limit(20),
  ]);

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <h1 className="font-display text-3xl text-arini">Resultados para &quot;{q}&quot;</h1>
        <p className="text-muted-foreground mt-1">
          {(props.data?.length ?? 0) + (leads.data?.length ?? 0) + (owners.data?.length ?? 0)} resultados
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Building2 size={18} /> Imóveis</CardTitle>
        </CardHeader>
        <CardContent>
          {(props.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum imóvel encontrado.</p>
          ) : (
            <ul className="divide-y">
              {props.data!.map((p) => (
                <li key={p.id}>
                  <Link href={`/admin/captacao/${p.id}`} className="flex items-center justify-between py-3 hover:bg-muted/50 px-2 -mx-2 rounded">
                    <div>
                      <div className="font-mono text-xs text-muted-foreground">{p.codigo}</div>
                      <div className="text-arini font-medium">{p.titulo ?? "(sem título)"}</div>
                      <div className="text-xs text-muted-foreground">{p.bairro} {p.cidade && `· ${p.cidade}`}</div>
                    </div>
                    <div className="text-right">
                      <div className="text-arini font-semibold">{formatCurrencyBRL(p.valor)}</div>
                      <Badge variant="outline" className="mt-1">{p.status}</Badge>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users size={18} /> Leads</CardTitle>
        </CardHeader>
        <CardContent>
          {(leads.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum lead encontrado.</p>
          ) : (
            <ul className="divide-y">
              {leads.data!.map((l) => (
                <li key={l.id}>
                  <Link href={`/admin/leads/${l.id}`} className="flex items-center justify-between py-3 hover:bg-muted/50 px-2 -mx-2 rounded">
                    <div>
                      <div className="text-arini font-medium">{l.nome}</div>
                      <div className="text-xs text-muted-foreground">{l.whatsapp ?? l.telefone ?? l.email}</div>
                    </div>
                    <Badge variant="outline">{l.stage}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Proprietários</CardTitle>
        </CardHeader>
        <CardContent>
          {(owners.data ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum proprietário encontrado.</p>
          ) : (
            <ul className="divide-y">
              {owners.data!.map((o) => (
                <li key={o.id} className="py-3">
                  <div className="text-arini font-medium">{o.nome}</div>
                  <div className="text-xs text-muted-foreground">{o.cpf_cnpj ?? "—"} · {o.telefone ?? o.email ?? "—"}</div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
