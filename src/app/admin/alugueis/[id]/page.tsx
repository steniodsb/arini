import Link from "next/link";
import { notFound } from "next/navigation";
import { requireSector, isDiretoria } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatCurrencyBRL, formatDateBR } from "@/lib/utils";
import { ArrowLeft, ExternalLink } from "lucide-react";
import type { LeasePayment } from "@/lib/types";
import { LeasePaymentActions } from "./LeasePaymentActions";

const MANAGE_SECTORS = ["administrativo", "financeiro", "aluguel", "admin_central"];

export default async function LeaseContractPage({ params }: { params: { id: string } }) {
  const { profile } = await requireSector(["administrativo", "juridico", "financeiro", "aluguel", "admin_central"]);
  const canManage = isDiretoria(profile) || MANAGE_SECTORS.includes(profile.sector);
  const supabase = createSupabaseServer();

  const { data: contract } = await supabase
    .from("lease_contracts")
    .select("*, properties(codigo, titulo, cidade, uf), owners(nome, telefone), clients(nome, telefone)")
    .eq("id", params.id)
    .single();
  if (!contract) notFound();
  const c = contract as Record<string, unknown>;
  const prop = c.properties as { codigo?: string; titulo?: string | null; cidade?: string | null; uf?: string | null } | null;
  const own = c.owners as { nome?: string; telefone?: string | null } | null;
  const cli = c.clients as { nome?: string; telefone?: string | null } | null;
  const inqNome = (c.inquilino_nome as string | null) ?? null;
  const inqTel = (c.inquilino_telefone as string | null) ?? null;
  const contratoUrl = (c.contrato_url as string | null) ?? null;

  const { data: payments } = await supabase
    .from("lease_payments")
    .select("*")
    .eq("contract_id", params.id)
    .order("competencia", { ascending: true });
  const pays = (payments ?? []) as LeasePayment[];
  const hojeStr = new Date().toISOString().slice(0, 10);

  const recebido = pays.filter((p) => p.status === "pago").reduce((s, p) => s + Number(p.valor), 0);
  const aReceber = pays.filter((p) => p.status === "pendente" || p.status === "atrasado").reduce((s, p) => s + Number(p.valor), 0);

  return (
    <div className="space-y-6 max-w-5xl">
      <Link href="/admin/alugueis" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-arini">
        <ArrowLeft size={16} /> Voltar para aluguéis
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <div className="text-xs text-muted-foreground font-mono">{prop?.codigo ?? "—"}</div>
          <h1 className="font-display text-3xl text-arini">{prop?.titulo ?? "Contrato de locação"}</h1>
          <div className="text-sm text-muted-foreground mt-1">{[prop?.cidade, prop?.uf].filter(Boolean).join("/")}</div>
        </div>
        <div className="text-right">
          <div className="text-xs uppercase text-muted-foreground">Aluguel</div>
          <div className="text-3xl text-gold-gradient font-semibold">{formatCurrencyBRL(Number(c.valor_aluguel))}</div>
          <Badge variant={c.status === "ativo" ? "success" : "muted"} className="mt-1">{c.status as string}</Badge>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-4">
        <Card>
          <CardHeader><CardTitle>Partes</CardTitle></CardHeader>
          <CardContent className="text-sm space-y-1">
            <div><span className="text-muted-foreground">Inquilino:</span> {cli?.nome ?? inqNome ?? "—"} {(cli?.telefone ?? inqTel) ? <span className="text-muted-foreground">· {cli?.telefone ?? inqTel}</span> : null}</div>
            <div><span className="text-muted-foreground">Proprietário:</span> {own?.nome ?? "—"} {own?.telefone && <span className="text-muted-foreground">· {own.telefone}</span>}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Condições</CardTitle></CardHeader>
          <CardContent className="text-sm grid grid-cols-2 gap-2">
            <div><span className="text-muted-foreground">Vencimento:</span> dia {c.dia_vencimento as number}</div>
            <div><span className="text-muted-foreground">Repasse:</span> +{c.dias_repasse as number} dias</div>
            <div><span className="text-muted-foreground">Taxa adm.:</span> {Number(c.taxa_administracao)}%</div>
            <div><span className="text-muted-foreground">Período:</span> {formatDateBR(c.data_inicio as string)} → {c.data_fim ? formatDateBR(c.data_fim as string) : "—"}</div>
            {contratoUrl && (
              <div className="col-span-2">
                <a href={contratoUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-arini hover:text-gold-dark font-semibold">
                  <ExternalLink size={12} /> Abrir contrato
                </a>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">Recebido</div><div className="text-2xl text-emerald-600 font-semibold">{formatCurrencyBRL(recebido)}</div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="text-xs uppercase text-muted-foreground">A receber</div><div className="text-2xl text-amber-600 font-semibold">{formatCurrencyBRL(aReceber)}</div></CardContent></Card>
      </div>

      <Card>
        <CardHeader><CardTitle>Recebíveis e repasses</CardTitle></CardHeader>
        <CardContent>
          <table className="w-full text-sm">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Competência</th><th>Vencimento</th><th>Valor</th><th>Inquilino</th>
                <th>Repasse até</th><th>Repasse</th>{canManage && <th className="text-right">Ações</th>}
              </tr>
            </thead>
            <tbody>
              {pays.length === 0 && <tr><td colSpan={canManage ? 7 : 6} className="py-6 text-center text-muted-foreground">Sem parcelas geradas.</td></tr>}
              {pays.map((p) => {
                const atrasado = p.status === "pendente" && p.vencimento < hojeStr;
                return (
                  <tr key={p.id} className="border-t">
                    <td className="py-2 text-xs">{formatDateBR(p.competencia)}</td>
                    <td className="text-xs">{formatDateBR(p.vencimento)}</td>
                    <td>{formatCurrencyBRL(Number(p.valor))}</td>
                    <td>
                      {p.status === "pago"
                        ? <Badge variant="success">Pago{p.pago_em ? ` · ${formatDateBR(p.pago_em)}` : ""}</Badge>
                        : <Badge variant={atrasado ? "danger" : "warning"}>{atrasado ? "Atrasado" : "Em dia"}</Badge>}
                    </td>
                    <td className="text-xs">{p.repasse_vencimento ? formatDateBR(p.repasse_vencimento) : "—"}</td>
                    <td>
                      {p.repasse_status === "repassado"
                        ? <Badge variant="success">Repassado</Badge>
                        : <Badge variant="muted">{p.status === "pago" ? "Pendente" : "—"}</Badge>}
                    </td>
                    {canManage && (
                      <td className="text-right">
                        <LeasePaymentActions
                          id={p.id}
                          status={p.status}
                          repasseStatus={p.repasse_status}
                        />
                      </td>
                    )}
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
