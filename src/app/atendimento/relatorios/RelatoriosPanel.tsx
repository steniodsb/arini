"use client";

import { useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  BarChart3,
  CalendarClock,
  Download,
  Inbox as InboxIcon,
  Tag,
  Users,
  UsersRound,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alerta, Card, EmptyState, PageHeader, Table, TextInput } from "@/components/atendimento/ui";
import {
  CHANNEL_LABELS,
  CONVERSATION_STATUS_LABELS,
  PRIORITY_LABELS,
  PRIORITY_ORDER,
  WEEKDAY_LABELS,
  type ConversationChannel,
  type ConversationPriority,
  type ConversationStatus,
} from "@/lib/types";

// =====================================================================
// Painel de relatórios do Atendimento.
//
// O servidor entrega 90 dias de linhas brutas; TODO o recorte por período
// e toda a agregação acontecem aqui, em memória. Motivo: trocar de aba ou
// de período é a interação mais frequente da tela e não vale uma ida ao
// banco a cada clique.
// =====================================================================

// ===== Tipos das linhas cruas vindas do servidor =====================

export type RelConversa = {
  id: string;
  canal: ConversationChannel;
  status: ConversationStatus;
  prioridade: ConversationPriority | null;
  responsavel_id: string | null;
  team_id: string | null;
  tags: string[] | null;
  inbox_id: string | null;
  created_at: string;
  resolvida_em: string | null;
  resolvida_por: string | null;
  primeira_resposta_em: string | null;
  sla_violado: boolean | null;
};

export type RelMensagem = {
  conversation_id: string;
  autor_id: string | null;
  created_at: string;
};

export type RelCsat = {
  conversation_id: string;
  agente_id: string | null;
  nota: number | null;
  respondido_em: string | null;
};

export type RelPessoa = { id: string; nome: string };
export type RelEquipe = { id: string; nome: string };
export type RelMembro = { team_id: string; profile_id: string };
export type RelEtiqueta = { id: string; nome: string; cor: string };
export type RelCaixa = { id: string; nome: string; canal: string };

// ===== Helpers de formatação =========================================

/**
 * Duração legível em português a partir de minutos.
 * "45 min", "1 h 12 min", "2 d 3 h". Nulo/negativo vira "—" porque
 * tempo negativo aqui só existe por dado sujo (relógio invertido).
 */
export function formatarDuracao(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos < 0) return "—";
  if (minutos < 1) return "menos de 1 min";
  const total = Math.round(minutos);
  const dias = Math.floor(total / 1440);
  const horas = Math.floor((total % 1440) / 60);
  const min = total % 60;
  if (dias > 0) return horas > 0 ? `${dias} d ${horas} h` : `${dias} d`;
  if (horas > 0) return min > 0 ? `${horas} h ${min} min` : `${horas} h`;
  return `${min} min`;
}

function duracaoOuTraco(minutos: number | null): string {
  return minutos === null ? "—" : formatarDuracao(minutos);
}

/** Minutos entre dois instantes ISO. Nulo quando algum lado falta ou o intervalo é negativo. */
function minutosEntre(inicioIso: string | null, fimIso: string | null): number | null {
  if (!inicioIso || !fimIso) return null;
  const a = new Date(inicioIso).getTime();
  const b = new Date(fimIso).getTime();
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  const diff = (b - a) / 60_000;
  return diff >= 0 ? diff : null;
}

/** Média que devolve null (e não 0) quando não há amostra — evita "0 min" mentiroso. */
function media(valores: number[]): number | null {
  if (valores.length === 0) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

function percentual(parte: number, total: number): number {
  return total > 0 ? (parte / total) * 100 : 0;
}

function numeroBr(valor: number, casas = 1): string {
  return valor.toLocaleString("pt-BR", { minimumFractionDigits: casas, maximumFractionDigits: casas });
}

// ===== Helpers de data (sempre no fuso local) ========================

function chaveDia(d: Date): string {
  const mes = `${d.getMonth() + 1}`.padStart(2, "0");
  const dia = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${mes}-${dia}`;
}

function rotuloDia(chave: string): string {
  const [, mes, dia] = chave.split("-");
  return `${dia}/${mes}`;
}

function inicioDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function fimDoDia(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** "2026-07-26" (valor de um <input type="date">) para Date local. */
function deInputDate(valor: string): Date | null {
  const partes = valor.split("-").map(Number);
  if (partes.length !== 3 || partes.some((n) => !Number.isFinite(n))) return null;
  const [ano, mes, dia] = partes;
  if (!ano || !mes || !dia) return null;
  return new Date(ano, mes - 1, dia);
}

// ===== Exportação CSV ================================================

type CelulaCsv = string | number | null;

function campoCsv(valor: CelulaCsv): string {
  if (valor === null || valor === undefined) return "";
  if (typeof valor === "number") {
    return Number.isInteger(valor) ? String(valor) : valor.toFixed(2).replace(".", ",");
  }
  const texto = String(valor);
  return /[";\r\n]/.test(texto) ? `"${texto.replace(/"/g, '""')}"` : texto;
}

/** Gera e baixa o CSV no próprio navegador. BOM + ";" para o Excel pt-BR abrir certo. */
function baixarCsv(nomeArquivo: string, linhas: CelulaCsv[][]) {
  const texto = linhas.map((linha) => linha.map(campoCsv).join(";")).join("\r\n");
  const blob = new Blob([`﻿${texto}`], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = nomeArquivo;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// ===== Estilo dos gráficos ===========================================

// Paleta fixa escolhida para ter contraste suficiente no claro E no escuro.
const PALETA = [
  "#10b981", "#3b82f6", "#a855f7", "#f59e0b",
  "#ef4444", "#14b8a6", "#ec4899", "#6366f1", "#84cc16",
];

const COR_EIXO = "hsl(var(--muted-foreground))";
const COR_GRADE = "hsl(var(--border))";

const ESTILO_TOOLTIP: React.CSSProperties = {
  borderRadius: 8,
  border: "1px solid hsl(var(--border))",
  background: "hsl(var(--card))",
  color: "hsl(var(--foreground))",
  fontSize: 12,
};

const CANAL_CAIXA_LABELS: Record<string, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  telegram: "Telegram",
  email: "E-mail",
  sms: "SMS",
  site: "Site (widget)",
  api: "API",
};

// ===== Abas e período ================================================

type Aba = "visao" | "agentes" | "equipes" | "etiquetas" | "caixas" | "tempo";
type Periodo = "hoje" | "7" | "30" | "90" | "custom";

const ABAS: { chave: Aba; label: string; icone: typeof BarChart3 }[] = [
  { chave: "visao", label: "Visão geral", icone: BarChart3 },
  { chave: "agentes", label: "Agentes", icone: Users },
  { chave: "equipes", label: "Equipes", icone: UsersRound },
  { chave: "etiquetas", label: "Etiquetas", icone: Tag },
  { chave: "caixas", label: "Caixas de entrada", icone: InboxIcon },
  { chave: "tempo", label: "Conversas no tempo", icone: CalendarClock },
];

const PERIODOS: { chave: Periodo; label: string }[] = [
  { chave: "hoje", label: "Hoje" },
  { chave: "7", label: "7 dias" },
  { chave: "30", label: "30 dias" },
  { chave: "90", label: "90 dias" },
  { chave: "custom", label: "Personalizado" },
];

// ===== Linhas agregadas ==============================================

type LinhaAgente = {
  id: string;
  nome: string;
  atribuidas: number;
  resolvidas: number;
  mensagens: number;
  tmpr: number | null;
  tmr: number | null;
  csat: number | null;
};

type LinhaEquipe = {
  id: string;
  nome: string;
  membros: string[];
  atribuidas: number;
  resolvidas: number;
  tmpr: number | null;
  tmr: number | null;
  csat: number | null;
};

type CampoAgente = keyof Omit<LinhaAgente, "id">;
type CampoEquipe = "nome" | "atribuidas" | "resolvidas" | "tmpr" | "tmr" | "csat";

/** Comparador que joga valores ausentes sempre para o fim, independente da direção. */
function comparar(a: number | string | null, b: number | string | null, desc: boolean): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  const bruto =
    typeof a === "string" && typeof b === "string"
      ? a.localeCompare(b, "pt-BR")
      : Number(a) - Number(b);
  return desc ? -bruto : bruto;
}

// =====================================================================
// Componente principal
// =====================================================================

export function RelatoriosPanel({
  conversas,
  mensagens,
  csat,
  pessoas,
  equipes,
  membros,
  etiquetas,
  caixas,
  janelaDias,
}: {
  conversas: RelConversa[];
  mensagens: RelMensagem[];
  csat: RelCsat[];
  pessoas: RelPessoa[];
  equipes: RelEquipe[];
  membros: RelMembro[];
  etiquetas: RelEtiqueta[];
  caixas: RelCaixa[];
  janelaDias: number;
}) {
  const [aba, setAba] = useState<Aba>("visao");
  const [periodo, setPeriodo] = useState<Periodo>("30");
  const [de, setDe] = useState(() => chaveDia(new Date(Date.now() - 29 * 86_400_000)));
  const [ate, setAte] = useState(() => chaveDia(new Date()));
  const [ordemAgente, setOrdemAgente] = useState<{ campo: CampoAgente; desc: boolean }>({
    campo: "atribuidas",
    desc: true,
  });
  const [ordemEquipe, setOrdemEquipe] = useState<{ campo: CampoEquipe; desc: boolean }>({
    campo: "atribuidas",
    desc: true,
  });

  // ---- Janela do período selecionado --------------------------------
  const { inicio, fim } = useMemo(() => {
    if (periodo === "custom") {
      const a = deInputDate(de);
      const b = deInputDate(ate);
      const ini = a ? inicioDoDia(a) : inicioDoDia(new Date(Date.now() - 29 * 86_400_000));
      const fin = b ? fimDoDia(b) : fimDoDia(new Date());
      // Datas invertidas: troca em vez de devolver período vazio.
      return fin.getTime() < ini.getTime() ? { inicio: inicioDoDia(b ?? new Date()), fim: fimDoDia(a ?? new Date()) } : { inicio: ini, fim: fin };
    }
    const dias = periodo === "hoje" ? 1 : Number(periodo);
    return {
      inicio: inicioDoDia(new Date(Date.now() - (dias - 1) * 86_400_000)),
      fim: fimDoDia(new Date()),
    };
  }, [periodo, de, ate]);

  const dentro = useMemo(() => {
    const a = inicio.getTime();
    const b = fim.getTime();
    return (iso: string | null): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && t >= a && t <= b;
    };
  }, [inicio, fim]);

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of pessoas) m.set(p.id, p.nome);
    return m;
  }, [pessoas]);

  // ---- Recortes ------------------------------------------------------
  const conversasPeriodo = useMemo(
    () => conversas.filter((c) => dentro(c.created_at)),
    [conversas, dentro],
  );

  /** Resolvidas pela DATA DA RESOLUÇÃO (pode ter sido aberta antes do período). */
  const resolvidasNoPeriodo = useMemo(
    () => conversas.filter((c) => dentro(c.resolvida_em)),
    [conversas, dentro],
  );

  const mensagensPeriodo = useMemo(
    () => mensagens.filter((m) => dentro(m.created_at)),
    [mensagens, dentro],
  );

  const csatPeriodo = useMemo(
    () => csat.filter((r) => r.nota !== null && dentro(r.respondido_em)),
    [csat, dentro],
  );

  const vazio = conversasPeriodo.length === 0 && resolvidasNoPeriodo.length === 0;

  // ---- Indicadores da visão geral ------------------------------------
  const resumo = useMemo(() => {
    const total = conversasPeriodo.length;
    const porStatus: Record<ConversationStatus, number> = {
      aberta: 0, pendente: 0, resolvida: 0, adiada: 0,
    };
    for (const c of conversasPeriodo) porStatus[c.status] = (porStatus[c.status] ?? 0) + 1;

    const primeirasRespostas: number[] = [];
    const resolucoes: number[] = [];
    for (const c of conversasPeriodo) {
      const pr = minutosEntre(c.created_at, c.primeira_resposta_em);
      if (pr !== null) primeirasRespostas.push(pr);
      const res = minutosEntre(c.created_at, c.resolvida_em);
      if (res !== null) resolucoes.push(res);
    }

    const notas = csatPeriodo.map((r) => r.nota as number);

    return {
      total,
      porStatus,
      naoAtribuidas: conversasPeriodo.filter((c) => !c.responsavel_id).length,
      slaViolado: conversasPeriodo.filter((c) => c.sla_violado).length,
      resolvidas: resolvidasNoPeriodo.length,
      tmpr: media(primeirasRespostas),
      tmr: media(resolucoes),
      csat: media(notas),
      respostasCsat: notas.length,
    };
  }, [conversasPeriodo, resolvidasNoPeriodo, csatPeriodo]);

  // ---- Série diária (criadas x resolvidas) ----------------------------
  const serieDias = useMemo(() => {
    const mapa = new Map<string, { dia: string; rotulo: string; criadas: number; resolvidas: number }>();
    const cursor = new Date(inicio);
    // Teto de segurança: períodos personalizados longos não devem travar a tela.
    for (let i = 0; cursor.getTime() <= fim.getTime() && i <= 400; i += 1) {
      const k = chaveDia(cursor);
      mapa.set(k, { dia: k, rotulo: rotuloDia(k), criadas: 0, resolvidas: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const c of conversasPeriodo) {
      const item = mapa.get(chaveDia(new Date(c.created_at)));
      if (item) item.criadas += 1;
    }
    for (const c of resolvidasNoPeriodo) {
      const item = mapa.get(chaveDia(new Date(c.resolvida_em as string)));
      if (item) item.resolvidas += 1;
    }
    return Array.from(mapa.values());
  }, [inicio, fim, conversasPeriodo, resolvidasNoPeriodo]);

  // ---- Distribuição por canal ----------------------------------------
  const porCanal = useMemo(() => {
    const acc = new Map<string, number>();
    for (const c of conversasPeriodo) acc.set(c.canal, (acc.get(c.canal) ?? 0) + 1);
    return Array.from(acc.entries())
      .map(([canal, valor]) => ({
        nome: CHANNEL_LABELS[canal as ConversationChannel] ?? canal,
        valor,
      }))
      .sort((a, b) => b.valor - a.valor);
  }, [conversasPeriodo]);

  // ---- Distribuição por prioridade ------------------------------------
  const porPrioridade = useMemo(() => {
    const acc = new Map<string, number>();
    for (const c of conversasPeriodo) acc.set(c.prioridade ?? "sem", (acc.get(c.prioridade ?? "sem") ?? 0) + 1);
    const linhas = PRIORITY_ORDER.map((p) => ({
      chave: p as string,
      nome: PRIORITY_LABELS[p],
      valor: acc.get(p) ?? 0,
    }));
    linhas.push({ chave: "sem", nome: "Sem prioridade", valor: acc.get("sem") ?? 0 });
    return linhas;
  }, [conversasPeriodo]);

  // ---- Agentes --------------------------------------------------------
  const linhasAgente = useMemo<LinhaAgente[]>(() => {
    const acc = new Map<string, LinhaAgente>();
    const garante = (id: string): LinhaAgente => {
      let linha = acc.get(id);
      if (!linha) {
        linha = {
          id,
          nome: nomePorId.get(id) ?? "Agente removido",
          atribuidas: 0, resolvidas: 0, mensagens: 0,
          tmpr: null, tmr: null, csat: null,
        };
        acc.set(id, linha);
      }
      return linha;
    };
    const primeiras = new Map<string, number[]>();
    const resolucoes = new Map<string, number[]>();
    const notas = new Map<string, number[]>();

    for (const c of conversasPeriodo) {
      if (!c.responsavel_id) continue;
      const linha = garante(c.responsavel_id);
      linha.atribuidas += 1;
      const pr = minutosEntre(c.created_at, c.primeira_resposta_em);
      if (pr !== null) {
        const lista = primeiras.get(c.responsavel_id) ?? [];
        lista.push(pr);
        primeiras.set(c.responsavel_id, lista);
      }
      const res = minutosEntre(c.created_at, c.resolvida_em);
      if (res !== null) {
        const lista = resolucoes.get(c.responsavel_id) ?? [];
        lista.push(res);
        resolucoes.set(c.responsavel_id, lista);
      }
    }

    // Crédito da resolução: quem clicou em "resolver"; sem esse dado, o responsável.
    for (const c of resolvidasNoPeriodo) {
      const dono = c.resolvida_por ?? c.responsavel_id;
      if (!dono) continue;
      garante(dono).resolvidas += 1;
    }

    for (const m of mensagensPeriodo) {
      if (!m.autor_id) continue;
      garante(m.autor_id).mensagens += 1;
    }

    for (const r of csatPeriodo) {
      if (!r.agente_id || r.nota === null) continue;
      const lista = notas.get(r.agente_id) ?? [];
      lista.push(r.nota);
      notas.set(r.agente_id, lista);
      garante(r.agente_id);
    }

    const linhas = Array.from(acc.values());
    for (const linha of linhas) {
      linha.tmpr = media(primeiras.get(linha.id) ?? []);
      linha.tmr = media(resolucoes.get(linha.id) ?? []);
      linha.csat = media(notas.get(linha.id) ?? []);
    }
    return linhas;
  }, [conversasPeriodo, resolvidasNoPeriodo, mensagensPeriodo, csatPeriodo, nomePorId]);

  const agentesOrdenados = useMemo(() => {
    const copia = [...linhasAgente];
    copia.sort((a, b) => comparar(a[ordemAgente.campo], b[ordemAgente.campo], ordemAgente.desc));
    return copia;
  }, [linhasAgente, ordemAgente]);

  // ---- Equipes ---------------------------------------------------------
  const linhasEquipe = useMemo<LinhaEquipe[]>(() => {
    const membrosPorEquipe = new Map<string, string[]>();
    for (const m of membros) {
      const lista = membrosPorEquipe.get(m.team_id) ?? [];
      lista.push(nomePorId.get(m.profile_id) ?? "—");
      membrosPorEquipe.set(m.team_id, lista);
    }

    // CSAT não tem team_id — chegamos nele pela conversa avaliada.
    const equipeDaConversa = new Map<string, string | null>();
    for (const c of conversas) equipeDaConversa.set(c.id, c.team_id);

    const base = new Map<string, LinhaEquipe>();
    for (const e of equipes) {
      base.set(e.id, {
        id: e.id,
        nome: e.nome,
        membros: (membrosPorEquipe.get(e.id) ?? []).sort((a, b) => a.localeCompare(b, "pt-BR")),
        atribuidas: 0, resolvidas: 0, tmpr: null, tmr: null, csat: null,
      });
    }
    const semEquipe: LinhaEquipe = {
      id: "__sem__", nome: "Sem equipe", membros: [],
      atribuidas: 0, resolvidas: 0, tmpr: null, tmr: null, csat: null,
    };

    const primeiras = new Map<string, number[]>();
    const resolucoes = new Map<string, number[]>();
    const notas = new Map<string, number[]>();
    const alvo = (id: string | null): LinhaEquipe => (id ? base.get(id) ?? semEquipe : semEquipe);

    for (const c of conversasPeriodo) {
      const linha = alvo(c.team_id);
      linha.atribuidas += 1;
      const pr = minutosEntre(c.created_at, c.primeira_resposta_em);
      if (pr !== null) primeiras.set(linha.id, [...(primeiras.get(linha.id) ?? []), pr]);
      const res = minutosEntre(c.created_at, c.resolvida_em);
      if (res !== null) resolucoes.set(linha.id, [...(resolucoes.get(linha.id) ?? []), res]);
    }
    for (const c of resolvidasNoPeriodo) alvo(c.team_id).resolvidas += 1;
    for (const r of csatPeriodo) {
      if (r.nota === null) continue;
      const linha = alvo(equipeDaConversa.get(r.conversation_id) ?? null);
      notas.set(linha.id, [...(notas.get(linha.id) ?? []), r.nota]);
    }

    const todas = Array.from(base.values()).concat(semEquipe);
    for (const linha of todas) {
      linha.tmpr = media(primeiras.get(linha.id) ?? []);
      linha.tmr = media(resolucoes.get(linha.id) ?? []);
      linha.csat = media(notas.get(linha.id) ?? []);
    }
    // "Sem equipe" só aparece quando tem volume — senão vira ruído.
    return todas.filter((l) => l.id !== "__sem__" || l.atribuidas > 0 || l.resolvidas > 0);
  }, [equipes, membros, conversas, conversasPeriodo, resolvidasNoPeriodo, csatPeriodo, nomePorId]);

  const equipesOrdenadas = useMemo(() => {
    const copia = [...linhasEquipe];
    copia.sort((a, b) => comparar(a[ordemEquipe.campo], b[ordemEquipe.campo], ordemEquipe.desc));
    return copia;
  }, [linhasEquipe, ordemEquipe]);

  // ---- Etiquetas --------------------------------------------------------
  const linhasEtiqueta = useMemo(() => {
    const corPorNome = new Map<string, string>();
    for (const e of etiquetas) corPorNome.set(e.nome, e.cor);

    const acc = new Map<string, number>();
    for (const c of conversasPeriodo) {
      for (const tag of c.tags ?? []) {
        if (!tag) continue;
        acc.set(tag, (acc.get(tag) ?? 0) + 1);
      }
    }
    return Array.from(acc.entries())
      .map(([nome, conversas_], i) => ({
        nome,
        conversas: conversas_,
        cor: corPorNome.get(nome) ?? PALETA[i % PALETA.length],
        percentual: percentual(conversas_, conversasPeriodo.length),
      }))
      .sort((a, b) => b.conversas - a.conversas);
  }, [etiquetas, conversasPeriodo]);

  const conversasComEtiqueta = useMemo(
    () => conversasPeriodo.filter((c) => (c.tags ?? []).length > 0).length,
    [conversasPeriodo],
  );

  // ---- Caixas de entrada -------------------------------------------------
  const linhasCaixa = useMemo(() => {
    type LinhaCaixa = {
      id: string;
      nome: string;
      canal: string;
      total: number;
      aberta: number;
      pendente: number;
      resolvida: number;
      adiada: number;
    };
    const base = new Map<string, LinhaCaixa>();
    for (const c of caixas) {
      base.set(c.id, {
        id: c.id,
        nome: c.nome,
        canal: CANAL_CAIXA_LABELS[c.canal] ?? c.canal,
        total: 0, aberta: 0, pendente: 0, resolvida: 0, adiada: 0,
      });
    }
    const sem: LinhaCaixa = {
      id: "__sem__", nome: "Sem caixa definida", canal: "—",
      total: 0, aberta: 0, pendente: 0, resolvida: 0, adiada: 0,
    };
    for (const c of conversasPeriodo) {
      const linha = (c.inbox_id ? base.get(c.inbox_id) : undefined) ?? sem;
      linha.total += 1;
      linha[c.status] += 1;
    }
    return Array.from(base.values())
      .concat(sem)
      .filter((l) => l.id !== "__sem__" || l.total > 0)
      .sort((a, b) => b.total - a.total);
  }, [caixas, conversasPeriodo]);

  // ---- Conversas no tempo -------------------------------------------------
  const tempo = useMemo(() => {
    const porDiaSemana = WEEKDAY_LABELS.map((label) => ({ dia: label.slice(0, 3), nome: label, conversas: 0 }));
    const grade: number[][] = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    const porHora = Array.from({ length: 24 }, (_, h) => ({ hora: `${`${h}`.padStart(2, "0")}h`, conversas: 0 }));

    for (const c of conversasPeriodo) {
      const d = new Date(c.created_at);
      if (!Number.isFinite(d.getTime())) continue;
      const dia = d.getDay();
      const hora = d.getHours();
      porDiaSemana[dia].conversas += 1;
      porHora[hora].conversas += 1;
      grade[dia][hora] += 1;
    }
    const pico = grade.reduce((max, linha) => Math.max(max, ...linha), 0);
    return { porDiaSemana, porHora, grade, pico };
  }, [conversasPeriodo]);

  // ---- CSV da aba ativa ----------------------------------------------------
  function exportar() {
    const sufixo = `${chaveDia(inicio)}_a_${chaveDia(fim)}`;
    if (aba === "visao") {
      const linhas: CelulaCsv[][] = [
        ["Indicador", "Valor"],
        ["Conversas criadas", resumo.total],
        ["Abertas", resumo.porStatus.aberta],
        ["Pendentes", resumo.porStatus.pendente],
        ["Adiadas", resumo.porStatus.adiada],
        ["Resolvidas no período", resumo.resolvidas],
        ["Não atribuídas", resumo.naoAtribuidas],
        ["SLA violado", resumo.slaViolado],
        ["Tempo médio de 1ª resposta", duracaoOuTraco(resumo.tmpr)],
        ["Tempo médio de resolução", duracaoOuTraco(resumo.tmr)],
        ["CSAT médio", resumo.csat === null ? "—" : numeroBr(resumo.csat, 2)],
        ["Respostas de CSAT", resumo.respostasCsat],
        [],
        ["Dia", "Criadas", "Resolvidas"],
        ...serieDias.map((d): CelulaCsv[] => [d.rotulo, d.criadas, d.resolvidas]),
        [],
        ["Canal", "Conversas"],
        ...porCanal.map((c): CelulaCsv[] => [c.nome, c.valor]),
      ];
      baixarCsv(`relatorio_visao_geral_${sufixo}.csv`, linhas);
      return;
    }
    if (aba === "agentes") {
      baixarCsv(`relatorio_agentes_${sufixo}.csv`, [
        ["Agente", "Atribuídas", "Resolvidas", "Mensagens enviadas", "1ª resposta (média)", "Resolução (média)", "CSAT"],
        ...agentesOrdenados.map((a): CelulaCsv[] => [
          a.nome, a.atribuidas, a.resolvidas, a.mensagens,
          duracaoOuTraco(a.tmpr), duracaoOuTraco(a.tmr),
          a.csat === null ? "—" : numeroBr(a.csat, 2),
        ]),
      ]);
      return;
    }
    if (aba === "equipes") {
      baixarCsv(`relatorio_equipes_${sufixo}.csv`, [
        ["Equipe", "Membros", "Atribuídas", "Resolvidas", "1ª resposta (média)", "Resolução (média)", "CSAT"],
        ...equipesOrdenadas.map((e): CelulaCsv[] => [
          e.nome, e.membros.join(", "), e.atribuidas, e.resolvidas,
          duracaoOuTraco(e.tmpr), duracaoOuTraco(e.tmr),
          e.csat === null ? "—" : numeroBr(e.csat, 2),
        ]),
      ]);
      return;
    }
    if (aba === "etiquetas") {
      baixarCsv(`relatorio_etiquetas_${sufixo}.csv`, [
        ["Etiqueta", "Conversas", "% do total"],
        ...linhasEtiqueta.map((e): CelulaCsv[] => [e.nome, e.conversas, `${numeroBr(e.percentual)}%`]),
      ]);
      return;
    }
    if (aba === "caixas") {
      baixarCsv(`relatorio_caixas_${sufixo}.csv`, [
        ["Caixa de entrada", "Canal", "Total", "Abertas", "Pendentes", "Resolvidas", "Adiadas"],
        ...linhasCaixa.map((c): CelulaCsv[] => [c.nome, c.canal, c.total, c.aberta, c.pendente, c.resolvida, c.adiada]),
      ]);
      return;
    }
    const linhasTempo: CelulaCsv[][] = [["Dia da semana", "Hora", "Conversas"]];
    tempo.grade.forEach((linha, dia) => {
      linha.forEach((valor, hora) => {
        linhasTempo.push([WEEKDAY_LABELS[dia], `${`${hora}`.padStart(2, "0")}:00`, valor]);
      });
    });
    baixarCsv(`relatorio_conversas_no_tempo_${sufixo}.csv`, linhasTempo);
  }

  // =====================================================================
  return (
    <>
      <PageHeader
        titulo="Relatórios"
        descricao={`Desempenho do atendimento — dados dos últimos ${janelaDias} dias.`}
        acoes={
          <Button type="button" variant="outline" size="sm" onClick={exportar} disabled={vazio}>
            <Download size={15} /> Exportar CSV
          </Button>
        }
      />

      {/* Período */}
      <Card className="p-3 flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap gap-1">
          {PERIODOS.map((p) => (
            <button
              key={p.chave}
              type="button"
              onClick={() => setPeriodo(p.chave)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                periodo === p.chave
                  ? "bg-arini text-white dark:bg-gold dark:text-arini"
                  : "text-muted-foreground hover:bg-muted"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        {periodo === "custom" && (
          <div className="flex items-center gap-2">
            <TextInput type="date" value={de} onChange={(e) => setDe(e.target.value)} className="w-auto" />
            <span className="text-xs text-muted-foreground">até</span>
            <TextInput type="date" value={ate} onChange={(e) => setAte(e.target.value)} className="w-auto" />
          </div>
        )}
        <span className="ml-auto text-[11px] text-muted-foreground">
          {inicio.toLocaleDateString("pt-BR")} — {fim.toLocaleDateString("pt-BR")}
        </span>
      </Card>

      {/* Abas */}
      <div className="flex gap-1 overflow-x-auto border-b -mb-px">
        {ABAS.map((a) => {
          const Icone = a.icone;
          const ativa = aba === a.chave;
          return (
            <button
              key={a.chave}
              type="button"
              onClick={() => setAba(a.chave)}
              className={`flex items-center gap-1.5 px-3 py-2 text-sm whitespace-nowrap border-b-2 transition-colors ${
                ativa
                  ? "border-arini text-arini dark:text-gold dark:border-gold font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icone size={15} /> {a.label}
            </button>
          );
        })}
      </div>

      {vazio ? (
        <Card>
          <EmptyState
            titulo="Nenhuma conversa no período"
            descricao="Escolha um intervalo maior ou verifique se os canais já receberam mensagens. Só há dados brutos dos últimos 90 dias."
            icone={<BarChart3 size={34} />}
          />
        </Card>
      ) : (
        <>
          {aba === "visao" && (
            <AbaVisaoGeral resumo={resumo} serie={serieDias} canais={porCanal} prioridades={porPrioridade} />
          )}
          {aba === "agentes" && (
            <AbaAgentes
              linhas={agentesOrdenados}
              ordem={ordemAgente}
              onOrdenar={(campo) =>
                setOrdemAgente((o) => ({ campo, desc: o.campo === campo ? !o.desc : true }))
              }
            />
          )}
          {aba === "equipes" && (
            <AbaEquipes
              linhas={equipesOrdenadas}
              ordem={ordemEquipe}
              onOrdenar={(campo) =>
                setOrdemEquipe((o) => ({ campo, desc: o.campo === campo ? !o.desc : true }))
              }
            />
          )}
          {aba === "etiquetas" && (
            <AbaEtiquetas
              linhas={linhasEtiqueta}
              totalConversas={conversasPeriodo.length}
              comEtiqueta={conversasComEtiqueta}
            />
          )}
          {aba === "caixas" && <AbaCaixas linhas={linhasCaixa} />}
          {aba === "tempo" && <AbaTempo dados={tempo} />}
        </>
      )}
    </>
  );
}

// =====================================================================
// Aba: visão geral
// =====================================================================

function Indicador({ rotulo, valor, detalhe }: { rotulo: string; valor: string | number; detalhe?: string }) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className="text-xl font-semibold text-arini dark:text-gold leading-tight">{valor}</div>
      <div className="text-[11px] text-muted-foreground mt-1">{rotulo}</div>
      {detalhe && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{detalhe}</div>}
    </div>
  );
}

function AbaVisaoGeral({
  resumo,
  serie,
  canais,
  prioridades,
}: {
  resumo: {
    total: number;
    porStatus: Record<ConversationStatus, number>;
    naoAtribuidas: number;
    slaViolado: number;
    resolvidas: number;
    tmpr: number | null;
    tmr: number | null;
    csat: number | null;
    respostasCsat: number;
  };
  serie: { rotulo: string; criadas: number; resolvidas: number }[];
  canais: { nome: string; valor: number }[];
  prioridades: { chave: string; nome: string; valor: number }[];
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Indicador rotulo="Conversas criadas" valor={resumo.total} />
        <Indicador rotulo="Abertas" valor={resumo.porStatus.aberta} detalhe={`${resumo.porStatus.pendente} pendentes`} />
        <Indicador rotulo="Resolvidas no período" valor={resumo.resolvidas} />
        <Indicador rotulo="Não atribuídas" valor={resumo.naoAtribuidas} />
        <Indicador rotulo="1ª resposta (média)" valor={duracaoOuTraco(resumo.tmpr)} />
        <Indicador rotulo="Resolução (média)" valor={duracaoOuTraco(resumo.tmr)} />
        <Indicador
          rotulo="CSAT médio"
          valor={resumo.csat === null ? "—" : `${numeroBr(resumo.csat, 2)} / 5`}
          detalhe={`${resumo.respostasCsat} resposta(s)`}
        />
        <Indicador rotulo="SLA violado" valor={resumo.slaViolado} />
      </div>

      <Card titulo="Conversas por dia" descricao="Criadas x resolvidas ao longo do período.">
        <div className="p-3">
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={serie} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} />
              <XAxis dataKey="rotulo" stroke={COR_EIXO} fontSize={11} minTickGap={18} />
              <YAxis stroke={COR_EIXO} fontSize={11} allowDecimals={false} />
              <Tooltip contentStyle={ESTILO_TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Line type="monotone" dataKey="criadas" name="Criadas" stroke={PALETA[1]} strokeWidth={2} dot={false} />
              <Line type="monotone" dataKey="resolvidas" name="Resolvidas" stroke={PALETA[0]} strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card titulo="Conversas por canal">
          <div className="p-3">
            {canais.length === 0 ? (
              <EmptyState titulo="Sem conversas por canal no período" />
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <PieChart>
                  <Pie data={canais} dataKey="valor" nameKey="nome" cx="50%" cy="50%" innerRadius={55} outerRadius={95} paddingAngle={3}>
                    {canais.map((_, i) => (
                      <Cell key={i} fill={PALETA[i % PALETA.length]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={ESTILO_TOOLTIP} />
                  <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>

        <Card titulo="Distribuição" descricao="Status e prioridade das conversas criadas no período.">
          <div className="p-4 space-y-4">
            <div className="space-y-2">
              {(Object.keys(CONVERSATION_STATUS_LABELS) as ConversationStatus[]).map((s, i) => (
                <BarraProporcao
                  key={s}
                  rotulo={CONVERSATION_STATUS_LABELS[s]}
                  valor={resumo.porStatus[s] ?? 0}
                  total={resumo.total}
                  cor={PALETA[i % PALETA.length]}
                />
              ))}
            </div>
            <div className="border-t pt-3 space-y-2">
              {prioridades.map((p, i) => (
                <BarraProporcao
                  key={p.nome}
                  rotulo={p.nome}
                  valor={p.valor}
                  total={resumo.total}
                  cor={PALETA[(i + 3) % PALETA.length]}
                />
              ))}
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
}

function BarraProporcao({
  rotulo,
  valor,
  total,
  cor,
}: {
  rotulo: string;
  valor: number;
  total: number;
  cor: string;
}) {
  const pct = percentual(valor, total);
  return (
    <div>
      <div className="flex justify-between text-xs mb-1">
        <span className="truncate">{rotulo}</span>
        <span className="text-muted-foreground shrink-0 ml-2">
          {valor} <span className="opacity-60">({numeroBr(pct, 0)}%)</span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: cor }} />
      </div>
    </div>
  );
}

// =====================================================================
// Tabela ordenável — o `Table` do kit só aceita cabeçalhos de texto,
// então aqui usamos markup próprio (com o mesmo visual).
// =====================================================================

function ThOrdenavel<C extends string>({
  campo,
  atual,
  onOrdenar,
  children,
  alinhar = "left",
}: {
  campo: C;
  atual: { campo: C; desc: boolean };
  onOrdenar: (campo: C) => void;
  children: React.ReactNode;
  alinhar?: "left" | "right";
}) {
  const ativo = atual.campo === campo;
  return (
    <th className={`px-3 py-2 font-medium whitespace-nowrap ${alinhar === "right" ? "text-right" : "text-left"}`}>
      <button
        type="button"
        onClick={() => onOrdenar(campo)}
        className={`inline-flex items-center gap-1 hover:text-foreground ${ativo ? "text-foreground" : ""}`}
        title="Ordenar por esta coluna"
      >
        {children}
        <span className={`text-[9px] ${ativo ? "opacity-100" : "opacity-30"}`}>{ativo && !atual.desc ? "▲" : "▼"}</span>
      </button>
    </th>
  );
}

// =====================================================================
// Aba: agentes
// =====================================================================

function AbaAgentes({
  linhas,
  ordem,
  onOrdenar,
}: {
  linhas: LinhaAgente[];
  ordem: { campo: CampoAgente; desc: boolean };
  onOrdenar: (campo: CampoAgente) => void;
}) {
  if (linhas.length === 0) {
    return (
      <Card>
        <EmptyState
          titulo="Nenhuma conversa atribuída no período"
          descricao="Atribua conversas a agentes para acompanhar produtividade individual."
          icone={<Users size={34} />}
        />
      </Card>
    );
  }
  return (
    <Card titulo="Desempenho por agente" descricao="Clique no cabeçalho para reordenar.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <ThOrdenavel campo="nome" atual={ordem} onOrdenar={onOrdenar}>Agente</ThOrdenavel>
              <ThOrdenavel campo="atribuidas" atual={ordem} onOrdenar={onOrdenar} alinhar="right">Atribuídas</ThOrdenavel>
              <ThOrdenavel campo="resolvidas" atual={ordem} onOrdenar={onOrdenar} alinhar="right">Resolvidas</ThOrdenavel>
              <ThOrdenavel campo="mensagens" atual={ordem} onOrdenar={onOrdenar} alinhar="right">Mensagens</ThOrdenavel>
              <ThOrdenavel campo="tmpr" atual={ordem} onOrdenar={onOrdenar} alinhar="right">1ª resposta</ThOrdenavel>
              <ThOrdenavel campo="tmr" atual={ordem} onOrdenar={onOrdenar} alinhar="right">Resolução</ThOrdenavel>
              <ThOrdenavel campo="csat" atual={ordem} onOrdenar={onOrdenar} alinhar="right">CSAT</ThOrdenavel>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{a.nome}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.atribuidas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.resolvidas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{a.mensagens}</td>
                <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{duracaoOuTraco(a.tmpr)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{duracaoOuTraco(a.tmr)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {a.csat === null ? <span className="text-muted-foreground">—</span> : `${numeroBr(a.csat, 2)} / 5`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// =====================================================================
// Aba: equipes
// =====================================================================

function AbaEquipes({
  linhas,
  ordem,
  onOrdenar,
}: {
  linhas: LinhaEquipe[];
  ordem: { campo: CampoEquipe; desc: boolean };
  onOrdenar: (campo: CampoEquipe) => void;
}) {
  if (linhas.length === 0) {
    return (
      <Card>
        <EmptyState
          titulo="Nenhuma equipe com conversas"
          descricao="Crie equipes em Configurações › Equipes e atribua conversas a elas."
          icone={<UsersRound size={34} />}
        />
      </Card>
    );
  }
  return (
    <Card titulo="Desempenho por equipe" descricao="Clique no cabeçalho para reordenar.">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <ThOrdenavel campo="nome" atual={ordem} onOrdenar={onOrdenar}>Equipe</ThOrdenavel>
              <ThOrdenavel campo="atribuidas" atual={ordem} onOrdenar={onOrdenar} alinhar="right">Atribuídas</ThOrdenavel>
              <ThOrdenavel campo="resolvidas" atual={ordem} onOrdenar={onOrdenar} alinhar="right">Resolvidas</ThOrdenavel>
              <ThOrdenavel campo="tmpr" atual={ordem} onOrdenar={onOrdenar} alinhar="right">1ª resposta</ThOrdenavel>
              <ThOrdenavel campo="tmr" atual={ordem} onOrdenar={onOrdenar} alinhar="right">Resolução</ThOrdenavel>
              <ThOrdenavel campo="csat" atual={ordem} onOrdenar={onOrdenar} alinhar="right">CSAT</ThOrdenavel>
            </tr>
          </thead>
          <tbody className="divide-y">
            {linhas.map((e) => (
              <tr key={e.id} className="hover:bg-muted/30 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{e.nome}</div>
                  <div className="text-[11px] text-muted-foreground max-w-xs truncate" title={e.membros.join(", ")}>
                    {e.membros.length > 0 ? e.membros.join(", ") : "sem membros"}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{e.atribuidas}</td>
                <td className="px-3 py-2 text-right tabular-nums">{e.resolvidas}</td>
                <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{duracaoOuTraco(e.tmpr)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground whitespace-nowrap">{duracaoOuTraco(e.tmr)}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {e.csat === null ? <span className="text-muted-foreground">—</span> : `${numeroBr(e.csat, 2)} / 5`}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

// =====================================================================
// Aba: etiquetas
// =====================================================================

function AbaEtiquetas({
  linhas,
  totalConversas,
  comEtiqueta,
}: {
  linhas: { nome: string; conversas: number; cor: string; percentual: number }[];
  totalConversas: number;
  comEtiqueta: number;
}) {
  if (linhas.length === 0) {
    return (
      <Card>
        <EmptyState
          titulo="Nenhuma conversa etiquetada no período"
          descricao="Etiquetas ajudam a medir motivos de contato. Aplique-as nas conversas para ver o ranking aqui."
          icone={<Tag size={34} />}
        />
      </Card>
    );
  }
  const altura = Math.max(200, linhas.length * 32 + 20);
  return (
    <div className="space-y-4">
      <Alerta tipo="info">
        {comEtiqueta} de {totalConversas} conversas ({numeroBr(percentual(comEtiqueta, totalConversas), 0)}%) receberam
        pelo menos uma etiqueta. Uma conversa pode ter várias — por isso a soma abaixo passa de 100%.
      </Alerta>

      <Card titulo="Conversas por etiqueta">
        <div className="p-3">
          <ResponsiveContainer width="100%" height={altura}>
            <BarChart data={linhas} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} horizontal={false} />
              <XAxis type="number" stroke={COR_EIXO} fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="nome" stroke={COR_EIXO} fontSize={11} width={130} />
              <Tooltip contentStyle={ESTILO_TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Bar dataKey="conversas" name="Conversas" radius={[0, 4, 4, 0]}>
                {linhas.map((l, i) => (
                  <Cell key={i} fill={l.cor || PALETA[i % PALETA.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card titulo="Detalhamento">
        <Table colunas={["Etiqueta", "Conversas", "% do total"]}>
          {linhas.map((l) => (
            <tr key={l.nome} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: l.cor }} />
                  {l.nome}
                </span>
              </td>
              <td className="px-3 py-2 tabular-nums">{l.conversas}</td>
              <td className="px-3 py-2 tabular-nums text-muted-foreground">{numeroBr(l.percentual)}%</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// =====================================================================
// Aba: caixas de entrada
// =====================================================================

function AbaCaixas({
  linhas,
}: {
  linhas: { id: string; nome: string; canal: string; total: number; aberta: number; pendente: number; resolvida: number; adiada: number }[];
}) {
  if (linhas.length === 0) {
    return (
      <Card>
        <EmptyState
          titulo="Nenhuma caixa com conversas"
          descricao="Configure caixas de entrada em Configurações › Caixas de entrada."
          icone={<InboxIcon size={34} />}
        />
      </Card>
    );
  }
  return (
    <div className="space-y-4">
      <Card titulo="Conversas por caixa de entrada" descricao="Empilhado por status.">
        <div className="p-3">
          <ResponsiveContainer width="100%" height={Math.max(220, linhas.length * 46 + 40)}>
            <BarChart data={linhas} layout="vertical" margin={{ top: 5, right: 20, left: 10, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} horizontal={false} />
              <XAxis type="number" stroke={COR_EIXO} fontSize={11} allowDecimals={false} />
              <YAxis type="category" dataKey="nome" stroke={COR_EIXO} fontSize={11} width={150} />
              <Tooltip contentStyle={ESTILO_TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
              <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="aberta" stackId="s" name="Abertas" fill={PALETA[1]} />
              <Bar dataKey="pendente" stackId="s" name="Pendentes" fill={PALETA[3]} />
              <Bar dataKey="resolvida" stackId="s" name="Resolvidas" fill={PALETA[0]} />
              <Bar dataKey="adiada" stackId="s" name="Adiadas" fill={PALETA[2]} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card titulo="Detalhamento">
        <Table colunas={["Caixa", "Canal", "Total", "Abertas", "Pendentes", "Resolvidas", "Adiadas"]}>
          {linhas.map((c) => (
            <tr key={c.id} className="hover:bg-muted/30">
              <td className="px-3 py-2 font-medium">{c.nome}</td>
              <td className="px-3 py-2 text-muted-foreground">{c.canal}</td>
              <td className="px-3 py-2 tabular-nums">{c.total}</td>
              <td className="px-3 py-2 tabular-nums">{c.aberta}</td>
              <td className="px-3 py-2 tabular-nums">{c.pendente}</td>
              <td className="px-3 py-2 tabular-nums">{c.resolvida}</td>
              <td className="px-3 py-2 tabular-nums">{c.adiada}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// =====================================================================
// Aba: conversas no tempo
// =====================================================================

function AbaTempo({
  dados,
}: {
  dados: {
    porDiaSemana: { dia: string; nome: string; conversas: number }[];
    porHora: { hora: string; conversas: number }[];
    grade: number[][];
    pico: number;
  };
}) {
  return (
    <div className="space-y-4">
      <div className="grid lg:grid-cols-2 gap-4">
        <Card titulo="Conversas por dia da semana">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dados.porDiaSemana} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                <XAxis dataKey="dia" stroke={COR_EIXO} fontSize={11} />
                <YAxis stroke={COR_EIXO} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={ESTILO_TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="conversas" name="Conversas" fill={PALETA[0]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card titulo="Conversas por hora do dia">
          <div className="p-3">
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={dados.porHora} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                <XAxis dataKey="hora" stroke={COR_EIXO} fontSize={10} interval={1} />
                <YAxis stroke={COR_EIXO} fontSize={11} allowDecimals={false} />
                <Tooltip contentStyle={ESTILO_TOOLTIP} labelStyle={{ color: "hsl(var(--foreground))" }} cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }} />
                <Bar dataKey="conversas" name="Conversas" fill={PALETA[1]} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      <Card
        titulo="Mapa de calor — dia da semana x hora"
        descricao="Quanto mais forte, maior o volume de conversas abertas naquele horário. Use para desenhar a escala de plantão."
      >
        <div className="p-4 overflow-x-auto">
          <div className="min-w-[720px]">
            {/* Régua das horas */}
            <div className="flex items-center gap-1 mb-1 pl-10">
              {Array.from({ length: 24 }, (_, h) => (
                <div key={h} className="flex-1 text-center text-[9px] text-muted-foreground">
                  {h % 2 === 0 ? h : ""}
                </div>
              ))}
            </div>
            {dados.grade.map((linha, dia) => (
              <div key={dia} className="flex items-center gap-1 mb-1">
                <div className="w-10 shrink-0 text-[10px] text-muted-foreground text-right pr-1">
                  {WEEKDAY_LABELS[dia].slice(0, 3)}
                </div>
                {linha.map((valor, hora) => {
                  const razao = dados.pico > 0 ? valor / dados.pico : 0;
                  return (
                    <div
                      key={hora}
                      title={`${WEEKDAY_LABELS[dia]}, ${`${hora}`.padStart(2, "0")}h — ${valor} conversa(s)`}
                      className={`flex-1 h-6 rounded-sm ${valor === 0 ? "bg-muted" : ""}`}
                      style={
                        valor === 0
                          ? undefined
                          : { backgroundColor: `rgba(16, 185, 129, ${(0.15 + 0.8 * razao).toFixed(3)})` }
                      }
                    />
                  );
                })}
              </div>
            ))}
            <div className="flex items-center gap-2 mt-3 text-[10px] text-muted-foreground">
              <span>Menos</span>
              {[0, 0.25, 0.5, 0.75, 1].map((r) => (
                <span
                  key={r}
                  className={`h-3 w-6 rounded-sm ${r === 0 ? "bg-muted" : ""}`}
                  style={r === 0 ? undefined : { backgroundColor: `rgba(16, 185, 129, ${(0.15 + 0.8 * r).toFixed(3)})` }}
                />
              ))}
              <span>Mais (pico: {dados.pico})</span>
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
