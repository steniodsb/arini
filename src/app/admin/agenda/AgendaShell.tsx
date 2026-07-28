"use client";

/**
 * =====================================================================
 * AgendaShell — a casca de todas as visualizações da agenda.
 * =====================================================================
 *
 * Responsabilidades que ficam AQUI (e não nas vistas):
 *
 * 1. **O DndContext.** Ele envolve a vista E o painel lateral de não
 *    agendados. Precisa ser assim porque o arraste principal da tela
 *    atravessa os dois (painel → calendário agenda; calendário → painel
 *    desagenda), e o dnd-kit só reconhece origem e destino que estejam
 *    sob o mesmo contexto. As vistas se penduram neste contexto com
 *    `useDndMonitor` em vez de criarem o próprio.
 * 2. **A escrita no banco.** Uma única função (`aplicarMudancas`) faz
 *    update otimista, mapeia campo do `AgendaItem` para coluna da tabela
 *    certa e faz rollback com aviso visível. Assim nenhuma vista precisa
 *    saber que existem duas tabelas.
 * 3. **Período, filtros e contadores**, que valem para todas as vistas.
 */

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import {
  AGENDA_AGRUPAMENTO_LABELS,
  AGENDA_STATUS_CLASSES,
  AGENDA_STATUS_LABELS,
  AGENDA_STATUS_ORDEM,
  AGENDA_TIPO_LABELS,
  AGENDA_VISTA_LABELS,
  SECTOR_LABELS,
  type AgendaAgrupamento,
  type AgendaItem,
  type AgendaStatus,
  type AgendaTipo,
  type AgendaVista,
  type Sector,
} from "@/lib/types";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { itensDeExemplo, ehExemplo } from "./exemplo";
import { errMessage } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  AlertCircle,
  CalendarDays,
  CalendarRange,
  CalendarX2,
  ChevronLeft,
  ChevronRight,
  Clock,
  GanttChartSquare,
  List,
  MapPin,
  Search,
  SlidersHorizontal,
  Trello,
  X,
  type LucideIcon,
  FlaskConical,
} from "lucide-react";
import {
  ID_BACKLOG,
  TIPOS_DE_AGENDAMENTO,
  chaveDia,
  corDoItem,
  dataDaChave,
  formatarDiaCurto,
  formatarDiaLongo,
  formatarIntervalo,
  formatarMesAno,
  iniciais,
  somarDias,
  temData,
  type Agente,
  type PrefillCartao,
  type VistaProps,
} from "./shared";
import { AgendaKanban } from "./AgendaKanban";
import { AgendaLista } from "./AgendaLista";
import { AgendaBacklog } from "./AgendaBacklog";
import { NewEventDialog } from "./NewEventDialog";
// Vistas do outro agente — mesmo contrato (`VistaProps`), mesmo módulo `shared`.
import { AgendaTimeline } from "./AgendaTimeline";
import { AgendaMes } from "./AgendaMes";
import { AgendaSemana } from "./AgendaSemana";

// =====================================================================
// Mapeamento AgendaItem → colunas da tabela
// =====================================================================

/** Uma alteração pendente: o item de origem + o que muda nele. */
export interface Mudanca {
  item: AgendaItem;
  patch: Partial<AgendaItem>;
}

/** Campos que existem nas DUAS tabelas com o mesmo nome. */
const CAMPOS_COMUNS: string[] = [
  "data_hora", "status", "tipo", "responsavel_id", "ordem",
  "local", "observacoes", "duracao_min", "dia_inteiro", "property_id",
];

/** Campos que só `agenda_events` tem. */
const CAMPOS_SO_EVENTO: string[] = ["setor_destino", "cor", "titulo"];

const NOME_AMIGAVEL: Record<string, string> = {
  setor_destino: "setor de destino",
  cor: "cor",
  titulo: "título",
};

type Mapeado =
  | { ok: true; dados: Record<string, unknown> }
  | { ok: false; erro: string };

/**
 * Traduz um patch de `AgendaItem` para o UPDATE da tabela de origem.
 *
 * Existe porque as duas tabelas não são simétricas: `lead_appointments`
 * não tem `setor_destino`, `cor` nem `titulo` (o título vem do lead), e o
 * CHECK de `tipo` dela é mais restrito. Sem esta tradução, arrastar um
 * agendamento de lead para a coluna "Gravação" mandaria um UPDATE que o
 * banco recusa — e o usuário veria um erro críptico do Postgres.
 */
function paraColunas(item: AgendaItem, patch: Partial<AgendaItem>): Mapeado {
  const dados: Record<string, unknown> = {};

  for (const [chave, valor] of Object.entries(patch)) {
    if (CAMPOS_COMUNS.includes(chave)) {
      dados[chave] = valor;
      continue;
    }
    if (CAMPOS_SO_EVENTO.includes(chave)) {
      if (item.origem === "agendamento") {
        return {
          ok: false,
          erro: `Agendamento de lead não tem ${NOME_AMIGAVEL[chave] ?? chave}. Use um compromisso comum.`,
        };
      }
      dados[chave] = valor;
      continue;
    }
    // Campos derivados (id, rawId, origem, lead_nome, property_codigo…)
    // não existem no banco — ignorar em silêncio é o certo.
  }

  if (
    item.origem === "agendamento" &&
    patch.tipo &&
    !TIPOS_DE_AGENDAMENTO.includes(patch.tipo)
  ) {
    return {
      ok: false,
      erro: `Agendamento de lead não aceita o tipo "${AGENDA_TIPO_LABELS[patch.tipo]}".`,
    };
  }

  if (Object.keys(dados).length === 0) return { ok: false, erro: "Nada para salvar." };
  return { ok: true, dados };
}

// =====================================================================
// Barra de vistas
// =====================================================================

const VISTA_ICONE: Record<AgendaVista, LucideIcon> = {
  kanban: Trello,
  timeline: GanttChartSquare,
  mes: CalendarDays,
  semana: CalendarRange,
  lista: List,
};

const VISTAS: AgendaVista[] = ["kanban", "timeline", "mes", "semana", "lista"];

const SETORES: Sector[] = [
  "captacao", "marketing", "administrativo", "juridico",
  "financeiro", "recepcao", "aluguel", "admin_central",
];

const TIPOS = Object.keys(AGENDA_TIPO_LABELS) as AgendaTipo[];

interface Filtros {
  tipo: string;
  status: string;
  setor: string;
  responsavel: string;
  busca: string;
}

const FILTROS_VAZIOS: Filtros = { tipo: "", status: "", setor: "", responsavel: "", busca: "" };

// =====================================================================

export function AgendaShell({
  vista,
  agrupamento,
  dataBase,
  inicio,
  fim,
  itens,
  semData,
  agentes,
  userId,
  sector,
}: {
  vista: AgendaVista;
  agrupamento: AgendaAgrupamento;
  /** AAAA-MM-DD — âncora do período, vinda da URL. */
  dataBase: string;
  inicio: string;
  fim: string;
  /** Itens COM data, dentro do período. */
  itens: AgendaItem[];
  /** Itens SEM data (backlog) — não dependem do período. */
  semData: AgendaItem[];
  agentes: Agente[];
  userId: string;
  sector: Sector;
}) {
  const router = useRouter();
  const [navegando, iniciarTransicao] = useTransition();

  // Um único array com tudo. Manter backlog e calendário em estados
  // separados obrigaria a mover o item de uma lista para a outra a cada
  // arraste; com um array só, agendar é apenas escrever `data_hora`.
  const [todos, setTodos] = useState<AgendaItem[]>(() => [...itens, ...semData]);
  useEffect(() => {
    setTodos([...itens, ...semData]);
  }, [itens, semData]);

  // Modo exemplo: injeta compromissos fictícios SÓ no navegador, para dar
  // para julgar as vistas enquanto a agenda real está vazia. Nada é gravado
  // — por isso a escrita fica bloqueada enquanto ele está ligado.
  const [modoExemplo, setModoExemplo] = useState(false);
  const exemplos = useMemo(
    () => (modoExemplo ? itensDeExemplo(dataDaChave(dataBase), agentes) : []),
    [modoExemplo, dataBase, agentes],
  );

  const [aviso, setAviso] = useState<string | null>(null);
  const [filtros, setFiltros] = useState<Filtros>(FILTROS_VAZIOS);
  const [painel, setPainel] = useState<"filtros" | "exibicao" | null>(null);
  const [backlogAberto, setBacklogAberto] = useState(true);
  const [arrastando, setArrastando] = useState<string | null>(null);
  const [detalhe, setDetalhe] = useState<AgendaItem | null>(null);
  const [novo, setNovo] = useState<PrefillCartao | null>(null);

  // Ponteiro para mouse (arrasta após 6px) e toque com long-press (200ms):
  // sem isso o arraste engole o scroll horizontal do quadro e o clique no
  // cartão. Esta calibragem veio do kanban de leads e funciona bem.
  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 8 } }),
  );

  const nomePorId = useMemo(
    () => new Map(agentes.map((a) => [a.id, a.nome])),
    [agentes],
  );

  // ---------------------------------------------------------------
  // Escrita
  // ---------------------------------------------------------------

  const aplicarMudancas = useCallback(
    async (mudancas: Mudanca[]) => {
      if (mudancas.length === 0) return;
      // Item de exemplo não existe no banco: gravar devolveria erro do
      // Postgres com um id inválido. Melhor dizer o que está acontecendo.
      if (mudancas.some((m) => ehExemplo(m.item))) {
        setAviso(
          "Estes são dados de exemplo — eles não são salvos. Desligue o modo exemplo para mexer na agenda de verdade.",
        );
        return;
      }
      const anterior = todos;
      const porId = new Map(mudancas.map((m) => [m.item.id, m.patch]));

      // Otimista: a tela responde na hora, o banco confirma depois.
      setTodos((curr) =>
        curr.map((i) => {
          const patch = porId.get(i.id);
          return patch ? { ...i, ...patch } : i;
        }),
      );

      const supabase = createSupabaseBrowser();
      const erros = await Promise.all(
        mudancas.map(async (m) => {
          const mapeado = paraColunas(m.item, m.patch);
          if (!mapeado.ok) return mapeado.erro;
          const tabela = m.item.origem === "evento" ? "agenda_events" : "lead_appointments";
          const { error } = await supabase
            .from(tabela)
            .update(mapeado.dados)
            .eq("id", m.item.rawId);
          return error ? errMessage(error) : null;
        }),
      );

      const falha = erros.find((e): e is string => e !== null);
      if (falha) {
        // Rollback completo: meia alteração salva é pior que nenhuma.
        setTodos(anterior);
        setAviso(falha);
      } else {
        setAviso(null);
      }
    },
    [todos],
  );

  const buscarItem = useCallback((id: string) => todos.find((i) => i.id === id), [todos]);

  const onMover = useCallback(
    (id: string, novaData: string) => {
      const item = buscarItem(id);
      if (!item || item.data_hora === novaData) return;
      void aplicarMudancas([{ item, patch: { data_hora: novaData } }]);
    },
    [aplicarMudancas, buscarItem],
  );

  const onAgendar = useCallback(
    (id: string, dataISO: string | null) => {
      const item = buscarItem(id);
      if (!item || item.data_hora === dataISO) return;
      // Ao desagendar, o trigger de 0039 devolve o status para 'agendado'.
      // Espelhamos isso no update otimista para a tela não mostrar por um
      // instante um "Concluído" sem data, que o banco já desfez.
      const precisaVoltar =
        dataISO === null &&
        (["confirmado", "concluido", "nao_compareceu"] as AgendaStatus[]).includes(item.status);
      void aplicarMudancas([
        {
          item,
          patch: precisaVoltar
            ? { data_hora: dataISO, status: "agendado" }
            : { data_hora: dataISO },
        },
      ]);
    },
    [aplicarMudancas, buscarItem],
  );

  // ---------------------------------------------------------------
  // Navegação (URL)
  // ---------------------------------------------------------------

  const navegar = useCallback(
    (mudanca: { vista?: AgendaVista; data?: string; agrupar?: AgendaAgrupamento }) => {
      const params = new URLSearchParams({
        vista: mudanca.vista ?? vista,
        data: mudanca.data ?? dataBase,
        agrupar: mudanca.agrupar ?? agrupamento,
      });
      // `replace` (e não `push`) para o botão Voltar do navegador não virar
      // um histórico de cliques em setinha de semana.
      iniciarTransicao(() => router.replace(`/admin/agenda?${params}`, { scroll: false }));
    },
    [router, vista, dataBase, agrupamento],
  );

  const trocarVista = useCallback(
    (nova: AgendaVista) => {
      if (nova === vista) return;
      navegar({ vista: nova });
      // Grava a preferência para a próxima visita abrir na mesma vista.
      // Falha aqui é irrelevante para o usuário — a tela já trocou —,
      // então não vira aviso na tela.
      void createSupabaseBrowser()
        .from("profiles")
        .update({ agenda_vista: nova })
        .eq("id", userId);
    },
    [navegar, vista, userId],
  );

  function passo(direcao: 1 | -1) {
    const base = dataDaChave(dataBase);
    let nova: Date;
    switch (vista) {
      case "kanban":
      case "semana":
        nova = somarDias(base, 7 * direcao);
        break;
      case "timeline":
        nova = somarDias(base, 14 * direcao);
        break;
      case "lista":
        nova = somarDias(base, 30 * direcao);
        break;
      case "mes":
        nova = new Date(base.getFullYear(), base.getMonth() + direcao, 1, 12, 0, 0, 0);
        break;
    }
    navegar({ data: chaveDia(nova) });
  }

  const rotuloPeriodo = useMemo(() => {
    const de = new Date(inicio);
    // `fim` é exclusivo; o último dia visível é 1ms antes.
    const ate = new Date(new Date(fim).getTime() - 1);
    switch (vista) {
      case "kanban":
      case "semana":
        return `Semana de ${formatarDiaCurto(de)} a ${formatarDiaCurto(ate)}`;
      case "mes":
        return formatarMesAno(dataDaChave(dataBase));
      case "timeline":
        return `Quinzena de ${formatarDiaCurto(de)} a ${formatarDiaCurto(ate)}`;
      case "lista":
        return `De ${formatarDiaCurto(de)} a ${formatarDiaCurto(ate)}`;
    }
  }, [vista, inicio, fim, dataBase]);

  // ---------------------------------------------------------------
  // Filtros (em memória — valem para todas as vistas)
  // ---------------------------------------------------------------

  const filtrados = useMemo(() => {
    const busca = filtros.busca.trim().toLowerCase();
    // Os exemplos passam pelos mesmos filtros dos itens reais — senão o modo
    // exemplo mentiria sobre como os filtros se comportam.
    return [...todos, ...exemplos].filter((i) => {
      if (filtros.tipo && i.tipo !== filtros.tipo) return false;
      if (filtros.status && i.status !== filtros.status) return false;
      if (filtros.setor) {
        // Setor casa tanto com quem recebeu a delegação quanto com quem criou.
        if (i.setor_destino !== filtros.setor && i.criado_por_sector !== filtros.setor) return false;
      }
      if (filtros.responsavel) {
        if (filtros.responsavel === "__sem__") {
          if (i.responsavel_id !== null) return false;
        } else if (i.responsavel_id !== filtros.responsavel) return false;
      }
      if (busca) {
        const alvo = [
          i.titulo,
          i.local,
          i.observacoes,
          i.lead_nome,
          i.property_codigo,
          AGENDA_TIPO_LABELS[i.tipo],
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!alvo.includes(busca)) return false;
      }
      return true;
    });
  }, [todos, exemplos, filtros]);

  const comData = useMemo(() => filtrados.filter(temData), [filtrados]);
  const semDataFiltrados = useMemo(() => filtrados.filter((i) => !temData(i)), [filtrados]);

  const contagemPorStatus = useMemo(() => {
    const mapa = new Map<AgendaStatus, number>();
    for (const i of comData) mapa.set(i.status, (mapa.get(i.status) ?? 0) + 1);
    return mapa;
  }, [comData]);

  const filtrosAtivos = Object.values(filtros).filter(Boolean).length;

  // ---------------------------------------------------------------
  // Drag & drop — o contexto vive aqui (ver cabeçalho do arquivo)
  // ---------------------------------------------------------------

  function onDragStart(e: DragStartEvent) {
    setArrastando(String(e.active.id));
  }

  function onDragEnd(e: DragEndEvent) {
    setArrastando(null);
    const { active, over } = e;
    if (!over) return;
    const alvo = String(over.id);

    // Destino da casca: o painel lateral. Soltar aqui remove a data.
    if (alvo === ID_BACKLOG) {
      onAgendar(String(active.id), null);
      return;
    }

    // Rede de segurança para o caminho painel → calendário do mês.
    // As vistas de calendário procuram o item arrastado na própria lista,
    // que só tem itens COM data — então elas ignoram um cartão vindo do
    // painel. Aqui completamos o gesto. A condição `!item.data_hora`
    // garante que nunca gravamos em duplicidade com o handler da vista:
    // ele cuida do que já tem data, a casca cuida do que não tem.
    if (alvo.startsWith("dia:")) {
      const item = todos.find((i) => i.id === String(active.id));
      if (!item || item.data_hora) return;
      const dia = dataDaChave(alvo.slice(4));
      onAgendar(
        item.id,
        new Date(dia.getFullYear(), dia.getMonth(), dia.getDate(), 9, 0, 0, 0).toISOString(),
      );
    }
  }

  const itemArrastado = arrastando ? todos.find((i) => i.id === arrastando) ?? null : null;

  // ---------------------------------------------------------------

  const vistaProps: VistaProps = {
    itens: comData,
    inicio,
    fim,
    agentes,
    onMover,
    onAgendar,
    onAbrir: setDetalhe,
  };

  const nadaNoPeriodo = comData.length === 0;

  return (
    <div className="space-y-4">
      {/* ---------- Cabeçalho ---------- */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-arini">Agenda</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Visitas, reuniões, ligações, retornos e assinaturas — em cinco visualizações.
          </p>
        </div>
        <NewEventDialog
          userId={userId}
          sector={sector}
          agentes={agentes}
          onCriado={() => router.refresh()}
        />
      </div>

      {/* ---------- Barra de ferramentas (tudo numa linha) ---------- */}
      <div className="rounded-lg border bg-card px-3 py-2 flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* ← Hoje → */}
        <div className="flex items-center gap-1">
          <button
            onClick={() => passo(-1)}
            title="Período anterior"
            className="h-8 w-8 grid place-items-center rounded-md border hover:bg-muted text-arini"
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => navegar({ data: chaveDia(new Date()) })}
            className="h-8 px-3 rounded-md border hover:bg-muted text-sm font-medium text-arini"
          >
            Hoje
          </button>
          <button
            onClick={() => passo(1)}
            title="Próximo período"
            className="h-8 w-8 grid place-items-center rounded-md border hover:bg-muted text-arini"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        <span
          className={`text-sm font-medium text-arini transition-opacity ${navegando ? "opacity-40" : ""}`}
        >
          {rotuloPeriodo}
        </span>

        <span className="hidden md:block h-6 w-px bg-border" />

        {/* Seletor de vista */}
        <div className="flex items-center gap-0.5 rounded-lg border bg-muted/40 p-0.5">
          {VISTAS.map((v) => {
            const Icone = VISTA_ICONE[v];
            const ativa = v === vista;
            return (
              <button
                key={v}
                onClick={() => trocarVista(v)}
                title={AGENDA_VISTA_LABELS[v]}
                className={`inline-flex items-center gap-1.5 rounded-md px-2.5 h-7 text-xs font-medium transition-colors ${
                  ativa
                    ? "bg-card text-arini shadow-sm"
                    : "text-muted-foreground hover:text-arini"
                }`}
              >
                <Icone size={14} />
                <span className="hidden lg:inline">{AGENDA_VISTA_LABELS[v]}</span>
              </button>
            );
          })}
        </div>

        <div className="ml-auto flex items-center gap-2">
          <div className="relative">
            <button
              onClick={() => setPainel((p) => (p === "filtros" ? null : "filtros"))}
              className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-md border text-sm ${
                painel === "filtros" || filtrosAtivos > 0
                  ? "border-gold bg-gold/10 text-arini"
                  : "hover:bg-muted text-arini"
              }`}
            >
              <Search size={14} /> Filtro
              {filtrosAtivos > 0 && (
                <span className="ml-0.5 rounded-full bg-arini text-white text-[10px] px-1.5 leading-4">
                  {filtrosAtivos}
                </span>
              )}
            </button>
          </div>
          <button
            onClick={() => setPainel((p) => (p === "exibicao" ? null : "exibicao"))}
            className={`h-8 px-3 inline-flex items-center gap-1.5 rounded-md border text-sm ${
              painel === "exibicao" ? "border-gold bg-gold/10 text-arini" : "hover:bg-muted text-arini"
            }`}
          >
            <SlidersHorizontal size={14} /> Exibição
          </button>
        </div>
      </div>

      {/* ---------- Painel de filtros ---------- */}
      {painel === "filtros" && (
        <div className="rounded-lg border bg-card p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <Input
              value={filtros.busca}
              onChange={(e) => setFiltros((f) => ({ ...f, busca: e.target.value }))}
              placeholder="Buscar por título, local, lead ou imóvel…"
              className="h-9"
            />
          </div>
          <Select
            value={filtros.tipo}
            onChange={(e) => setFiltros((f) => ({ ...f, tipo: e.target.value }))}
            className="h-9"
          >
            <option value="">Todos os tipos</option>
            {TIPOS.map((t) => (
              <option key={t} value={t}>
                {AGENDA_TIPO_LABELS[t]}
              </option>
            ))}
          </Select>
          <Select
            value={filtros.status}
            onChange={(e) => setFiltros((f) => ({ ...f, status: e.target.value }))}
            className="h-9"
          >
            <option value="">Todos os status</option>
            {AGENDA_STATUS_ORDEM.map((s) => (
              <option key={s} value={s}>
                {AGENDA_STATUS_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select
            value={filtros.setor}
            onChange={(e) => setFiltros((f) => ({ ...f, setor: e.target.value }))}
            className="h-9"
          >
            <option value="">Todos os setores</option>
            {SETORES.map((s) => (
              <option key={s} value={s}>
                {SECTOR_LABELS[s]}
              </option>
            ))}
          </Select>
          <Select
            value={filtros.responsavel}
            onChange={(e) => setFiltros((f) => ({ ...f, responsavel: e.target.value }))}
            className="h-9"
          >
            <option value="">Todos os responsáveis</option>
            <option value="__sem__">Sem responsável</option>
            {agentes.map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
          </Select>
          {filtrosAtivos > 0 && (
            <button
              onClick={() => setFiltros(FILTROS_VAZIOS)}
              className="text-xs text-muted-foreground hover:text-arini underline justify-self-start"
            >
              Limpar filtros
            </button>
          )}
        </div>
      )}

      {/* ---------- Painel de exibição ---------- */}
      {painel === "exibicao" && (
        <div className="rounded-lg border bg-card p-3 flex flex-wrap items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-arini">
            <span className="text-muted-foreground">Agrupar o quadro:</span>
            <Select
              value={agrupamento}
              onChange={(e) => navegar({ agrupar: e.target.value as AgendaAgrupamento })}
              className="h-9 w-48"
            >
              {(Object.keys(AGENDA_AGRUPAMENTO_LABELS) as AgendaAgrupamento[]).map((a) => (
                <option key={a} value={a}>
                  {AGENDA_AGRUPAMENTO_LABELS[a]}
                </option>
              ))}
            </Select>
          </label>
          <label className="flex items-center gap-2 text-sm text-arini cursor-pointer">
            <input
              type="checkbox"
              checked={backlogAberto}
              onChange={(e) => setBacklogAberto(e.target.checked)}
              className="rounded border-input"
            />
            Mostrar painel de não agendados
          </label>

          {/* A agenda nasce vazia. Sem um jeito de ver as vistas com conteúdo,
              não dá para julgar se elas funcionam — e semear o banco com
              compromisso falso num CRM em uso é pedir para alguém ir a uma
              visita que não existe. Este modo vive só no navegador. */}
          <label className="flex items-center gap-2 text-sm text-arini cursor-pointer">
            <input
              type="checkbox"
              checked={modoExemplo}
              onChange={(e) => setModoExemplo(e.target.checked)}
              className="rounded border-input"
            />
            Ver com dados de exemplo
          </label>
          <p className="pl-6 text-xs text-muted-foreground">
            Preenche o calendário com compromissos fictícios só para você
            conhecer as visualizações. Nada é salvo e ninguém mais vê.
          </p>
        </div>
      )}

      {/* ---------- Faixa do modo exemplo ---------- */}
      {modoExemplo && (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5">
          <FlaskConical size={16} className="shrink-0 text-amber-600" />
          <p className="flex-1 text-sm text-amber-900">
            <strong>Dados de exemplo.</strong> Estes compromissos existem só
            nesta tela, para você ver as visualizações funcionando — nada foi
            gravado e a equipe não os enxerga.
          </p>
          <button
            type="button"
            onClick={() => setModoExemplo(false)}
            className="rounded-md border border-amber-400 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-100"
          >
            Sair do modo exemplo
          </button>
        </div>
      )}

      {/* ---------- Contadores ---------- */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="rounded-full border bg-card px-2.5 py-1 text-arini font-medium">
          {comData.length} no período
        </span>
        {AGENDA_STATUS_ORDEM.filter((s) => (contagemPorStatus.get(s) ?? 0) > 0).map((s) => (
          <span key={s} className={`rounded-full border px-2.5 py-1 ${AGENDA_STATUS_CLASSES[s]}`}>
            {AGENDA_STATUS_LABELS[s]}: {contagemPorStatus.get(s)}
          </span>
        ))}
        {semDataFiltrados.length > 0 && (
          <span className="rounded-full border bg-card px-2.5 py-1 text-muted-foreground">
            {semDataFiltrados.length} sem data
          </span>
        )}
      </div>

      {/* ---------- Aviso de erro (no lugar do alert() antigo) ---------- */}
      {aviso && (
        <div className="flex items-start gap-2 rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span className="flex-1">{aviso}</span>
          <button onClick={() => setAviso(null)} className="text-red-600 hover:text-red-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ---------- Vista + painel lateral, sob o mesmo DndContext ---------- */}
      <DndContext
        sensors={sensores}
        collisionDetection={closestCorners}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setArrastando(null)}
      >
        <div className="flex gap-4 items-start">
          <div className="min-w-0 flex-1 space-y-3">
            {nadaNoPeriodo && (
              <div className="rounded-lg border border-dashed bg-card px-4 py-6 text-center">
                <CalendarX2 className="mx-auto text-muted-foreground/50" size={28} />
                <p className="mt-2 text-sm font-medium text-arini">
                  {vista === "mes"
                    ? "Nenhum compromisso neste mês"
                    : vista === "kanban" || vista === "semana"
                      ? "Nenhum compromisso nesta semana"
                      : "Nenhum compromisso neste período"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  Crie o primeiro compromisso ou arraste um item do painel de não agendados.
                </p>
                <div className="mt-3 flex justify-center">
                  <Button variant="gold" size="sm" onClick={() => setNovo({})}>
                    Novo compromisso
                  </Button>
                </div>
              </div>
            )}

            {vista === "kanban" && (
              <AgendaKanban
                {...vistaProps}
                agrupamento={agrupamento}
                onAgrupamento={(a) => navegar({ agrupar: a })}
                onAplicar={aplicarMudancas}
                onNovo={setNovo}
              />
            )}
            {vista === "lista" && <AgendaLista {...vistaProps} onAplicar={aplicarMudancas} />}
            {vista === "timeline" && <AgendaTimeline {...vistaProps} />}
            {vista === "mes" && <AgendaMes {...vistaProps} />}
            {vista === "semana" && <AgendaSemana {...vistaProps} />}
          </div>

          <AgendaBacklog
            itens={semDataFiltrados}
            agentes={agentes}
            aberto={backlogAberto}
            onAlternar={() => setBacklogAberto((v) => !v)}
            onAbrir={setDetalhe}
            onNovo={() => setNovo({ data: null })}
          />
        </div>

        {/* Fantasma do arraste — um só para toda a tela. */}
        <DragOverlay dropAnimation={null}>
          {itemArrastado ? (
            <div className="w-64 rotate-2 rounded-lg border bg-white shadow-xl overflow-hidden">
              <div className="h-1.5" style={{ backgroundColor: corDoItem(itemArrastado) }} />
              <div className="p-2.5">
                <div className="text-sm font-medium text-arini truncate">
                  {itemArrastado.titulo}
                </div>
                <div className="text-[11px] text-muted-foreground mt-0.5">
                  {itemArrastado.data_hora
                    ? formatarIntervalo(itemArrastado.data_hora, itemArrastado.duracao_min)
                    : "Sem data"}
                </div>
              </div>
            </div>
          ) : null}
        </DragOverlay>
      </DndContext>

      {/* ---------- Detalhe ---------- */}
      {detalhe && (
        <DetalheItem
          item={detalhe}
          responsavel={detalhe.responsavel_id ? nomePorId.get(detalhe.responsavel_id) ?? null : null}
          onFechar={() => setDetalhe(null)}
          onStatus={(status) => {
            void aplicarMudancas([{ item: detalhe, patch: { status } }]);
            setDetalhe(null);
          }}
          onDesagendar={() => {
            onAgendar(detalhe.id, null);
            setDetalhe(null);
          }}
        />
      )}

      {/* ---------- Criação (global e a partir das colunas) ---------- */}
      {novo && (
        <NewEventDialog
          userId={userId}
          sector={sector}
          agentes={agentes}
          semGatilho
          open
          onOpenChange={(v) => !v && setNovo(null)}
          dataInicial={novo.data ?? undefined}
          semDataInicial={novo.data === null}
          statusInicial={novo.status}
          responsavelInicial={novo.responsavelId ?? undefined}
          tipoInicial={novo.tipo}
          setorInicial={novo.setor ?? undefined}
          onCriado={() => {
            setNovo(null);
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

// =====================================================================
// Detalhe do item — modal simples com as ações de sempre
// =====================================================================

function DetalheItem({
  item,
  responsavel,
  onFechar,
  onStatus,
  onDesagendar,
}: {
  item: AgendaItem;
  responsavel: string | null;
  onFechar: () => void;
  onStatus: (status: AgendaStatus) => void;
  onDesagendar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4"
      onClick={onFechar}
    >
      <div
        className="bg-white rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="h-1.5" style={{ backgroundColor: corDoItem(item) }} />
        <div className="p-5 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-xl text-arini">{item.titulo}</h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                {AGENDA_TIPO_LABELS[item.tipo]}
                {item.dia_inteiro && " · Dia inteiro"}
              </p>
            </div>
            <button onClick={onFechar} className="text-muted-foreground hover:text-arini">
              <X size={18} />
            </button>
          </div>

          <div className="space-y-1.5 text-sm text-arini">
            <div className="flex items-center gap-2">
              <Clock size={14} className="text-muted-foreground" />
              {item.data_hora ? (
                <span>
                  {formatarDiaLongo(item.data_hora)} ·{" "}
                  {formatarIntervalo(item.data_hora, item.duracao_min)}
                </span>
              ) : (
                <span className="text-muted-foreground">Sem data definida</span>
              )}
            </div>
            {item.local && (
              <div className="flex items-center gap-2">
                <MapPin size={14} className="text-muted-foreground" />
                <span>{item.local}</span>
              </div>
            )}
            {responsavel && (
              <div className="flex items-center gap-2">
                <span className="h-5 w-5 grid place-items-center rounded-full bg-arini text-white text-[9px] font-semibold">
                  {iniciais(responsavel)}
                </span>
                <span>{responsavel}</span>
              </div>
            )}
            {item.setor_destino && (
              <div className="text-xs text-muted-foreground">
                Delegado para {SECTOR_LABELS[item.setor_destino]}
              </div>
            )}
            {item.observacoes && (
              <p className="text-xs text-muted-foreground whitespace-pre-wrap pt-1">
                {item.observacoes}
              </p>
            )}
          </div>

          <div className="flex flex-wrap gap-2 pt-1">
            {item.lead_id && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/leads/${item.lead_id}`}>Abrir lead</Link>
              </Button>
            )}
            {item.property_id && (
              <Button asChild variant="outline" size="sm">
                <Link href={`/admin/captacao/${item.property_id}`}>
                  Imóvel {item.property_codigo ?? ""}
                </Link>
              </Button>
            )}
          </div>

          <div className="border-t pt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="gold" onClick={() => onStatus("concluido")}>
              Marcar concluído
            </Button>
            <Button size="sm" variant="outline" onClick={() => onStatus("confirmado")}>
              Confirmar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => onStatus("cancelado")}>
              Cancelar
            </Button>
            {item.data_hora && (
              <Button size="sm" variant="ghost" onClick={onDesagendar}>
                Remover data
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
