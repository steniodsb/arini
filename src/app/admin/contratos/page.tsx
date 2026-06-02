import Link from "next/link";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { FileText, AlertTriangle } from "lucide-react";
import { NewContractDialog } from "./NewContractDialog";
import { TransactionActions } from "@/components/crm/TransactionActions";

const CONTRACT_TIPO_OPTS = [
  { value: "captacao", label: "Captação" }, { value: "exclusividade", label: "Exclusividade" },
  { value: "venda", label: "Venda" }, { value: "locacao", label: "Locação" },
  { value: "parceria", label: "Parceria" }, { value: "permuta", label: "Permuta" },
];
const CONTRACT_STATUS_OPTS = [
  { value: "pendente", label: "Pendente" }, { value: "digital", label: "Assinatura digital" },
  { value: "fisica", label: "Assinatura física" }, { value: "assinado", label: "Assinado" },
  { value: "cancelado", label: "Cancelado" },
];

const BADGE: Record<string, "muted" | "success" | "warning" | "danger" | "gold"> = {
  pendente: "muted",
  digital: "gold",
  fisica: "gold",
  assinado: "success",
  cancelado: "danger",
};

export default async function ContratosPage() {
  const { profile } = await requireSector(["juridico", "administrativo", "admin_central"]);
  const canManage = isDiretoria(profile);
  const supabase = createSupabaseServer();

  const [{ data: contracts }, { data: exclusividades }, { data: properties }] = await Promise.all([
    supabase.from("contracts").select("*, properties(codigo, titulo, cidade)").order("criado_em", { ascending: false }).limit(200),
    supabase
      .from("properties")
      .select("id, codigo, titulo, exclusividade_de, exclusividade_prazo")
      .eq("exclusividade", true)
      .not("exclusividade_prazo", "is", null)
      .order("exclusividade_prazo", { ascending: true }),
    supabase.from("properties").select("id, codigo, titulo").order("codigo"),
  ]);

  const hoje = new Date();
  const vencendo = (exclusividades ?? []).filter((p) => {
    const prazo = new Date(p.exclusividade_prazo!);
    const diff = (prazo.getTime() - hoje.getTime()) / (1000 * 60 * 60 * 24);
    return diff <= 30;
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini">Contratos</h1>
          <p className="text-muted-foreground mt-1">
            Captação, exclusividade, venda, locação, parceria, permuta.
          </p>
        </div>
        <NewContractDialog properties={(properties ?? []) as { id: string; codigo: string; titulo: string | null }[]} />
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Total</div>
          <div className="text-2xl text-arini font-semibold">{(contracts ?? []).length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Assinados</div>
          <div className="text-2xl text-emerald-600 font-semibold">{(contracts ?? []).filter((c) => c.status_assinatura === "assinado").length}</div>
        </CardContent></Card>
        <Card><CardContent className="pt-6">
          <div className="text-xs uppercase text-muted-foreground">Pendentes</div>
          <div className="text-2xl text-amber-600 font-semibold">{(contracts ?? []).filter((c) => ["pendente","digital","fisica"].includes(c.status_assinatura)).length}</div>
        </CardContent></Card>
      </div>

      {vencendo.length > 0 && (
        <Card className="border-amber-300 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-900"><AlertTriangle size={18} /> Exclusividades vencendo (próximos 30 dias)</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2 text-sm">
              {vencendo.map((p) => (
                <li key={p.id} className="flex items-center justify-between border-b border-amber-200 pb-2">
                  <Link href={`/admin/captacao/${p.id}`} className="text-arini hover:text-gold-dark">
                    <span className="font-mono text-xs">{p.codigo}</span> — {p.titulo ?? "(sem título)"}
                    {p.exclusividade_de && <span className="text-muted-foreground"> · {p.exclusividade_de}</span>}
                  </Link>
                  <span className="text-amber-900 font-medium">vence {formatDateBR(p.exclusividade_prazo)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Todos os contratos</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Criado</th><th>Tipo</th><th>Imóvel</th><th>Valor</th><th>Assinatura</th><th className="text-right">Ações</th></tr>
            </thead>
            <tbody>
              {(contracts ?? []).length === 0 && <tr><td colSpan={6} className="py-8 text-center text-muted-foreground">Nenhum contrato.</td></tr>}
              {(contracts ?? []).map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">{formatDateBR(c.criado_em)}</td>
                  <td><Badge variant="outline">{c.tipo}</Badge></td>
                  <td>
                    {c.properties ? (
                      <Link href={`/admin/captacao/${c.property_id}`} className="text-arini hover:text-gold-dark">
                        <span className="font-mono text-xs">{c.properties.codigo}</span> — {c.properties.titulo ?? c.properties.cidade}
                      </Link>
                    ) : "—"}
                  </td>
                  <td>{formatCurrencyBRL(c.valor)}</td>
                  <td><Badge variant={BADGE[c.status_assinatura] ?? "muted"}>{c.status_assinatura}</Badge></td>
                  <td className="text-right">
                    <div className="flex items-center gap-2 justify-end">
                      {c.arquivo_url && (
                        <a href={c.arquivo_url} target="_blank" rel="noopener" className="text-arini hover:text-gold-dark inline-flex items-center gap-1 text-xs">
                          <FileText size={12} /> Abrir
                        </a>
                      )}
                      <TransactionActions
                        table="contracts"
                        id={c.id}
                        title="Editar contrato"
                        canManage={canManage}
                        fields={[
                          { name: "tipo", label: "Tipo", type: "select", value: c.tipo, options: CONTRACT_TIPO_OPTS },
                          { name: "valor", label: "Valor (R$)", type: "number", step: "0.01", value: c.valor },
                          { name: "status_assinatura", label: "Assinatura", type: "select", value: c.status_assinatura, options: CONTRACT_STATUS_OPTS },
                          { name: "arquivo_url", label: "Link do arquivo", type: "text", value: c.arquivo_url },
                        ]}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
