import Link from "next/link";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { NewLeaseContractDialog } from "./NewLeaseContractDialog";
import { KeyRound, AlertTriangle, ArrowRightLeft } from "lucide-react";

const CONTRATO_STATUS: Record<string, { label: string; variant: "success" | "muted" | "warning" }> = {
  ativo: { label: "Ativo", variant: "success" },
  encerrado: { label: "Encerrado", variant: "muted" },
  suspenso: { label: "Suspenso", variant: "warning" },
};

// Setores que apenas LANÇAM/gerenciam (jurídico é somente leitura).
const MANAGE_SECTORS = ["administrativo", "financeiro", "aluguel", "admin_central"];

export default async function AlugueisPage() {
  const { profile } = await requireSector(["administrativo", "juridico", "financeiro", "aluguel", "admin_central"]);
  const canManage = isDiretoria(profile) || MANAGE_SECTORS.includes(profile.sector);
  const supabase = createSupabaseServer();

  const hoje = new Date();
  const inicioMes = new Date(hoje.getFullYear(), hoje.getMonth(), 1).toISOString().slice(0, 10);
  const fimMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().slice(0, 10);
  const hojeStr = hoje.toISOString().slice(0, 10);

  const [{ data: contracts }, { data: pendentes }, { data: repassesPend }, { data: properties }, { data: owners }, { data: clients }, { data: accounts }] = await Promise.all([
    supabase
      .from("lease_contracts")
      .select("*, properties(codigo, titulo, cidade), owners(nome), clients(nome)")
      .order("created_at", { ascending: false })
      .limit(200),
    // Recebíveis em aberto (inquilino ainda não pagou)
    supabase
      .from("lease_payments")
      .select("id, contract_id, competencia, vencimento, valor, status, lease_contracts(properties(codigo), inquilino_nome, clients(nome))")
      .in("status", ["pendente", "atrasado"])
      .order("vencimento", { ascending: true })
      .limit(100),
    // Repasses ainda não feitos ao proprietário (aluguel já pago)
    supabase
      .from("lease_payments")
      .select("id, repasse_vencimento, valor_repasse, repasse_status, lease_contracts(properties(codigo), owners(nome))")
      .eq("status", "pago")
      .eq("repasse_status", "pendente")
      .order("repasse_vencimento", { ascending: true })
      .limit(100),
    supabase.from("properties").select("id, codigo, titulo, owner_id, valor, category").order("codigo"),
    supabase.from("owners").select("id, nome").order("nome"),
    supabase.from("clients").select("id, nome").eq("ativo", true).order("nome"),
    supabase.from("bank_accounts").select("id, nome").eq("ativo", true).order("nome"),
  ]);

  const contratosList = (contracts ?? []) as Record<string, unknown>[];
  const pend = (pendentes ?? []) as Record<string, unknown>[];
  const repasses = (repassesPend ?? []) as Record<string, unknown>[];

  const ativos = contratosList.filter((c) => c.status === "ativo").length;
  const aReceberMes = pend
    .filter((p) => (p.vencimento as string) >= inicioMes && (p.vencimento as string) <= fimMes)
    .reduce((s, p) => s + Number(p.valor || 0), 0);
  const atrasados = pend.filter((p) => (p.vencimento as string) < hojeStr);
  const repassesValor = repasses.reduce((s, r) => s + Number(r.valor_repasse || 0), 0);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-3xl text-arini flex items-center gap-2"><KeyRound size={26} /> Gestão de Aluguéis</h1>
          <p className="text-muted-foreground mt-1">
            Contratos de locação, recebíveis do inquilino e repasses ao proprietário.
          </p>
        </div>
        {canManage && (
          <NewLeaseContractDialog
            properties={(properties ?? []) as { id: string; codigo: string; titulo: string | null; owner_id: string | null; valor: number | null; category: string }[]}
            owners={(owners ?? []) as { id: string; nome: string }[]}
            clients={(clients ?? []) as { id: string; nome: string }[]}
          />
        )}
      </div>

      <div className="grid md:grid-cols-4 gap-3">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Contratos ativos</div><div className="text-2xl text-arini font-semibold">{ativos}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">A receber (mês)</div><div className="text-2xl text-gold-gradient font-semibold">{formatCurrencyBRL(aReceberMes)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Inquilinos atrasados</div><div className="text-2xl text-red-600 font-semibold">{atrasados.length}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Repasses pendentes</div><div className="text-2xl text-amber-600 font-semibold">{formatCurrencyBRL(repassesValor)}</div></CardContent></Card>
      </div>

      {/* Próximos recebíveis (inquilino) */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><AlertTriangle size={16} /> Recebíveis de aluguel (inquilino)</CardTitle></CardHeader>
        <CardContent>
          {pend.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum recebível em aberto. 🎉</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Imóvel</th><th>Inquilino</th><th>Competência</th><th>Vencimento</th><th>Valor</th><th>Situação</th></tr>
              </thead>
              <tbody>
                {pend.slice(0, 30).map((p) => {
                  const lc = p.lease_contracts as Record<string, unknown> | null;
                  const prop = lc?.properties as { codigo?: string } | null;
                  const cli = lc?.clients as { nome?: string } | null;
                  const atrasado = (p.vencimento as string) < hojeStr;
                  return (
                    <tr key={p.id as string} className="border-t">
                      <td className="py-2 font-mono text-xs">{prop?.codigo ?? "—"}</td>
                      <td>{cli?.nome ?? (lc?.inquilino_nome as string) ?? "—"}</td>
                      <td className="text-xs">{formatDateBR(p.competencia as string)}</td>
                      <td className="text-xs">{formatDateBR(p.vencimento as string)}</td>
                      <td>{formatCurrencyBRL(Number(p.valor))}</td>
                      <td>
                        <Badge variant={atrasado ? "danger" : "warning"}>{atrasado ? "Atrasado" : "Em dia"}</Badge>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Repasses ao proprietário */}
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowRightLeft size={16} /> Repasses ao proprietário</CardTitle></CardHeader>
        <CardContent>
          {repasses.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum repasse pendente.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-muted-foreground">
                <tr><th className="py-2">Imóvel</th><th>Proprietário</th><th>Repasse até</th><th>Valor</th></tr>
              </thead>
              <tbody>
                {repasses.slice(0, 30).map((r) => {
                  const lc = r.lease_contracts as Record<string, unknown> | null;
                  const prop = lc?.properties as { codigo?: string } | null;
                  const own = lc?.owners as { nome?: string } | null;
                  return (
                    <tr key={r.id as string} className="border-t">
                      <td className="py-2 font-mono text-xs">{prop?.codigo ?? "—"}</td>
                      <td>{own?.nome ?? "—"}</td>
                      <td className="text-xs">{r.repasse_vencimento ? formatDateBR(r.repasse_vencimento as string) : "—"}</td>
                      <td>{formatCurrencyBRL(Number(r.valor_repasse || 0))}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>

      {/* Contratos */}
      <Card>
        <CardHeader><CardTitle>Contratos de locação</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr><th className="py-2">Imóvel</th><th>Inquilino</th><th>Proprietário</th><th>Aluguel</th><th>Venc.</th><th>Status</th><th></th></tr>
            </thead>
            <tbody>
              {contratosList.length === 0 && <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">Nenhum contrato de locação cadastrado.</td></tr>}
              {contratosList.map((c) => {
                const prop = c.properties as { codigo?: string; titulo?: string | null; cidade?: string | null } | null;
                const own = c.owners as { nome?: string } | null;
                const cli = c.clients as { nome?: string } | null;
                const st = CONTRATO_STATUS[c.status as string] ?? CONTRATO_STATUS.ativo;
                return (
                  <tr key={c.id as string} className="border-t hover:bg-muted/30">
                    <td className="py-2">
                      <div className="font-mono text-xs">{prop?.codigo ?? "—"}</div>
                      <div className="text-xs text-muted-foreground">{prop?.titulo ?? prop?.cidade ?? ""}</div>
                    </td>
                    <td>{cli?.nome ?? (c.inquilino_nome as string) ?? "—"}</td>
                    <td>{own?.nome ?? "—"}</td>
                    <td>{formatCurrencyBRL(Number(c.valor_aluguel))}</td>
                    <td className="text-xs">dia {c.dia_vencimento as number}</td>
                    <td><Badge variant={st.variant}>{st.label}</Badge></td>
                    <td className="text-right">
                      <Link href={`/admin/alugueis/${c.id}`} className="text-arini hover:text-gold-dark text-xs font-semibold">Abrir →</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
