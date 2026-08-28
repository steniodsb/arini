import Link from "next/link";
import { requireSector } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Users } from "lucide-react";
import {
  DIAS_SEMANA_LABELS, SECTOR_LABELS,
  type Colaborador, type TimeEntry,
} from "@/lib/types";
import { fmtHours, fmtSaldo, fmtCarga, resumoDoPeriodo } from "@/lib/ponto";

export const dynamic = "force-dynamic";

/** "2026-08-01" → Date local. `new Date("2026-08-01")` seria UTC e voltaria um dia. */
function dataLocal(iso: string, fimDoDia = false): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return fimDoDia ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d);
}

function iso(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default async function RelatorioPontoPage({
  searchParams,
}: {
  searchParams: { colaborador?: string; de?: string; ate?: string };
}) {
  await requireSector(["administrativo", "admin_central"]);
  const supabase = createSupabaseServer();

  const hoje = new Date();
  const padraoDe = iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
  const padraoAte = iso(hoje);
  const de = searchParams.de || padraoDe;
  const ate = searchParams.ate || padraoAte;

  const { data: colabsData } = await supabase
    .from("colaboradores").select("*").eq("ativo", true).order("nome");
  const colaboradores = (colabsData ?? []) as Colaborador[];

  const selecionadoId = searchParams.colaborador || colaboradores[0]?.id || null;
  const selecionado = colaboradores.find((c) => c.id === selecionadoId) ?? null;

  let resumo = null;
  if (selecionado) {
    const { data } = await supabase
      .from("time_entries")
      .select("*")
      .eq("colaborador_id", selecionado.id)
      .gte("registrado_em", dataLocal(de).toISOString())
      .lte("registrado_em", dataLocal(ate, true).toISOString())
      .order("registrado_em", { ascending: false });
    resumo = resumoDoPeriodo(
      (data ?? []) as TimeEntry[],
      selecionado,
      dataLocal(de),
      dataLocal(ate, true),
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-3xl text-arini">Relatório individual</h1>
          <p className="text-muted-foreground mt-1">
            Horas cumpridas por pessoa no período, comparadas com a jornada dela.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ponto/colaboradores"><Users size={14} /> Colaboradores</Link>
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href="/admin/ponto"><ArrowLeft size={14} /> Voltar</Link>
          </Button>
        </div>
      </div>

      {/* Form GET: o período fica na URL, então o relatório é compartilhável
          e sobrevive ao F5 — o que um estado de client component não faria. */}
      <Card>
        <CardContent className="pt-6">
          <form className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor="colaborador" className="block text-xs uppercase text-muted-foreground mb-1">
                Colaborador
              </label>
              <select
                id="colaborador" name="colaborador" defaultValue={selecionadoId ?? ""}
                className="h-10 rounded-md border bg-background px-3 text-sm min-w-[220px]"
              >
                {colaboradores.map((c) => (
                  <option key={c.id} value={c.id}>{c.nome}</option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="de" className="block text-xs uppercase text-muted-foreground mb-1">De</label>
              <input id="de" name="de" type="date" defaultValue={de}
                     className="h-10 rounded-md border bg-background px-3 text-sm" />
            </div>
            <div>
              <label htmlFor="ate" className="block text-xs uppercase text-muted-foreground mb-1">Até</label>
              <input id="ate" name="ate" type="date" defaultValue={ate}
                     className="h-10 rounded-md border bg-background px-3 text-sm" />
            </div>
            <Button type="submit" variant="gold">Gerar relatório</Button>
          </form>
        </CardContent>
      </Card>

      {!selecionado ? (
        <Card><CardContent className="pt-6 text-sm text-muted-foreground">
          Nenhum colaborador ativo cadastrado. Cadastre em{" "}
          <Link href="/admin/ponto/colaboradores" className="underline">Colaboradores</Link>.
        </CardContent></Card>
      ) : resumo && (
        <>
          <Card>
            <CardHeader>
              <CardTitle>{selecionado.nome}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {selecionado.setor ? SECTOR_LABELS[selecionado.setor] : "—"}
                {selecionado.cargo ? ` · ${selecionado.cargo}` : ""}
                {" · "}{fmtCarga(selecionado.carga_horaria_min)}/dia
                {" · "}{selecionado.dias_semana.map((d) => DIAS_SEMANA_LABELS[d]).join(", ")}
              </p>
            </CardHeader>
            <CardContent className="grid sm:grid-cols-4 gap-4">
              <div>
                <div className="text-xs uppercase text-muted-foreground">Horas cumpridas</div>
                <div className="text-2xl text-arini font-semibold">{fmtHours(resumo.trabalhadoMs)}</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Esperado no período</div>
                <div className="text-2xl font-semibold">{fmtHours(resumo.esperadoMs)}</div>
                <div className="text-[11px] text-muted-foreground">{resumo.diasDeEscala} dias de escala</div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Saldo</div>
                <div className={`text-2xl font-semibold ${resumo.saldoMs < 0 ? "text-red-600" : "text-emerald-600"}`}>
                  {fmtSaldo(resumo.saldoMs)}
                </div>
              </div>
              <div>
                <div className="text-xs uppercase text-muted-foreground">Dias com registro</div>
                <div className="text-2xl font-semibold">{resumo.diasComRegistro}</div>
                {resumo.diasEmAberto > 0 && (
                  <div className="text-[11px] text-amber-600">{resumo.diasEmAberto} em aberto</div>
                )}
              </div>
            </CardContent>
          </Card>

          {/* Feriado não existe no sistema; sem este aviso, o saldo negativo
              de um mês com feriado vira discussão sobre hora não paga. */}
          <p className="text-[11px] text-muted-foreground -mt-3">
            O esperado conta os dias da escala no período. Feriados não são descontados —
            um feriado aparece aqui como um dia de saldo negativo.
          </p>

          <Card>
            <CardHeader><CardTitle>Por dia</CardTitle></CardHeader>
            <CardContent className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-muted-foreground">
                  <tr><th className="py-2">Dia</th><th>Registros</th><th>Horas</th><th>Saldo do dia</th></tr>
                </thead>
                <tbody>
                  {resumo.porDia.map((d) => {
                    const esperadoDia = selecionado.carga_horaria_min * 60_000;
                    return (
                      <tr key={d.dia} className="border-t">
                        <td className="py-2">{d.dia}</td>
                        <td className="text-xs text-muted-foreground">{d.regs}</td>
                        <td className="font-medium">
                          {fmtHours(d.ms)} {d.aberto && <Badge variant="warning">em aberto</Badge>}
                        </td>
                        <td className={d.ms - esperadoDia < 0 ? "text-red-600" : "text-emerald-600"}>
                          {d.aberto ? "—" : fmtSaldo(d.ms - esperadoDia)}
                        </td>
                      </tr>
                    );
                  })}
                  {resumo.porDia.length === 0 && (
                    <tr><td colSpan={4} className="py-8 text-center text-muted-foreground">
                      Nenhum registro no período.
                    </td></tr>
                  )}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
