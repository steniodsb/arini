import Link from "next/link";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PROPERTY_TYPE_LABELS, CLIENT_TYPE_LABELS, type LegalStatus, type Property, type Client, type ClientType } from "@/lib/types";
import { JuridicoTabs } from "./JuridicoTabs";

const STATUS_BADGE: Record<LegalStatus, "muted" | "warning" | "success" | "danger"> = {
  nao_iniciado: "muted",
  em_analise: "warning",
  pendente: "warning",
  aprovado: "success",
  reprovado: "danger",
};

export default async function JuridicoPage() {
  const { profile } = await requireSector(["juridico", "administrativo", "admin_central"]);
  const diretoria = isDiretoria(profile);
  const supabase = createSupabaseServer();

  const [{ data: properties }, { data: clients }, { data: propDocs }, { data: clientDocs }] = await Promise.all([
    supabase.from("properties").select("*").limit(200),
    supabase.from("clients").select("*").order("nome").limit(200),
    supabase.from("property_documents").select("id, property_id"),
    supabase.from("client_documents").select("id, status"),
  ]);

  const list = (properties ?? []) as Property[];
  const clientList = (clients ?? []) as Client[];

  // Métricas (dashboard)
  const ids = list.map((p) => p.id);
  const recordsById: Record<string, { status: LegalStatus }> = {};
  if (ids.length) {
    const { data: legal } = await supabase.from("legal_records").select("property_id, status").in("property_id", ids);
    for (const l of legal ?? []) recordsById[l.property_id] = l as { status: LegalStatus };
  }
  const aprovados = list.filter((p) => recordsById[p.id]?.status === "aprovado").length;
  const pendentes = list.filter((p) => ["em_analise", "pendente"].includes(recordsById[p.id]?.status ?? "nao_iniciado")).length;
  const totalPropDocs = (propDocs ?? []).length;
  const totalClientDocs = (clientDocs ?? []).length;
  const clientDocsAssinados = (clientDocs ?? []).filter((d: { status: string }) => d.status === "assinado").length;

  // Aba "Imóveis anexados" (documentos anexados a imóveis) — só diretoria
  const imoveis = list.map((p) => ({
    id: p.id,
    codigo: p.codigo,
    titulo: p.titulo || PROPERTY_TYPE_LABELS[p.type],
    cidade: [p.cidade, p.uf].filter(Boolean).join("/"),
    status: recordsById[p.id]?.status ?? ("nao_iniciado" as LegalStatus),
    docs: (propDocs ?? []).filter((d: { property_id: string }) => d.property_id === p.id).length,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl text-arini">Jurídico</h1>
        <p className="text-muted-foreground mt-1">Análise documental de imóveis e documentos de clientes.</p>
      </div>

      {/* Dashboard de controle */}
      <div className="grid md:grid-cols-5 gap-4">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Imóveis aprovados</div><div className="text-2xl text-emerald-700 font-semibold">{aprovados}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Em análise/pendente</div><div className="text-2xl text-amber-600 font-semibold">{pendentes}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Docs. de imóveis</div><div className="text-2xl text-arini font-semibold">{totalPropDocs}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Docs. de clientes</div><div className="text-2xl text-arini font-semibold">{totalClientDocs}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Docs. assinados</div><div className="text-2xl text-arini font-semibold">{clientDocsAssinados}</div></CardContent></Card>
      </div>

      <JuridicoTabs diretoria={diretoria}>
        {{
          imoveis: (
            <div className="grid lg:grid-cols-2 gap-4">
              {imoveis.map((p) => (
                <Card key={p.id}>
                  <CardHeader>
                    <CardTitle className="flex items-center justify-between">
                      <span className="text-base">{p.codigo} — {p.titulo}</span>
                      <Badge variant={STATUS_BADGE[p.status]}>{p.status}</Badge>
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm text-muted-foreground">{p.cidade} · {p.docs} documento(s)</p>
                    <Link href={`/admin/juridico/${p.id}`} className="text-sm text-arini hover:text-gold-dark mt-2 inline-block">Abrir análise →</Link>
                  </CardContent>
                </Card>
              ))}
              {imoveis.length === 0 && <Card><CardContent className="py-10 text-center text-muted-foreground">Sem imóveis cadastrados.</CardContent></Card>}
            </div>
          ),
          clientes: (
            <Card>
              <CardHeader><CardTitle>Documentos por cliente</CardTitle></CardHeader>
              <CardContent>
                <table className="w-full text-sm">
                  <thead className="text-left text-xs uppercase text-muted-foreground"><tr><th className="py-2">Cliente</th><th>Tipo</th><th>Contato</th></tr></thead>
                  <tbody>
                    {clientList.map((c) => (
                      <tr key={c.id} className="border-t hover:bg-muted/30">
                        <td className="py-2"><Link href={`/admin/clientes/${c.id}`} className="text-arini hover:text-gold-dark font-medium">{c.nome}</Link></td>
                        <td><Badge variant="outline">{CLIENT_TYPE_LABELS[c.tipo as ClientType] ?? c.tipo}</Badge></td>
                        <td>{c.telefone ?? c.email ?? "—"}</td>
                      </tr>
                    ))}
                    {clientList.length === 0 && <tr><td colSpan={3} className="py-6 text-center text-muted-foreground">Nenhum cliente. Cadastre em Clientes.</td></tr>}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ),
        }}
      </JuridicoTabs>
    </div>
  );
}
