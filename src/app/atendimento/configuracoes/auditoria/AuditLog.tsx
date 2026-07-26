"use client";

import { Fragment, useCallback, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, SelectInput, EmptyState, Card, Table, Alerta, Spinner, inputCls,
} from "@/components/atendimento/ui";
import type { AuditEntry } from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import { ScrollText, Download, Search, ChevronRight, ChevronDown } from "lucide-react";

/** Quantas linhas por lote. Exportado porque a page usa o mesmo número. */
export const PAGINA = 100;

/** Teto do CSV: exporta o filtro inteiro, não só o que está na tela. */
const LIMITE_EXPORT = 5000;

const PERIODOS = [
  { valor: "7", rotulo: "Últimos 7 dias" },
  { valor: "30", rotulo: "Últimos 30 dias" },
  { valor: "90", rotulo: "Últimos 90 dias" },
  { valor: "", rotulo: "Todo o período" },
];

/**
 * Cor por família de ação. Olhando a lista de longe, vermelho = alguém
 * apagou alguma coisa; é o que mais importa achar rápido num log.
 */
function tomDaAcao(acao: string): string {
  const a = acao.toLowerCase();
  if (a.startsWith("cri") || a.startsWith("emit")) return "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300";
  if (a.startsWith("atualiz") || a.startsWith("edit") || a.startsWith("alter")) return "bg-sky-500/12 text-sky-700 dark:text-sky-300";
  if (a.startsWith("exclu") || a.startsWith("remov") || a.startsWith("revog") || a.startsWith("apag")) return "bg-red-500/12 text-red-700 dark:text-red-300";
  if (a.startsWith("entr") || a.startsWith("login") || a.startsWith("saiu")) return "bg-violet-500/12 text-violet-700 dark:text-violet-300";
  return "bg-muted text-muted-foreground";
}

/** Campo de texto do CSV no dialeto que o Excel BR entende. */
function celulaCsv(v: unknown): string {
  const s = v == null ? "" : typeof v === "string" ? v : JSON.stringify(v);
  // Quebra de linha dentro de célula confunde o Excel quando o arquivo é
  // aberto com separador ';' — trocamos por espaço.
  return `"${s.replace(/"/g, '""').replace(/[\r\n]+/g, " ")}"`;
}

type Filtros = { busca: string; ator: string; entidade: string; dias: string };

export function AuditLog({
  initial,
  atores,
  entidades,
}: {
  initial: AuditEntry[];
  atores: { id: string; nome: string }[];
  entidades: string[];
}) {
  const [linhas, setLinhas] = useState(initial);
  const [filtros, setFiltros] = useState<Filtros>({ busca: "", ator: "", entidade: "", dias: "30" });
  const [carregando, setCarregando] = useState(false);
  const [exportando, setExportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [expandido, setExpandido] = useState<string | null>(null);
  // Assume que há mais enquanto o último lote veio cheio.
  const [temMais, setTemMais] = useState(initial.length === PAGINA);
  // Enquanto ninguém filtrou nada, os dados são os do servidor — usamos isso
  // para distinguir "log vazio" de "filtro sem resultado".
  const [filtrado, setFiltrado] = useState(false);

  /** Monta a consulta com os filtros correntes. `f` explícito porque o
   *  estado do React ainda não atualizou quando o filtro acaba de mudar. */
  const montarQuery = useCallback((f: Filtros) => {
    let q = createSupabaseBrowser()
      .from("atendimento_audit_log")
      .select("*")
      .order("created_at", { ascending: false });

    if (f.ator) q = q.eq("ator_id", f.ator);
    if (f.entidade) q = q.eq("entidade", f.entidade);
    if (f.dias) {
      const desde = new Date(Date.now() - Number(f.dias) * 86_400_000).toISOString();
      q = q.gte("created_at", desde);
    }
    if (f.busca.trim()) {
      const t = f.busca.trim().replace(/[%,()]/g, "");
      // Busca livre nos campos de texto. `detalhes` é jsonb e fica de fora:
      // ilike em jsonb exigiria cast e deixaria a consulta lenta sem índice.
      q = q.or(
        `ator_nome.ilike.%${t}%,acao.ilike.%${t}%,entidade.ilike.%${t}%,entidade_id.ilike.%${t}%,ip.ilike.%${t}%`,
      );
    }
    return q;
  }, []);

  const buscar = useCallback(
    async (f: Filtros) => {
      setCarregando(true);
      setErro(null);
      const { data, error } = await montarQuery(f).range(0, PAGINA - 1);
      setCarregando(false);
      if (error) { setErro(error.message); return; }
      const lista = (data ?? []) as AuditEntry[];
      setLinhas(lista);
      setTemMais(lista.length === PAGINA);
      setExpandido(null);
    },
    [montarQuery],
  );

  function aplicar(patch: Partial<Filtros>) {
    const novos = { ...filtros, ...patch };
    setFiltros(novos);
    setFiltrado(true);
    void buscar(novos);
  }

  async function carregarMais() {
    setCarregando(true);
    const { data, error } = await montarQuery(filtros).range(linhas.length, linhas.length + PAGINA - 1);
    setCarregando(false);
    if (error) { setErro(error.message); return; }
    const lote = (data ?? []) as AuditEntry[];
    setLinhas((l) => [...l, ...lote]);
    setTemMais(lote.length === PAGINA);
  }

  async function exportarCsv() {
    setExportando(true);
    setErro(null);
    const { data, error } = await montarQuery(filtros).range(0, LIMITE_EXPORT - 1);
    setExportando(false);
    if (error) { setErro(error.message); return; }

    const registros = (data ?? []) as AuditEntry[];
    const cabecalho = ["Data/hora", "Ator", "Ação", "Entidade", "ID da entidade", "IP", "Detalhes"];
    const corpo = registros.map((r) =>
      [
        formatDateTimeBR(r.created_at),
        r.ator_nome ?? "sistema",
        r.acao,
        r.entidade,
        r.entidade_id ?? "",
        r.ip ?? "",
        r.detalhes ? JSON.stringify(r.detalhes) : "",
      ]
        .map(celulaCsv)
        .join(";"),
    );

    // BOM + separador ';': é o que faz o Excel em português abrir o arquivo
    // já com as colunas separadas e os acentos corretos.
    const csv = "﻿" + [cabecalho.map(celulaCsv).join(";"), ...corpo].join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `auditoria-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Registro de auditoria"
        descricao="Quem fez o quê, quando e de onde."
        acoes={
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => void exportarCsv()}
            disabled={exportando || linhas.length === 0}
          >
            {exportando ? <Spinner size={14} /> : <Download size={15} />} Exportar CSV
          </Button>
        }
      />

      <Alerta tipo="info">
        O registro é gravado pelo servidor e ninguém consegue editá-lo pela aplicação. Hoje ele ainda
        cobre poucas ações (emissão e revogação de tokens, teste de webhook) — os demais pontos de
        escrita passam a registrar conforme forem sendo ligados.
      </Alerta>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* ---------- Filtros ---------- */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            className={`${inputCls} pl-8`}
            placeholder="Buscar por ator, ação, entidade, IP…"
            value={filtros.busca}
            onChange={(e) => setFiltros({ ...filtros, busca: e.target.value })}
            onKeyDown={(e) => { if (e.key === "Enter") aplicar({}); }}
            onBlur={() => aplicar({})}
          />
        </div>

        <SelectInput
          className="w-auto"
          value={filtros.ator}
          onChange={(e) => aplicar({ ator: e.target.value })}
        >
          <option value="">Todos os atores</option>
          {atores.map((a) => (
            <option key={a.id} value={a.id}>{a.nome}</option>
          ))}
        </SelectInput>

        <SelectInput
          className="w-auto"
          value={filtros.entidade}
          onChange={(e) => aplicar({ entidade: e.target.value })}
        >
          <option value="">Todas as entidades</option>
          {entidades.map((e) => (
            <option key={e} value={e}>{e}</option>
          ))}
        </SelectInput>

        <SelectInput
          className="w-auto"
          value={filtros.dias}
          onChange={(e) => aplicar({ dias: e.target.value })}
        >
          {PERIODOS.map((p) => (
            <option key={p.rotulo} value={p.valor}>{p.rotulo}</option>
          ))}
        </SelectInput>

        {carregando && <Spinner size={15} />}
      </div>

      {linhas.length === 0 ? (
        <EmptyState
          icone={<ScrollText size={34} />}
          titulo={filtrado ? "Nada encontrado com esses filtros" : "Nenhum registro ainda"}
          descricao={
            filtrado
              ? "Tente ampliar o período ou limpar a busca."
              : "O registro vai enchendo sozinho conforme o time usa o sistema — cada criação, alteração e exclusão aparece aqui."
          }
        />
      ) : (
        <Card>
          <Table colunas={["", "Data/hora", "Ator", "Ação", "Entidade", "IP"]}>
            {linhas.map((r) => {
              const aberto = expandido === r.id;
              const temDetalhes = r.detalhes != null && Object.keys(r.detalhes).length > 0;
              return (
                <Fragment key={r.id}>
                  <tr
                    className="hover:bg-muted/30 cursor-pointer align-top"
                    onClick={() => setExpandido(aberto ? null : r.id)}
                  >
                    <td className="px-2 py-2 text-muted-foreground">
                      {temDetalhes
                        ? (aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />)
                        : <span className="inline-block w-[15px]" />}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {formatDateTimeBR(r.created_at)}
                    </td>
                    <td className="px-3 py-2">{r.ator_nome ?? <span className="text-muted-foreground">sistema</span>}</td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] leading-tight ${tomDaAcao(r.acao)}`}>
                        {r.acao}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div>{r.entidade}</div>
                      {r.entidade_id && (
                        <code className="text-[11px] text-muted-foreground break-all">{r.entidade_id}</code>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">{r.ip ?? "—"}</td>
                  </tr>

                  {aberto && temDetalhes && (
                    <tr className="bg-muted/20">
                      <td colSpan={6} className="px-4 py-3">
                        <div className="text-xs font-medium mb-1.5">Detalhes</div>
                        <pre className="rounded-lg border bg-card p-3 overflow-x-auto text-[11px] leading-relaxed">
{JSON.stringify(r.detalhes, null, 2)}
                        </pre>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>

          {temMais && (
            <div className="p-3 border-t flex justify-center">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => void carregarMais()}
                disabled={carregando}
              >
                {carregando && <Spinner size={14} />} Carregar mais
              </Button>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}
