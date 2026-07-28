"use client";

/**
 * =====================================================================
 * AgendaLista — a vista de alta densidade.
 * =====================================================================
 *
 * Quem abre a lista quer ver MUITA coisa de uma vez: nada de cartão, nada
 * de espaço em branco generoso. Uma linha por compromisso, agrupadas por
 * dia, com o cabeçalho do dia grudado no topo (`sticky`) enquanto se
 * rola — sem isso, ao descer trinta dias o usuário perde a referência de
 * qual dia está lendo.
 */

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  AGENDA_STATUS_LABELS,
  AGENDA_TIPO_LABELS,
  SECTOR_LABELS,
  type AgendaItem,
  type AgendaStatus,
} from "@/lib/types";
import { Button } from "@/components/ui/button";
import {
  Ban,
  Building2,
  CalendarPlus,
  CalendarX2,
  CheckCircle2,
  Download,
  ExternalLink,
  MapPin,
  MoreHorizontal,
} from "lucide-react";
import {
  chaveDia,
  corDoItem,
  dataDaChave,
  formatarDiaLongo,
  formatarDuracao,
  formatarHora,
  formatarIntervalo,
  iniciais,
  somarDias,
  type VistaProps,
} from "./shared";

type Mudanca = { item: AgendaItem; patch: Partial<AgendaItem> };

/** Cores dos selos de status (hex, para casar com a faixa do tipo). */
const COR_STATUS: Record<AgendaStatus, string> = {
  agendado: "#64748b",
  confirmado: "#0ea5e9",
  concluido: "#10b981",
  cancelado: "#ef4444",
  nao_compareceu: "#f59e0b",
};

export interface AgendaListaProps extends VistaProps {
  onAplicar: (mudancas: Mudanca[]) => void;
}

export function AgendaLista({
  itens,
  inicio,
  fim,
  agentes,
  onMover,
  onAbrir,
  onAplicar,
}: AgendaListaProps) {
  const [menuAberto, setMenuAberto] = useState<string | null>(null);
  const hojeChave = chaveDia(new Date());

  const nomePorId = useMemo(() => new Map(agentes.map((a) => [a.id, a.nome])), [agentes]);

  /** Um grupo por dia que TENHA compromisso — dia vazio na lista é ruído. */
  const dias = useMemo(() => {
    const mapa = new Map<string, AgendaItem[]>();
    for (const item of itens) {
      if (!item.data_hora) continue;
      const chave = chaveDia(item.data_hora);
      const lista = mapa.get(chave);
      if (lista) lista.push(item);
      else mapa.set(chave, [item]);
    }
    return [...mapa.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([chave, lista]) => ({
        chave,
        data: dataDaChave(chave),
        itens: lista.sort((a, b) => (a.data_hora ?? "").localeCompare(b.data_hora ?? "")),
      }));
  }, [itens]);

  function exportarCSV() {
    const cabecalho = [
      "Data", "Hora", "Duração (min)", "Título", "Tipo", "Status",
      "Responsável", "Setor", "Local", "Imóvel", "Lead", "Observações",
    ];
    // Ponto e vírgula porque o Excel em pt-BR usa vírgula como separador
    // decimal e quebraria um CSV separado por vírgula.
    const escapar = (v: string | null | undefined) =>
      `"${(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;

    const linhas = itens.map((i) =>
      [
        i.data_hora ? new Date(i.data_hora).toLocaleDateString("pt-BR") : "",
        i.data_hora ? formatarHora(i.data_hora) : "",
        String(i.duracao_min),
        i.titulo,
        AGENDA_TIPO_LABELS[i.tipo],
        AGENDA_STATUS_LABELS[i.status],
        i.responsavel_id ? nomePorId.get(i.responsavel_id) ?? "" : "",
        i.setor_destino ? SECTOR_LABELS[i.setor_destino] : "",
        i.local ?? "",
        i.property_codigo ?? "",
        i.lead_nome ?? "",
        i.observacoes ?? "",
      ]
        .map(escapar)
        .join(";"),
    );

    // BOM: sem ele o Excel abre o arquivo em ANSI e come os acentos.
    const conteudo = "﻿" + [cabecalho.map(escapar).join(";"), ...linhas].join("\r\n");
    const url = URL.createObjectURL(new Blob([conteudo], { type: "text/csv;charset=utf-8;" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `agenda_${chaveDia(inicio)}_a_${chaveDia(new Date(new Date(fim).getTime() - 1))}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="rounded-lg border bg-card">
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2">
        <span className="text-xs text-muted-foreground">
          {itens.length} compromisso{itens.length === 1 ? "" : "s"} no período
        </span>
        <Button variant="outline" size="sm" onClick={exportarCSV} disabled={itens.length === 0}>
          <Download size={14} /> Exportar CSV
        </Button>
      </div>

      {dias.length === 0 ? (
        <div className="py-12 text-center">
          <CalendarX2 className="mx-auto text-muted-foreground/40" size={28} />
          <p className="mt-2 text-sm text-muted-foreground">
            Nenhum compromisso neste período.
          </p>
        </div>
      ) : (
        <div className="max-h-[70vh] overflow-y-auto">
          {dias.map((dia) => (
            <section key={dia.chave}>
              <header className="sticky top-0 z-10 flex items-center justify-between gap-2 border-y bg-muted/70 px-3 py-1.5 backdrop-blur-sm">
                <h3 className="text-xs font-semibold text-arini">
                  {dia.chave === hojeChave && <span className="text-gold-dark">Hoje · </span>}
                  <span className="capitalize">{formatarDiaLongo(dia.data)}</span>
                </h3>
                <span className="text-[11px] text-muted-foreground tabular-nums">
                  {dia.itens.length}
                </span>
              </header>

              <ul className="divide-y">
                {dia.itens.map((item) => (
                  <Linha
                    key={item.id}
                    item={item}
                    responsavel={
                      item.responsavel_id ? nomePorId.get(item.responsavel_id) ?? null : null
                    }
                    menuAberto={menuAberto === item.id}
                    onMenu={(v) => setMenuAberto(v ? item.id : null)}
                    onAbrir={onAbrir}
                    onStatus={(status) => {
                      onAplicar([{ item, patch: { status } }]);
                      setMenuAberto(null);
                    }}
                    onAdiar={() => {
                      if (item.data_hora) onMover?.(item.id, somarDias(item.data_hora, 1).toISOString());
                      setMenuAberto(null);
                    }}
                  />
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

// =====================================================================

function Linha({
  item,
  responsavel,
  menuAberto,
  onMenu,
  onAbrir,
  onStatus,
  onAdiar,
}: {
  item: AgendaItem;
  responsavel: string | null;
  menuAberto: boolean;
  onMenu: (aberto: boolean) => void;
  onAbrir?: (item: AgendaItem) => void;
  onStatus: (status: AgendaStatus) => void;
  onAdiar: () => void;
}) {
  const cancelado = item.status === "cancelado";
  return (
    <li className="relative flex items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-muted/40">
      {/* Hora */}
      <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground tabular-nums">
        {item.data_hora
          ? item.dia_inteiro
            ? "dia inteiro"
            : formatarIntervalo(item.data_hora, item.duracao_min)
          : "—"}
      </span>

      {/* Barra colorida do tipo */}
      <span
        className="h-6 w-1 shrink-0 rounded-full"
        style={{ backgroundColor: corDoItem(item) }}
        title={AGENDA_TIPO_LABELS[item.tipo]}
      />

      {/* Título + contexto */}
      <button
        onClick={() => onAbrir?.(item)}
        className="min-w-0 flex-1 text-left"
      >
        <span
          className={`text-[13px] font-medium text-arini ${cancelado ? "line-through opacity-60" : ""}`}
        >
          {item.titulo}
        </span>
        <span className="ml-2 text-[11px] text-muted-foreground">
          {AGENDA_TIPO_LABELS[item.tipo]}
          {!item.dia_inteiro && ` · ${formatarDuracao(item.duracao_min)}`}
        </span>
      </button>

      {/* Lead / imóvel — links diretos, é o que o corretor abre em seguida */}
      <div className="hidden md:flex items-center gap-3 shrink-0 text-[11px]">
        {item.lead_id && (
          <Link
            href={`/admin/leads/${item.lead_id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-gold-dark"
          >
            <ExternalLink size={11} /> {item.lead_nome ?? "Lead"}
          </Link>
        )}
        {item.property_id && (
          <Link
            href={`/admin/captacao/${item.property_id}`}
            className="inline-flex items-center gap-1 text-muted-foreground hover:text-gold-dark"
          >
            <Building2 size={11} /> {item.property_codigo ?? "Imóvel"}
          </Link>
        )}
        {item.local && (
          <span className="inline-flex items-center gap-1 text-muted-foreground max-w-[160px]">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{item.local}</span>
          </span>
        )}
      </div>

      {/* Responsável */}
      {responsavel && (
        <span
          title={responsavel}
          className="h-5 w-5 shrink-0 grid place-items-center rounded-full bg-arini text-white text-[9px] font-semibold"
        >
          {iniciais(responsavel)}
        </span>
      )}

      {/* Status */}
      <span
        className="shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium"
        style={{
          borderColor: `${COR_STATUS[item.status]}55`,
          backgroundColor: `${COR_STATUS[item.status]}1a`,
          color: COR_STATUS[item.status],
        }}
      >
        {AGENDA_STATUS_LABELS[item.status]}
      </span>

      {/* Ações */}
      <button
        onClick={() => onMenu(!menuAberto)}
        className="shrink-0 rounded p-1 text-muted-foreground hover:bg-muted hover:text-arini"
        title="Ações"
      >
        <MoreHorizontal size={14} />
      </button>

      {menuAberto && (
        <>
          {/* Camada invisível que fecha o menu ao clicar fora. */}
          <button
            className="fixed inset-0 z-20 cursor-default"
            onClick={() => onMenu(false)}
            aria-label="Fechar menu"
          />
          <div className="absolute right-2 top-8 z-30 w-52 rounded-md border bg-white py-1 shadow-lg">
            <ItemMenu icone={CheckCircle2} onClick={() => onStatus("concluido")}>
              Marcar concluído
            </ItemMenu>
            <ItemMenu icone={CheckCircle2} onClick={() => onStatus("confirmado")}>
              Confirmar
            </ItemMenu>
            <ItemMenu icone={Ban} onClick={() => onStatus("cancelado")}>
              Cancelar
            </ItemMenu>
            <ItemMenu icone={CalendarPlus} onClick={onAdiar}>
              Reagendar +1 dia
            </ItemMenu>
            <ItemMenu
              icone={ExternalLink}
              onClick={() => {
                onMenu(false);
                onAbrir?.(item);
              }}
            >
              Abrir detalhes
            </ItemMenu>
          </div>
        </>
      )}
    </li>
  );
}

function ItemMenu({
  icone: Icone,
  onClick,
  children,
}: {
  icone: typeof CheckCircle2;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs text-arini hover:bg-muted"
    >
      <Icone size={13} className="text-muted-foreground" />
      {children}
    </button>
  );
}
