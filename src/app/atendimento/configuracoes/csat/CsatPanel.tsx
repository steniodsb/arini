"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { EmptyState, Card, Table, Alerta, Spinner } from "@/components/atendimento/ui";
import type { AgentOption, CsatResponse } from "@/lib/types";
import { Star } from "lucide-react";

const PERIODOS = [7, 30, 90] as const;
type Periodo = (typeof PERIODOS)[number];

/** Estrelas preenchidas até `nota` (de 5). */
function Estrelas({ nota, tamanho = 16 }: { nota: number; tamanho?: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 align-middle">
      {[1, 2, 3, 4, 5].map((i) => (
        <Star
          key={i}
          size={tamanho}
          className={i <= Math.round(nota) ? "text-amber-500" : "text-muted-foreground/25"}
          fill={i <= Math.round(nota) ? "currentColor" : "none"}
        />
      ))}
    </span>
  );
}

function formatarData(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
}

export function CsatPanel({ agents }: { agents: AgentOption[] }) {
  const [periodo, setPeriodo] = useState<Periodo>(30);
  const [respostas, setRespostas] = useState<CsatResponse[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);

  const carregar = useCallback(async (dias: Periodo) => {
    setCarregando(true);
    setErro(null);
    const desde = new Date(Date.now() - dias * 24 * 60 * 60 * 1000).toISOString();
    const { data, error } = await createSupabaseBrowser()
      .from("atendimento_csat")
      .select("*")
      .gte("enviado_em", desde)
      .order("enviado_em", { ascending: false })
      .limit(1000);
    setCarregando(false);
    if (error) { setErro(error.message); return; }
    setRespostas((data ?? []) as CsatResponse[]);
  }, []);

  useEffect(() => { void carregar(periodo); }, [periodo, carregar]);

  const nomeAgente = useMemo(() => {
    const mapa = new Map(agents.map((a) => [a.id, a.nome]));
    return (id: string | null) => (id ? mapa.get(id) ?? "—" : "—");
  }, [agents]);

  const metricas = useMemo(() => {
    const enviados = respostas.length;
    const respondidas = respostas.filter((r) => r.nota != null && r.respondido_em != null);
    const total = respondidas.length;
    const soma = respondidas.reduce((acc, r) => acc + (r.nota ?? 0), 0);
    const distribuicao = [1, 2, 3, 4, 5].map(
      (n) => ({ nota: n, qtd: respondidas.filter((r) => r.nota === n).length }),
    );
    return {
      enviados,
      total,
      media: total ? soma / total : 0,
      taxa: enviados ? (total / enviados) * 100 : 0,
      distribuicao,
      ultimas: respondidas
        .slice()
        .sort((a, b) => (b.respondido_em ?? "").localeCompare(a.respondido_em ?? ""))
        .slice(0, 50),
    };
  }, [respostas]);

  return (
    <div className="space-y-5">
      <Alerta tipo="info">
        O CSAT é ligado <strong>por caixa de entrada</strong>. Ative a pesquisa e edite o texto em{" "}
        <Link href="/atendimento/configuracoes/caixas" className="underline font-medium">
          Caixas de entrada
        </Link>
        , aba CSAT.
      </Alerta>

      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground">Período:</span>
        {PERIODOS.map((p) => (
          <Button
            key={p}
            type="button"
            size="sm"
            variant={periodo === p ? "gold" : "outline"}
            onClick={() => setPeriodo(p)}
          >
            {p} dias
          </Button>
        ))}
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {carregando ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-10 justify-center">
          <Spinner /> Carregando respostas…
        </div>
      ) : metricas.enviados === 0 ? (
        <EmptyState
          icone={<Star size={34} />}
          titulo="Nenhuma pesquisa no período"
          descricao="Ative o CSAT numa caixa de entrada para que a pesquisa seja enviada ao cliente quando a conversa for resolvida."
          acao={
            <Button asChild variant="outline" size="sm">
              <Link href="/atendimento/configuracoes/caixas">Configurar caixas</Link>
            </Button>
          }
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Nota média</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className="text-3xl font-semibold text-arini dark:text-gold">
                  {metricas.total ? metricas.media.toFixed(1) : "—"}
                </span>
                <span className="text-xs text-muted-foreground">de 5</span>
              </div>
              <div className="mt-2">
                <Estrelas nota={metricas.media} tamanho={22} />
              </div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Respostas</div>
              <div className="mt-1 text-3xl font-semibold">{metricas.total}</div>
              <div className="mt-2 text-xs text-muted-foreground">{metricas.enviados} pesquisas enviadas</div>
            </Card>
            <Card className="p-4">
              <div className="text-xs text-muted-foreground">Taxa de resposta</div>
              <div className="mt-1 text-3xl font-semibold">{metricas.taxa.toFixed(0)}%</div>
              <div className="mt-2 text-xs text-muted-foreground">
                {metricas.total} de {metricas.enviados} responderam
              </div>
            </Card>
          </div>

          <Card titulo="Distribuição das notas">
            <div className="p-4 space-y-2">
              {metricas.distribuicao
                .slice()
                .reverse()
                .map((d) => {
                  const pct = metricas.total ? (d.qtd / metricas.total) * 100 : 0;
                  return (
                    <div key={d.nota} className="flex items-center gap-3">
                      <span className="w-14 shrink-0 text-xs text-muted-foreground inline-flex items-center gap-1">
                        {d.nota} <Star size={12} className="text-amber-500" fill="currentColor" />
                      </span>
                      <div className="flex-1 h-2.5 rounded-full bg-muted overflow-hidden">
                        <div className="h-full rounded-full bg-arini dark:bg-gold" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="w-20 shrink-0 text-right text-xs text-muted-foreground">
                        {d.qtd} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                  );
                })}
            </div>
          </Card>

          <Card titulo="Últimas respostas" descricao="Até 50 avaliações mais recentes do período.">
            {metricas.ultimas.length === 0 ? (
              <p className="p-4 text-sm text-muted-foreground">
                As pesquisas foram enviadas, mas ninguém respondeu ainda.
              </p>
            ) : (
              <Table colunas={["Nota", "Comentário", "Agente", "Respondido em"]}>
                {metricas.ultimas.map((r) => (
                  <tr key={r.id} className="hover:bg-muted/30 align-top">
                    <td className="px-3 py-2 whitespace-nowrap">
                      <Estrelas nota={r.nota ?? 0} tamanho={13} />
                    </td>
                    <td className="px-3 py-2 text-muted-foreground">{r.comentario || "—"}</td>
                    <td className="px-3 py-2 whitespace-nowrap">{nomeAgente(r.agente_id)}</td>
                    <td className="px-3 py-2 whitespace-nowrap text-muted-foreground text-xs">
                      {formatarData(r.respondido_em)}
                    </td>
                  </tr>
                ))}
              </Table>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
