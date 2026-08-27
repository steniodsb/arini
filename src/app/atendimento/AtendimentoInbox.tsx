"use client";

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { uploadAtendimentoMedia, tipoDaMensagemPeloMime, uploadErrorMsg } from "@/lib/upload";
import {
  CHANNEL_LABELS, PRIORITY_LABELS, PRIORITY_ORDER,
  CONVERSATION_STATUS_LABELS,
  type Conversation, type Message, type CannedResponse, type AgentOption,
  type ConversationStatus, type ConversationPriority, type ConversationChannel,
  type AtendimentoTeam,
  type AtendimentoLabel, type AtendimentoMacro, type MacroAction, type Profile,
  type AtendimentoPapel,
  rotuloAgente,
} from "@/lib/types";
import {
  EtiquetaChip, PrioridadeChip, StatusChip,
} from "@/components/atendimento/Chips";
import { ContactPanel } from "./ContactPanel";
import { ConversationList, CHANNEL_DOT } from "./inbox/ConversationList";
import { MessageThread } from "./inbox/MessageThread";
import { Composer } from "./inbox/Composer";
import { SnoozeMenu } from "./inbox/SnoozeMenu";
import { ParticipantsMenu } from "./inbox/ParticipantsMenu";
import { CopilotPanel } from "./inbox/CopilotPanel";
import { BotBadge } from "./inbox/BotBadge";
import { PainelTriagem } from "./inbox/PainelTriagem";
import { AcoesAdmin } from "./inbox/AcoesAdmin";
import { useNotificacoes } from "./inbox/useNotificacoes";
import { Modal } from "@/components/atendimento/ui";
import {
  RefreshCw, Check, X, RotateCcw, Clock, Search, SlidersHorizontal, ArrowDownUp,
  CheckSquare, Users2, Flag, Tag as TagIcon, PanelRightClose, PanelRightOpen,
  AlarmClock, Trash2, MessageSquareDot, MailOpen, Volume2, VolumeX, Sparkles,
  Inbox as InboxIcon, Hand, PartyPopper,
} from "lucide-react";

type StatusFilter = "todas" | ConversationStatus;
type AssignFilter = "todas" | "minhas" | "nao_atribuidas";
type Ordenacao = "recentes" | "antigas" | "prioridade" | "criacao";

const ORDENACAO_LABELS: Record<Ordenacao, string> = {
  recentes: "Última atividade",
  antigas: "Mais antigas primeiro",
  prioridade: "Prioridade",
  criacao: "Data de criação",
};

function contactName(c: Conversation) {
  return c.contato_nome || c.contato_telefone || "Contato";
}

export function AtendimentoInbox({
  initialConversations,
  cannedResponses,
  agents,
  teams,
  labels,
  macros,
  provedorPorCanal,
  canaisPorId,
  currentUser,
  papel,
  membrosPorEquipe,
  minhasEquipes,
}: {
  initialConversations: Conversation[];
  cannedResponses: CannedResponse[];
  agents: AgentOption[];
  teams: AtendimentoTeam[];
  labels: AtendimentoLabel[];
  macros: AtendimentoMacro[];
  /** channel_id -> provedor, para o composer avisar sobre formato de áudio. */
  provedorPorCanal?: Record<string, string>;
  /**
   * channel_id -> conexão. Com mais de um número conectado, é o que
   * permite ver e filtrar POR QUAL deles a conversa entrou. Com um só,
   * a tela esconde essa informação — seria ruído em toda linha.
   */
  canaisPorId?: Record<string, { nome: string; canal: string; telefone: string | null }>;
  currentUser: Pick<Profile, "id" | "nome" | "cargo" | "assinatura">;
  /**
   * Papel no atendimento (0040). A RLS é quem bloqueia de verdade — isto
   * serve para a tela NÃO oferecer o que o papel não pode fazer e para
   * explicar por que a lista está vazia em vez de deixar o usuário achar
   * que o sistema quebrou.
   */
  papel: AtendimentoPapel;
  /** team_id -> profile_id[]: quem está em cada fila. */
  membrosPorEquipe: Record<string, string[]>;
  /** As filas de que EU participo — habilita o botão "Assumir". */
  minhasEquipes: string[];
}) {
  const params = useSearchParams();
  const vistaParam = params.get("vista"); // "central" | "mencoes" | "nao_atendidas" | null
  const convParam = params.get("c");

  /**
   * A recepção abre direto na CAIXA CENTRAL: é o trabalho dela, e sem
   * isso ela cairia numa lista "todas" que, dependendo da configuração
   * `recepcao_ve_atribuidas`, pode estar vazia. O administrador abre em
   * "todas" — ele acompanha tudo e escolhe a vista pelo menu.
   */
  const vista = vistaParam ?? (papel === "recepcao" ? "central" : null);
  const naCaixaCentral = vista === "central";
  const podeTriar = papel === "recepcao" || papel === "administrador";
  const ehAdmin = papel === "administrador";

  const [conversations, setConversations] = useState<Conversation[]>(initialConversations);
  const [selectedId, setSelectedId] = useState<string | null>(
    convParam ?? initialConversations[0]?.id ?? null,
  );
  const [messages, setMessages] = useState<Message[]>([]);
  const [minhasMencoes, setMinhasMencoes] = useState<Set<string>>(new Set());
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<{ tipo: "erro" | "info"; texto: string } | null>(null);
  const [respondendoA, setRespondendoA] = useState<Message | null>(null);

  // Filtros
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("todas");
  const [assignFilter, setAssignFilter] = useState<AssignFilter>("todas");
  const [busca, setBusca] = useState("");
  const [canalFiltro, setCanalFiltro] = useState<string>("todos");
  /** Filtro por CONEXÃO (qual número), diferente do filtro por tipo de canal. */
  const [conexaoFiltro, setConexaoFiltro] = useState<string>("todas");

  /**
   * As conexões cadastradas, em lista. Com UMA só, a tela não mostra nem
   * o filtro nem o rótulo do número: seria a mesma informação repetida em
   * toda linha, o oposto de ajudar.
   */
  const conexoes = useMemo(
    () => Object.entries(canaisPorId ?? {}).map(([id, c]) => ({ id, ...c })),
    [canaisPorId],
  );
  const multiplasConexoes = conexoes.length > 1;
  const [prioridadeFiltro, setPrioridadeFiltro] = useState<string>("todas");
  const [equipeFiltro, setEquipeFiltro] = useState<string>("todas");
  const [etiquetaFiltro, setEtiquetaFiltro] = useState<string>("todas");
  const [ordenacao, setOrdenacao] = useState<Ordenacao>("recentes");
  const [filtrosAbertos, setFiltrosAbertos] = useState(false);
  const [ordenacaoAberta, setOrdenacaoAberta] = useState(false);

  // Seleção múltipla
  const [modoSelecao, setModoSelecao] = useState(false);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());
  const [modalMassa, setModalMassa] = useState<null | "agente" | "equipe" | "etiqueta" | "prioridade" | "excluir">(null);

  // Painel de contato. Nasce RECOLHIDO: aberto por padrão ele come a largura
  // da conversa, que é o que o atendente lê o tempo todo — a informação do
  // contato é consulta pontual, não leitura contínua. A preferência de quem
  // prefere vê-lo sempre aberto sobrevive ao recarregar.
  const [painelAberto, setPainelAberto] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem("atendimento:painelContato") === "aberto") setPainelAberto(true);
    } catch {
      // Navegador com storage bloqueado: segue recolhido, sem quebrar a tela.
    }
  }, []);
  useEffect(() => {
    try {
      localStorage.setItem("atendimento:painelContato", painelAberto ? "aberto" : "recolhido");
    } catch {
      /* idem */
    }
  }, [painelAberto]);
  const [novaTag, setNovaTag] = useState("");

  // Busca dentro da thread + copiloto de IA
  const [buscaThread, setBuscaThread] = useState("");
  const [buscaThreadAberta, setBuscaThreadAberta] = useState(false);
  const [copilotoAberto, setCopilotoAberto] = useState(false);
  const [textoSugerido, setTextoSugerido] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const notif = useNotificacoes();
  const { avisar } = notif;

  const agentName = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.nome);
    return m;
  }, [agents]);

  const labelColors = useMemo(() => {
    const m = new Map<string, string>();
    for (const l of labels) m.set(l.nome, l.cor);
    return m;
  }, [labels]);

  const selected = conversations.find((c) => c.id === selectedId) ?? null;

  // Busca dentro da thread: filtra as mensagens visíveis (o destaque do
  // trecho quem faz é o MessageThread).
  const mensagensFiltradas = useMemo(() => {
    const q = buscaThread.trim().toLowerCase();
    if (!q) return messages;
    return messages.filter((m) => (m.conteudo ?? "").toLowerCase().includes(q));
  }, [messages, buscaThread]);

  // ------------------------------------------------------------------
  // Carregamento
  // ------------------------------------------------------------------
  const loadMessages = useCallback(async (convId: string) => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: true });
    setMessages((data ?? []) as Message[]);
  }, []);

  const refreshConversations = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("conversations")
      .select("*")
      .order("last_message_at", { ascending: false })
      .limit(300);
    if (data) setConversations(data as Conversation[]);
  }, []);

  // Quais conversas têm nota interna me mencionando (aba "Menções").
  const loadMencoes = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("messages")
      .select("conversation_id")
      .contains("mentions", [currentUser.id])
      .limit(300);
    setMinhasMencoes(new Set((data ?? []).map((m) => m.conversation_id as string)));
  }, [currentUser.id]);

  useEffect(() => { void loadMencoes(); }, [loadMencoes]);

  function patchLocal(id: string, patch: Partial<Conversation>) {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }

  // Ao selecionar: carrega mensagens e zera o não-lidas.
  useEffect(() => {
    if (!selectedId) return;
    setRespondendoA(null);
    setLoadingMsgs(true);
    loadMessages(selectedId).finally(() => setLoadingMsgs(false));
    setBuscaThread("");
    setBuscaThreadAberta(false);
    const supabase = createSupabaseBrowser();
    // Abrir a conversa limpa o não-lidas E o "marcada como não lida" — se
    // o agente marcou e voltou, a marcação já cumpriu o papel dela.
    void supabase
      .from("conversations")
      .update({ unread_count: 0, marcada_nao_lida: false })
      .eq("id", selectedId)
      .then(() => {
        patchLocal(selectedId, { unread_count: 0, marcada_nao_lida: false });
      });
  }, [selectedId, loadMessages]);

  // Tempo real + fallback por polling.
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    const channel = supabase
      .channel("atendimento-inbox")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (payload) => {
        const m = payload.new as Message;
        if (m.conversation_id === selectedId) {
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [...prev, m]));
        }
        if (m.mentions?.includes(currentUser.id)) {
          setMinhasMencoes((prev) => new Set(prev).add(m.conversation_id));
        }
        // Só mensagem do cliente merece som/notificação — o eco da nossa
        // própria resposta tocando um "blim" seria irritante.
        if (m.direcao === "in" && !m.interna) {
          avisar(
            "Nova mensagem no atendimento",
            m.conteudo?.slice(0, 120) ?? `[${m.tipo}]`,
            () => setSelectedId(m.conversation_id),
          );
        }
        void refreshConversations();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        void refreshConversations();
      })
      .subscribe();
    const t = setInterval(() => {
      void refreshConversations();
      if (selectedId) void loadMessages(selectedId);
    }, 30000);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, [selectedId, loadMessages, refreshConversations, currentUser.id, avisar]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // ------------------------------------------------------------------
  // Filtros e contadores
  // ------------------------------------------------------------------
  const porVista = useMemo(() => {
    // CAIXA CENTRAL = tudo que ainda não passou pela triagem. `triada_em`
    // nulo é a definição, não uma heurística: é a mesma coluna que a RLS
    // usa para decidir quem enxerga o quê (ver 0040).
    if (vista === "central") return conversations.filter((c) => !c.triada_em);
    if (vista === "mencoes") return conversations.filter((c) => minhasMencoes.has(c.id));
    if (vista === "nao_atendidas") {
      // "Não atendidas" = tem mensagem do cliente e ninguém respondeu ainda.
      return conversations.filter((c) => !c.primeira_resposta_em && c.status !== "resolvida");
    }
    return conversations;
  }, [conversations, vista, minhasMencoes]);

  const byStatus = useMemo(
    () => porVista.filter((c) => statusFilter === "todas" || c.status === statusFilter),
    [porVista, statusFilter],
  );

  const counts = useMemo(() => ({
    minhas: byStatus.filter((c) => c.responsavel_id === currentUser.id).length,
    nao_atribuidas: byStatus.filter((c) => !c.responsavel_id).length,
    todas: byStatus.length,
  }), [byStatus, currentUser.id]);

  // Todos os filtros MENOS o de canal.
  //
  // Separado porque as abas de canal precisam mostrar quantas conversas há
  // em cada uma. Se a contagem viesse da lista já filtrada por canal, toda
  // aba não-selecionada marcaria zero — e o número perderia a única função
  // que tem, que é dizer onde vale a pena clicar. As outras condições
  // continuam valendo: com "não atribuídas" ligado, a aba do WhatsApp conta
  // as não atribuídas do WhatsApp, não o total dele.
  const passaSemCanal = useCallback((c: Conversation) => {
    if (assignFilter === "minhas" && c.responsavel_id !== currentUser.id) return false;
    if (assignFilter === "nao_atribuidas" && c.responsavel_id) return false;
    if (conexaoFiltro !== "todas" && c.channel_id !== conexaoFiltro) return false;
    if (prioridadeFiltro !== "todas") {
      if (prioridadeFiltro === "sem" ? c.prioridade !== null : c.prioridade !== prioridadeFiltro) return false;
    }
    if (equipeFiltro !== "todas") {
      if (equipeFiltro === "sem" ? c.team_id !== null : c.team_id !== equipeFiltro) return false;
    }
    if (etiquetaFiltro !== "todas" && !c.tags.includes(etiquetaFiltro)) return false;
    if (busca.trim()) {
      const q = busca.toLowerCase();
      const hay = `${c.contato_nome ?? ""} ${c.contato_telefone ?? ""} ${c.last_message_preview ?? ""} ${c.tags.join(" ")}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  }, [assignFilter, currentUser.id, conexaoFiltro, prioridadeFiltro, equipeFiltro, etiquetaFiltro, busca]);

  /** Quantas conversas por canal, para o número na aba. */
  const contagemPorCanal = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const c of byStatus) if (passaSemCanal(c)) acc[c.canal] = (acc[c.canal] ?? 0) + 1;
    return acc;
  }, [byStatus, passaSemCanal]);

  /**
   * Quais abas desenhar. Sai de `porVista` — não de `byStatus` — porque o
   * filtro de status não deve fazer uma aba SUMIR: resolver a última
   * conversa do Instagram apagaria a aba dele no meio do expediente, e a
   * pessoa concluiria que a integração caiu.
   *
   * O canal selecionado entra na lista mesmo sem conversa, senão a aba se
   * apaga debaixo do próprio clique e o filtro fica ligado sem nada na tela
   * indicando isso.
   */
  const canaisComConversa = useMemo(() => {
    const vistos = new Set(porVista.map((c) => c.canal));
    if (canalFiltro !== "todos") vistos.add(canalFiltro as ConversationChannel);
    return (Object.keys(CHANNEL_LABELS) as ConversationChannel[]).filter((ch) => vistos.has(ch));
  }, [porVista, canalFiltro]);

  const filtered = useMemo(() => {
    const lista = byStatus.filter((c) => {
      if (assignFilter === "minhas" && c.responsavel_id !== currentUser.id) return false;
      if (assignFilter === "nao_atribuidas" && c.responsavel_id) return false;
      if (canalFiltro !== "todos" && c.canal !== canalFiltro) return false;
      if (conexaoFiltro !== "todas" && c.channel_id !== conexaoFiltro) return false;
      if (prioridadeFiltro !== "todas") {
        if (prioridadeFiltro === "sem" ? c.prioridade !== null : c.prioridade !== prioridadeFiltro) return false;
      }
      if (equipeFiltro !== "todas") {
        if (equipeFiltro === "sem" ? c.team_id !== null : c.team_id !== equipeFiltro) return false;
      }
      if (etiquetaFiltro !== "todas" && !c.tags.includes(etiquetaFiltro)) return false;
      if (busca.trim()) {
        const q = busca.toLowerCase();
        const hay = `${c.contato_nome ?? ""} ${c.contato_telefone ?? ""} ${c.last_message_preview ?? ""} ${c.tags.join(" ")}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });

    const peso = (p: ConversationPriority | null) => (p ? PRIORITY_ORDER.indexOf(p) : 99);
    return [...lista].sort((a, b) => {
      if (ordenacao === "prioridade") {
        const d = peso(a.prioridade) - peso(b.prioridade);
        if (d !== 0) return d;
        return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
      }
      if (ordenacao === "antigas") {
        return new Date(a.last_message_at).getTime() - new Date(b.last_message_at).getTime();
      }
      if (ordenacao === "criacao") {
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      }
      return new Date(b.last_message_at).getTime() - new Date(a.last_message_at).getTime();
    });
  }, [
    byStatus, assignFilter, busca, currentUser.id, canalFiltro, conexaoFiltro,
    prioridadeFiltro, equipeFiltro, etiquetaFiltro, ordenacao,
  ]);

  const filtrosAtivos =
    (canalFiltro !== "todos" ? 1 : 0) + (conexaoFiltro !== "todas" ? 1 : 0) +
    (prioridadeFiltro !== "todas" ? 1 : 0) +
    (equipeFiltro !== "todas" ? 1 : 0) + (etiquetaFiltro !== "todas" ? 1 : 0);

  // ------------------------------------------------------------------
  // Ações na conversa
  // ------------------------------------------------------------------
  const supa = () => createSupabaseBrowser();

  async function atualizar(id: string, patch: Partial<Conversation>, update: Record<string, unknown>) {
    patchLocal(id, patch);
    const { error } = await supa().from("conversations").update(update).eq("id", id);
    if (error) setNotice({ tipo: "erro", texto: error.message });
  }

  /**
   * Substitui a conversa pela linha que o servidor devolveu. As rotas de
   * triagem escrevem várias colunas de uma vez (fila, responsável,
   * carimbo); remontar isso à mão no cliente é como o estado da tela
   * desanda.
   */
  function reconciliar(conv: Conversation) {
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? conv : c)));
  }

  /**
   * Depois de triar, a conversa some da caixa central — então a tela tem
   * que ir sozinha para a PRÓXIMA. Sem isso a recepcionista volta para
   * uma tela sem seleção e clica de novo a cada triagem; com volume, é a
   * diferença entre a tela ser usável e não ser.
   *
   * A próxima é calculada ANTES de reconciliar: depois da atualização a
   * conversa já saiu de `filtered` e o índice não existiria mais.
   */
  function triada(conv: Conversation) {
    const i = filtered.findIndex((c) => c.id === conv.id);
    const proxima = filtered[i + 1] ?? filtered[i - 1] ?? null;
    reconciliar(conv);
    if (naCaixaCentral) setSelectedId(proxima ? proxima.id : null);
    setNotice({
      tipo: "info",
      texto: `Conversa encaminhada${
        conv.team_id ? ` para ${teams.find((t) => t.id === conv.team_id)?.nome ?? "a fila"}` : ""
      }.`,
    });
    void refreshConversations();
  }

  /** Atendente pega para si uma conversa que está na fila dele sem dono. */
  async function assumir() {
    if (!selected) return;
    try {
      const res = await fetch("/api/atendimento/triagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: selected.id, acao: "assumir" }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string; conversa?: Conversation;
      };
      if (!res.ok || !json.conversa) {
        setNotice({ tipo: "erro", texto: json.error ?? "Não deu para assumir a conversa." });
        return;
      }
      reconciliar(json.conversa);
      // Devolve o rótulo com que o time vai te ver. Com dois "Ana" na
      // fila, "ela é sua agora" não diz a quem a conversa ficou.
      setNotice({
        tipo: "info",
        texto: `Conversa assumida — o time vê "${rotuloAgente(currentUser)}" como responsável.`,
      });
    } catch {
      setNotice({ tipo: "erro", texto: "Erro de rede ao assumir a conversa." });
    }
  }

  const assign = (agentId: string | null) =>
    selected && atualizar(selected.id, { responsavel_id: agentId }, { responsavel_id: agentId });

  const assignTeam = (teamId: string | null) =>
    selected && atualizar(selected.id, { team_id: teamId }, { team_id: teamId });

  const setPrioridade = (p: ConversationPriority | null) =>
    selected && atualizar(selected.id, { prioridade: p }, { prioridade: p });

  /**
   * Mudança de status vai pela rota de API, não pelo Supabase direto. Do
   * navegador não dá para gravar auditoria (o log não tem policy de
   * escrita, de propósito) nem assinar o webhook de saída (o segredo não
   * pode ir para o cliente) — e as automações de "conversa_resolvida"
   * ficariam órfãs. A UI atualiza otimista e volta atrás se der erro.
   */
  async function mudarStatus(
    status: ConversationStatus,
    conv = selected,
    snoozedUntil: string | null = null,
  ) {
    if (!conv) return;
    const anterior = { status: conv.status, snoozed_until: conv.snoozed_until };
    const patch: Partial<Conversation> = { status, snoozed_until: snoozedUntil };
    if (status === "resolvida") {
      patch.resolvida_em = new Date().toISOString();
      patch.resolvida_por = currentUser.id;
    }
    patchLocal(conv.id, patch);

    try {
      const res = await fetch(`/api/atendimento/conversas/${conv.id}/status`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, snoozedUntil }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        patchLocal(conv.id, anterior);
        setNotice({ tipo: "erro", texto: json.error ?? "Não deu para mudar o status." });
        return;
      }
      void refreshConversations();
    } catch {
      patchLocal(conv.id, anterior);
      setNotice({ tipo: "erro", texto: "Erro de rede ao mudar o status." });
    }
  }

  async function adiar(ate: Date | null) {
    if (!selected) return;
    await mudarStatus("adiada", selected, ate?.toISOString() ?? null);
    setNotice({
      tipo: "info",
      texto: ate
        ? `Conversa adiada até ${ate.toLocaleString("pt-BR")}.`
        : "Conversa adiada até o cliente responder.",
    });
  }

  async function saveTags(tags: string[]) {
    if (!selected) return;
    await atualizar(selected.id, { tags }, { tags });
  }
  function addTag(valor?: string) {
    const t = (valor ?? novaTag).trim().toLowerCase();
    if (!t || !selected || selected.tags.includes(t)) { setNovaTag(""); return; }
    void saveTags([...selected.tags, t]);
    setNovaTag("");
  }
  function removeTag(t: string) {
    if (!selected) return;
    void saveTags(selected.tags.filter((x) => x !== t));
  }

  /**
   * Marcar como não lida. O `unread_count` zera assim que o agente abre a
   * conversa, então ele não serve de lembrete — daí a flag própria. Sai da
   * conversa em seguida, senão o efeito de seleção zeraria tudo de novo.
   */
  async function marcarNaoLida() {
    if (!selected) return;
    await atualizar(selected.id, { marcada_nao_lida: true }, { marcada_nao_lida: true });
    setSelectedId(null);
  }

  /** Apagar é soft delete: some o conteúdo, fica o rastro (ver 0035). */
  async function apagarMensagem(m: Message) {
    const agora = new Date().toISOString();
    setMessages((prev) =>
      prev.map((x) =>
        x.id === m.id
          ? { ...x, apagada_em: agora, apagada_por: currentUser.id, conteudo: null, media_url: null }
          : x,
      ),
    );
    const { error } = await supa()
      .from("messages")
      .update({ apagada_em: agora, apagada_por: currentUser.id, conteudo: null, media_url: null })
      .eq("id", m.id);
    if (error) {
      setNotice({ tipo: "erro", texto: `Não deu para apagar: ${error.message}` });
      if (selectedId) void loadMessages(selectedId);
    }
  }

  // ------------------------------------------------------------------
  // Envio (texto + anexos)
  // ------------------------------------------------------------------
  async function enviar({
    texto, interna, arquivos, mentions, assinar,
  }: {
    texto: string; interna: boolean; arquivos: File[]; mentions: string[]; assinar: boolean;
  }) {
    if (!selectedId || sending) return;
    setSending(true);
    setNotice(null);
    const supabase = supa();

    try {
      // 1) Sobe os anexos e manda cada um como mensagem própria.
      for (const file of arquivos) {
        try {
          const up = await uploadAtendimentoMedia(supabase, selectedId, file);
          const res = await fetch("/api/atendimento/send", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              conversationId: selectedId,
              interna,
              mediaUrl: up.url,
              mediaNome: up.nome,
              mediaMime: up.mime,
              mediaTamanho: up.tamanho,
              tipo: tipoDaMensagemPeloMime(up.mime),
              replyToId: respondendoA?.id ?? null,
            }),
          });
          const json = await res.json();
          if (!res.ok) setNotice({ tipo: "erro", texto: json.error ?? "Falha ao enviar o anexo." });
          else if (json.message) setMessages((prev) => [...prev, json.message as Message]);
        } catch (e) {
          setNotice({
            tipo: "erro",
            texto: `Anexo "${file.name}": ${uploadErrorMsg(e instanceof Error ? e.message : String(e))}`,
          });
        }
      }

      // 2) O texto (se houver).
      if (texto) {
        const res = await fetch("/api/atendimento/send", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: selectedId,
            texto,
            interna,
            mentions,
            assinar,
            replyToId: respondendoA?.id ?? null,
          }),
        });
        const json = await res.json();
        if (!res.ok) {
          setNotice({ tipo: "erro", texto: json.error ?? "Falha ao enviar." });
        } else {
          if (json.message) setMessages((prev) => [...prev, json.message as Message]);
          if (json.delivered === false) {
            setNotice({
              tipo: "erro",
              texto: `Mensagem registrada, mas NÃO entregue ao cliente (${json.reason}). Verifique o canal em Canais.`,
            });
          }
        }
      }

      setRespondendoA(null);
      void refreshConversations();
    } catch {
      setNotice({ tipo: "erro", texto: "Erro de rede ao enviar." });
    } finally {
      setSending(false);
    }
  }

  // ------------------------------------------------------------------
  // Macros
  // ------------------------------------------------------------------
  async function aplicarMacro(macroId: string) {
    const macro = macros.find((m) => m.id === macroId);
    if (!macro || !selected) return;
    const conv = selected;
    let tags = [...conv.tags];
    const patch: Partial<Conversation> = {};
    const update: Record<string, unknown> = {};

    for (const acao of macro.acoes as MacroAction[]) {
      switch (acao.tipo) {
        case "atribuir_agente": patch.responsavel_id = acao.valor; update.responsavel_id = acao.valor; break;
        case "atribuir_equipe": patch.team_id = acao.valor; update.team_id = acao.valor; break;
        case "mudar_status": {
          const s = acao.valor as ConversationStatus;
          patch.status = s; update.status = s;
          if (s === "resolvida") {
            const now = new Date().toISOString();
            patch.resolvida_em = now; update.resolvida_em = now;
            patch.resolvida_por = currentUser.id; update.resolvida_por = currentUser.id;
          }
          break;
        }
        case "mudar_prioridade": {
          const p = (acao.valor || null) as ConversationPriority | null;
          patch.prioridade = p; update.prioridade = p;
          break;
        }
        case "adicionar_etiqueta":
          if (!tags.includes(acao.valor)) tags.push(acao.valor);
          break;
        case "remover_etiqueta":
          tags = tags.filter((t) => t !== acao.valor);
          break;
        case "enviar_mensagem":
          await enviar({ texto: acao.valor, interna: false, arquivos: [], mentions: [], assinar: false });
          break;
        case "adicionar_nota":
          await enviar({ texto: acao.valor, interna: true, arquivos: [], mentions: [], assinar: false });
          break;
      }
    }

    patch.tags = tags; update.tags = tags;
    await atualizar(conv.id, patch, update);
    setNotice({ tipo: "info", texto: `Macro "${macro.nome}" aplicada.` });
  }

  // ------------------------------------------------------------------
  // Ações em massa
  // ------------------------------------------------------------------
  const idsSelecionados = useMemo(() => Array.from(selecionadas), [selecionadas]);

  function alternarSelecao(id: string) {
    setSelecionadas((prev) => {
      const s = new Set(prev);
      if (s.has(id)) s.delete(id); else s.add(id);
      return s;
    });
  }

  function selecionarTodas() {
    setSelecionadas((prev) =>
      prev.size === filtered.length ? new Set() : new Set(filtered.map((c) => c.id)),
    );
  }

  async function massaAtualizar(update: Record<string, unknown>) {
    if (idsSelecionados.length === 0) return;
    const { error } = await supa().from("conversations").update(update).in("id", idsSelecionados);
    if (error) { setNotice({ tipo: "erro", texto: error.message }); return; }
    setNotice({ tipo: "info", texto: `${idsSelecionados.length} conversa(s) atualizada(s).` });
    setSelecionadas(new Set());
    setModalMassa(null);
    void refreshConversations();
  }

  async function massaEtiquetar(etiqueta: string) {
    // tags é array — precisa mesclar conversa a conversa.
    const alvo = conversations.filter((c) => selecionadas.has(c.id));
    for (const c of alvo) {
      if (c.tags.includes(etiqueta)) continue;
      await supa().from("conversations").update({ tags: [...c.tags, etiqueta] }).eq("id", c.id);
    }
    setNotice({ tipo: "info", texto: `Etiqueta "${etiqueta}" aplicada a ${alvo.length} conversa(s).` });
    setSelecionadas(new Set());
    setModalMassa(null);
    void refreshConversations();
  }

  /** Excluir é a ação mais destrutiva do inbox — vai pela rota, que grava
   *  quem apagou o quê. A RLS continua decidindo o que o agente pode. */
  async function massaExcluir() {
    try {
      const res = await fetch("/api/atendimento/conversas", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids: idsSelecionados }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setNotice({ tipo: "erro", texto: json.error ?? "Não deu para excluir." });
        return;
      }
      setNotice({ tipo: "info", texto: `${idsSelecionados.length} conversa(s) excluída(s).` });
    } catch {
      setNotice({ tipo: "erro", texto: "Erro de rede ao excluir." });
      return;
    }
    setSelecionadas(new Set());
    setModalMassa(null);
    setSelectedId(null);
    void refreshConversations();
  }

  // ------------------------------------------------------------------
  // Atalhos de teclado
  // ------------------------------------------------------------------
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const alvo = e.target as HTMLElement | null;
      const digitando = alvo && ["INPUT", "TEXTAREA"].includes(alvo.tagName);
      if (e.key === "Escape") { setModoSelecao(false); setSelecionadas(new Set()); return; }
      if (!e.altKey || !selected) return;
      const k = e.key.toLowerCase();
      if (k === "r") {
        e.preventDefault();
        void mudarStatus(selected.status === "resolvida" ? "aberta" : "resolvida");
      } else if (k === "e") {
        e.preventDefault();
        void adiar(new Date(Date.now() + 3 * 60 * 60 * 1000));
      } else if ((e.key === "ArrowDown" || e.key === "ArrowUp") && !digitando) {
        e.preventDefault();
        const i = filtered.findIndex((c) => c.id === selected.id);
        const prox = e.key === "ArrowDown" ? i + 1 : i - 1;
        if (filtered[prox]) setSelectedId(filtered[prox].id);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected, filtered]);

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  const tituloVista =
    vista === "central" ? "Caixa central"
      : vista === "mencoes" ? "Menções"
      : vista === "nao_atendidas" ? "Não atendidas"
      : "Conversas";

  // Só faz sentido oferecer triagem em conversa que ainda não foi triada.
  const mostrarTriagem = Boolean(selected && !selected.triada_em && podeTriar);

  // "Assumir" só aparece quando há de fato o que assumir: conversa já
  // triada, numa fila minha e sem dono. Com dono, o caminho é a
  // transferência pelo administrador — e a rota recusa mesmo.
  const podeAssumir = Boolean(
    selected &&
      selected.triada_em &&
      !selected.responsavel_id &&
      selected.team_id &&
      (ehAdmin || minhasEquipes.includes(selected.team_id)),
  );

  // "Ana Paula · Corretora" do responsável atual. `null` quando a conversa
  // não tem dono OU quando o perfil saiu da lista (agente desativado) —
  // o cabeçalho trata os dois casos.
  const responsavelRotulo = (() => {
    if (!selected?.responsavel_id) return null;
    const dono = agents.find((a) => a.id === selected.responsavel_id);
    return dono ? rotuloAgente(dono) : null;
  })();

  return (
    /*
      LAYOUT EM CARTÕES
      -----------------
      Os três painéis eram colados de borda a borda, separados só por uma
      linha de 1px — a tela inteira lia como um bloco só, sem hierarquia.
      Agora cada um é um cartão com respiro em volta, sobre o fundo tingido
      da página.

      `max-w` + `mx-auto`: em monitor largo, a coluna da conversa esticava
      até o infinito e a linha de texto ficava longa demais para acompanhar
      com o olho. O container central segura isso sem prejudicar telas
      normais, onde o limite simplesmente nunca é atingido.

      `min-h-0` continua em cada nível: sem ele, um filho com scroll próprio
      estoura a altura do pai em vez de rolar dentro dele — é o que faz a
      lista e a thread rolarem cada uma no seu cartão.
    */
    <div className="flex h-full min-h-0 gap-3 p-3 bg-muted/30 mx-auto w-full max-w-[1800px]">
      {/* ================= Lista ================= */}
      <aside className="w-[340px] shrink-0 rounded-2xl border bg-card shadow-sm flex flex-col min-h-0 overflow-hidden">
        <div className="border-b shrink-0">
          <div className="px-3 pt-2.5 pb-1 flex items-center gap-2">
            <h1 className="font-semibold text-[15px] flex-1 truncate">{tituloVista}</h1>
            <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
              {filtered.length}
            </span>
            <button
              type="button"
              onClick={() => { setModoSelecao((v) => !v); setSelecionadas(new Set()); }}
              title="Selecionar várias"
              className={`p-1.5 rounded-md hover:bg-muted ${modoSelecao ? "text-arini dark:text-gold" : "text-muted-foreground"}`}
            >
              <CheckSquare size={15} />
            </button>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setFiltrosAbertos((v) => !v); setOrdenacaoAberta(false); }}
                title="Filtros"
                className={`p-1.5 rounded-md hover:bg-muted relative ${filtrosAtivos ? "text-arini dark:text-gold" : "text-muted-foreground"}`}
              >
                <SlidersHorizontal size={15} />
                {filtrosAtivos > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-acao text-acao-foreground text-[8px] flex items-center justify-center">
                    {filtrosAtivos}
                  </span>
                )}
              </button>
              {filtrosAbertos && (
                <PainelFiltros
                  onFechar={() => setFiltrosAbertos(false)}
                  canal={canalFiltro} setCanal={setCanalFiltro}
                  prioridade={prioridadeFiltro} setPrioridade={setPrioridadeFiltro}
                  equipe={equipeFiltro} setEquipe={setEquipeFiltro}
                  etiqueta={etiquetaFiltro} setEtiqueta={setEtiquetaFiltro}
                  conexao={conexaoFiltro} setConexao={setConexaoFiltro}
                  conexoes={conexoes}
                  teams={teams} labels={labels}
                  onLimpar={() => {
                    setCanalFiltro("todos"); setPrioridadeFiltro("todas");
                    setEquipeFiltro("todas"); setEtiquetaFiltro("todas");
                    setConexaoFiltro("todas");
                  }}
                />
              )}
            </div>
            <div className="relative">
              <button
                type="button"
                onClick={() => { setOrdenacaoAberta((v) => !v); setFiltrosAbertos(false); }}
                title="Ordenar"
                className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
              >
                <ArrowDownUp size={15} />
              </button>
              {ordenacaoAberta && (
                <div className="absolute right-0 top-9 z-40 w-52 rounded-lg border bg-popover shadow-xl overflow-hidden">
                  {(Object.keys(ORDENACAO_LABELS) as Ordenacao[]).map((o) => (
                    <button
                      key={o}
                      type="button"
                      onClick={() => { setOrdenacao(o); setOrdenacaoAberta(false); }}
                      className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-muted text-left"
                    >
                      <span className="flex-1">{ORDENACAO_LABELS[o]}</span>
                      {ordenacao === o && <Check size={13} className="text-arini dark:text-gold" />}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => void refreshConversations()}
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
              title="Atualizar"
            >
              <RefreshCw size={15} />
            </button>
          </div>

          {/* Cabeçalho próprio da caixa central: quem cai aqui pela
              primeira vez precisa entender o que é esta tela antes de
              clicar em qualquer coisa. */}
          {naCaixaCentral && (
            <div className="mx-3 mb-2 rounded-lg border border-arini/25 bg-arini/5 dark:border-gold/25 dark:bg-gold/10 px-2.5 py-2">
              <p className="text-[11px] leading-snug text-arini dark:text-gold font-medium">
                Tudo que chega cai aqui. Classifique e encaminhe.
              </p>
              <p className="text-[11px] leading-snug text-muted-foreground mt-0.5">
                WhatsApp, Instagram, Messenger e site. A conversa sai desta lista assim que
                você atribui uma fila.
              </p>
            </div>
          )}

          {/*
            Abas por canal. O pedido do Carlos (21/08): "se a gente [tivesse]
            abas igual aba do WhatsApp e aba do Messenger, aba do Instagram,
            tudo no mesmo segmento" — porque com tudo integrado a lista única
            "tá ficando muito tumultuado".

            É SÓ A TELA, e isso foi explícito: "não precisa separar ela dentro
            do CRM nem nada, só a tela". Por isso a aba escreve no MESMO
            `canalFiltro` que o painel de filtros já usava — nada de caixa
            nova, fila nova ou coluna nova. Trocar de aba é trocar um filtro.

            Só aparece canal que tem conversa (mais "Todos"): abas fixas para
            os cinco canais deixariam três zeradas para sempre em quem usa
            só WhatsApp, que é ruído no lugar de organização.
          */}
          {canaisComConversa.length > 1 && (
            <div className="px-3 pb-1.5">
              <div
                role="tablist"
                aria-label="Filtrar conversas por canal"
                className="flex items-center gap-1 overflow-x-auto scrollbar-none"
              >
                {(["todos", ...canaisComConversa] as ("todos" | ConversationChannel)[]).map((ch) => {
                  const ativo = canalFiltro === ch;
                  const n = ch === "todos"
                    ? Object.values(contagemPorCanal).reduce((a, b) => a + b, 0)
                    : contagemPorCanal[ch] ?? 0;
                  return (
                    <button
                      key={ch}
                      type="button"
                      role="tab"
                      aria-selected={ativo}
                      onClick={() => setCanalFiltro(ch)}
                      className={`shrink-0 flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium border transition-colors ${
                        ativo
                          ? "bg-arini text-white border-arini dark:bg-gold dark:text-arini dark:border-gold"
                          : "bg-transparent text-muted-foreground border-transparent hover:bg-muted"
                      }`}
                    >
                      {ch !== "todos" && (
                        <span className={`h-1.5 w-1.5 rounded-full ${CHANNEL_DOT[ch] ?? "bg-muted-foreground"}`} />
                      )}
                      {ch === "todos" ? "Todos" : CHANNEL_LABELS[ch]}
                      <span className={ativo ? "opacity-80" : "opacity-60"}>{n}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className="px-3 pb-2">
            <div className="relative">
              <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                value={busca}
                onChange={(e) => setBusca(e.target.value)}
                placeholder="Buscar por nome, telefone ou etiqueta…"
                className="w-full pl-7 pr-2 py-1.5 text-sm rounded-md border bg-background outline-none focus:ring-2 focus:ring-ring/40"
              />
            </div>
          </div>

          {/* Abas de atribuição. Na caixa central não existem: por
              definição nada ali tem responsável, então as três abas
              mostrariam a mesma lista e a de "Minhas" viria sempre zerada. */}
          <div className={`flex text-xs px-3 gap-4 ${naCaixaCentral ? "hidden" : ""}`}>
            {([
              ["minhas", "Minhas", counts.minhas],
              ["nao_atribuidas", "Não atribuídas", counts.nao_atribuidas],
              ["todas", "Todos", counts.todas],
            ] as [AssignFilter, string, number][]).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                onClick={() => setAssignFilter(key)}
                className={`py-2 border-b-2 -mb-px inline-flex items-center gap-1.5 ${
                  assignFilter === key
                    ? "border-arini text-arini dark:text-gold dark:border-gold font-medium"
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label}
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] ${
                  assignFilter === key ? "bg-arini/10 text-arini dark:text-gold dark:bg-gold/15" : "bg-muted text-muted-foreground"
                }`}>{n}</span>
              </button>
            ))}
          </div>

          {/* Status */}
          <div className="flex gap-1 text-[11px] px-3 py-1.5 border-t bg-muted/20 overflow-x-auto">
            {(["todas", "aberta", "pendente", "adiada", "resolvida"] as StatusFilter[]).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setStatusFilter(s)}
                className={`px-2 py-0.5 rounded-full whitespace-nowrap ${
                  statusFilter === s
                    ? "bg-acao text-acao-foreground"
                    : "hover:bg-muted text-muted-foreground"
                }`}
              >
                {s === "todas" ? "todos status" : CONVERSATION_STATUS_LABELS[s as ConversationStatus]}
              </button>
            ))}
          </div>

          {/* Barra de ações em massa */}
          {modoSelecao && (
            <div className="px-3 py-2 border-t bg-muted/40 flex items-center gap-1.5 flex-wrap">
              <button type="button" onClick={selecionarTodas} className="text-[11px] underline text-muted-foreground hover:text-foreground">
                {selecionadas.size === filtered.length && filtered.length > 0 ? "Limpar" : "Selecionar todas"}
              </button>
              <span className="text-[11px] text-muted-foreground">{selecionadas.size} selecionada(s)</span>
              <div className="ml-auto flex items-center gap-0.5">
                <AcaoMassa titulo="Resolver" disabled={!selecionadas.size} onClick={() => void massaAtualizar({ status: "resolvida", resolvida_em: new Date().toISOString(), resolvida_por: currentUser.id })}>
                  <Check size={14} />
                </AcaoMassa>
                <AcaoMassa titulo="Adiar 3 h" disabled={!selecionadas.size} onClick={() => void massaAtualizar({ status: "adiada", snoozed_until: new Date(Date.now() + 3 * 3600_000).toISOString() })}>
                  <AlarmClock size={14} />
                </AcaoMassa>
                <AcaoMassa titulo="Atribuir agente" disabled={!selecionadas.size} onClick={() => setModalMassa("agente")}>
                  <Users2 size={14} />
                </AcaoMassa>
                <AcaoMassa titulo="Prioridade" disabled={!selecionadas.size} onClick={() => setModalMassa("prioridade")}>
                  <Flag size={14} />
                </AcaoMassa>
                <AcaoMassa titulo="Etiquetar" disabled={!selecionadas.size} onClick={() => setModalMassa("etiqueta")}>
                  <TagIcon size={14} />
                </AcaoMassa>
                <AcaoMassa titulo="Excluir" perigo disabled={!selecionadas.size} onClick={() => setModalMassa("excluir")}>
                  <Trash2 size={14} />
                </AcaoMassa>
              </div>
            </div>
          )}
        </div>

        <div className="flex-1 overflow-y-auto min-h-0">
          <ConversationList
            conversas={filtered}
            selecionadaId={selectedId}
            onSelecionar={setSelectedId}
            agentName={agentName}
            labelColors={labelColors}
            modoSelecao={modoSelecao}
            selecionadas={selecionadas}
            onAlternarSelecao={alternarSelecao}
            modoCaixaCentral={naCaixaCentral}
            nomePorConexao={
              multiplasConexoes
                ? Object.fromEntries(conexoes.map((c) => [c.id, c.nome]))
                : undefined
            }
            vazio={
              naCaixaCentral ? (
                <VazioCaixaCentral
                  filtrando={Boolean(busca.trim()) || filtrosAtivos > 0 || statusFilter !== "todas"}
                  total={conversations.length}
                />
              ) : undefined
            }
          />
        </div>
      </aside>

      {/* ================= Thread ================= */}
      {/* O fundo levemente tingido fica: a bolha RECEBIDA usa `card`, então
          um cartão branco puro aqui faria a mensagem do cliente sumir
          dentro do painel. */}
      <section className="flex-1 min-w-0 flex flex-col bg-muted/20 min-h-0 rounded-2xl border shadow-sm overflow-hidden">
        {!selected ? (
          naCaixaCentral ? (
            <div className="flex-1 flex flex-col items-center justify-center gap-3 px-8 text-center text-sm text-muted-foreground">
              {filtered.length === 0 ? (
                <>
                  <PartyPopper size={40} className="opacity-30" />
                  <p className="font-medium text-foreground">Caixa central vazia.</p>
                  <p className="text-xs max-w-sm">
                    Nada esperando triagem. Assim que um cliente escrever no WhatsApp,
                    Instagram, Messenger ou pelo site, a conversa aparece aqui.
                  </p>
                </>
              ) : (
                <>
                  <InboxIcon size={40} className="opacity-30" />
                  <p>Escolha uma conversa à esquerda para classificar.</p>
                  <p className="text-xs max-w-sm">
                    Comece pelas marcadas em vermelho — são as que já passaram de 15 minutos
                    sem ninguém olhar.
                  </p>
                </>
              )}
            </div>
          ) : (
          <div className="flex-1 flex flex-col items-center justify-center gap-3 text-sm text-muted-foreground">
            <MessageSquareDot size={40} className="opacity-30" />
            <p>Selecione uma conversa à esquerda.</p>
            <p className="text-xs">
              <kbd className="rounded border px-1.5 py-0.5">Ctrl</kbd> +{" "}
              <kbd className="rounded border px-1.5 py-0.5">K</kbd> abre o menu de comando ·{" "}
              <kbd className="rounded border px-1.5 py-0.5">Ctrl</kbd> +{" "}
              <kbd className="rounded border px-1.5 py-0.5">/</kbd> mostra os atalhos
            </p>
          </div>
          )
        ) : (
          <>
            <header className="px-3 py-2 border-b bg-card flex items-center justify-between gap-2 flex-wrap shrink-0">
              <div className="min-w-0">
                <div className="font-semibold text-sm truncate flex items-center gap-1.5">
                  {contactName(selected)}
                  {selected.prioridade && <PrioridadeChip prioridade={selected.prioridade} />}
                  <StatusChip status={selected.status} />
                </div>
                <div className="text-xs text-muted-foreground truncate">
                  {CHANNEL_LABELS[selected.canal]}
                  {selected.contato_telefone ? ` · ${selected.contato_telefone}` : ""}
                  {/* POR QUAL número esta conversa entrou. Antes de responder,
                      é a informação que evita falar pelo número errado — e a
                      resposta sai sempre por este aqui. */}
                  {multiplasConexoes && selected.channel_id && canaisPorId?.[selected.channel_id] && (
                    <span
                      className="ml-1.5 rounded-full border px-1.5 py-0.5 text-[10px] font-medium text-foreground/70"
                      title={
                        canaisPorId[selected.channel_id].telefone
                          ? `Entrou por ${canaisPorId[selected.channel_id].nome} (${canaisPorId[selected.channel_id].telefone}) — a resposta sai por este número`
                          : `Entrou por ${canaisPorId[selected.channel_id].nome} — a resposta sai por esta conexão`
                      }
                    >
                      {canaisPorId[selected.channel_id].nome}
                    </span>
                  )}
                  {selected.status === "adiada" && selected.snoozed_until &&
                    ` · adiada até ${new Date(selected.snoozed_until).toLocaleString("pt-BR")}`}
                  {!selected.triada_em && (
                    <span className="ml-1.5 rounded-full bg-arini/10 text-arini dark:bg-gold/15 dark:text-gold px-1.5 py-0.5 text-[10px] font-medium">
                      na caixa central
                    </span>
                  )}
                  {/* Quem está com este lead, com o cargo junto. O select ao
                      lado some durante a triagem; esta linha não. */}
                  {selected.responsavel_id && (
                    <span className="ml-1.5">
                      · com{" "}
                      <strong className="font-medium text-foreground/80">
                        {responsavelRotulo ?? "atendente removido"}
                      </strong>
                    </span>
                  )}
                </div>
              </div>

              <div className="flex items-center gap-1.5 flex-wrap">
                {/* Assumir: é o que permite cobrir férias sem depender do
                    administrador redistribuir a fila na mão. */}
                {podeAssumir && (
                  <Button type="button" size="sm" variant="default" onClick={() => void assumir()}>
                    <Hand size={14} /> Assumir
                  </Button>
                )}

                <select
                  value={selected.prioridade ?? ""}
                  onChange={(e) => void setPrioridade((e.target.value || null) as ConversationPriority | null)}
                  className="text-xs rounded-md border bg-background px-2 py-1.5"
                  title="Prioridade"
                >
                  <option value="">Sem prioridade</option>
                  {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
                </select>

                {/* Os seletores soltos de equipe/responsável saem de cena
                    quando o painel de triagem está aberto: dois caminhos
                    para a mesma decisão, e só um deles grava o log de
                    transferência e carimba `triada_em`. */}
                {!mostrarTriagem && (
                  <>
                    <select
                      value={selected.team_id ?? ""}
                      onChange={(e) => void assignTeam(e.target.value || null)}
                      className="text-xs rounded-md border bg-background px-2 py-1.5 max-w-[130px]"
                      title="Equipe"
                    >
                      <option value="">Sem equipe</option>
                      {teams.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
                    </select>

                    <select
                      value={selected.responsavel_id ?? ""}
                      onChange={(e) => void assign(e.target.value || null)}
                      className="text-xs rounded-md border bg-background px-2 py-1.5 max-w-[140px]"
                      title="Responsável"
                    >
                      <option value="">Não atribuído</option>
                      {agents.map((a) => (
                        <option key={a.id} value={a.id}>{rotuloAgente(a)}</option>
                      ))}
                    </select>
                  </>
                )}

                <ParticipantsMenu
                  conversationId={selected.id}
                  agents={agents}
                  currentUserId={currentUser.id}
                />

                <button
                  type="button"
                  onClick={() => setCopilotoAberto((v) => !v)}
                  title="Copiloto de IA"
                  className={`p-1.5 rounded-md hover:bg-muted ${
                    copilotoAberto ? "text-arini dark:text-gold" : "text-muted-foreground"
                  }`}
                >
                  <Sparkles size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => { setBuscaThreadAberta((v) => !v); setBuscaThread(""); }}
                  title="Buscar nesta conversa"
                  className={`p-1.5 rounded-md hover:bg-muted ${
                    buscaThreadAberta ? "text-arini dark:text-gold" : "text-muted-foreground"
                  }`}
                >
                  <Search size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => void marcarNaoLida()}
                  title="Marcar como não lida"
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                >
                  <MailOpen size={15} />
                </button>

                <button
                  type="button"
                  onClick={() => notif.setSom(!notif.prefs.som)}
                  title={notif.prefs.som ? "Silenciar avisos" : "Ligar o som dos avisos"}
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                >
                  {notif.prefs.som ? <Volume2 size={15} /> : <VolumeX size={15} />}
                </button>

                <SnoozeMenu onAdiar={(ate) => void adiar(ate)} compacto />

                {selected.status !== "resolvida" ? (
                  <>
                    <Button
                      type="button" size="sm" variant="outline"
                      onClick={() => void mudarStatus(selected.status === "pendente" ? "aberta" : "pendente")}
                      title="Marcar como pendente"
                    >
                      <Clock size={14} />
                    </Button>
                    <Button type="button" size="sm" variant="gold" onClick={() => void mudarStatus("resolvida")} title="Alt + R">
                      <Check size={14} /> Resolver
                    </Button>
                  </>
                ) : (
                  <Button type="button" size="sm" variant="outline" onClick={() => void mudarStatus("aberta")}>
                    <RotateCcw size={14} /> Reabrir
                  </Button>
                )}

                <button
                  type="button"
                  onClick={() => setPainelAberto((v) => !v)}
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted"
                  title={painelAberto ? "Esconder painel do contato" : "Mostrar painel do contato"}
                >
                  {painelAberto ? <PanelRightClose size={16} /> : <PanelRightOpen size={16} />}
                </button>
              </div>
            </header>

            {/* Transferir / retirar / devolver + histórico. Só para o
                administrador e só depois da triagem — antes dela o
                caminho é o painel de triagem lá embaixo. */}
            {ehAdmin && selected.triada_em && (
              <AcoesAdmin
                conversa={selected}
                teams={teams}
                agents={agents}
                membrosPorEquipe={membrosPorEquipe}
                onAtualizada={(c) => { reconciliar(c); void refreshConversations(); }}
                onErro={(texto) => setNotice({ tipo: "erro", texto })}
              />
            )}

            {/* Estado do agent bot — só aparece quando a caixa tem bot. */}
            <BotBadge
              conversation={selected}
              onAssumida={(id) =>
                patchLocal(id, { bot_status: "transferida", bot_transferida_em: new Date().toISOString() })
              }
            />

            {/* Etiquetas */}
            <div className="px-3 py-1.5 border-b bg-card/60 flex items-center gap-1.5 flex-wrap shrink-0">
              {selected.tags.map((t) => (
                <EtiquetaChip
                  key={t}
                  nome={t}
                  cor={labelColors.get(t)}
                  onRemover={() => removeTag(t)}
                />
              ))}
              <input
                list="catalogo-etiquetas"
                value={novaTag}
                onChange={(e) => setNovaTag(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                onBlur={() => novaTag && addTag()}
                placeholder="+ etiqueta"
                className="text-[11px] bg-transparent outline-none w-28 placeholder:text-muted-foreground"
              />
              <datalist id="catalogo-etiquetas">
                {labels.map((l) => <option key={l.id} value={l.nome} />)}
              </datalist>
            </div>

            {/* Busca dentro da thread */}
            {buscaThreadAberta && (
              <div className="px-3 py-2 border-b bg-card flex items-center gap-2 shrink-0">
                <Search size={13} className="text-muted-foreground shrink-0" />
                <input
                  autoFocus
                  value={buscaThread}
                  onChange={(e) => setBuscaThread(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Escape") { setBuscaThreadAberta(false); setBuscaThread(""); } }}
                  placeholder="Buscar nesta conversa…"
                  className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
                />
                <span className="text-[11px] text-muted-foreground shrink-0">
                  {buscaThread.trim() ? `${mensagensFiltradas.length} de ${messages.length}` : `${messages.length} mensagens`}
                </span>
                <button
                  type="button"
                  onClick={() => { setBuscaThreadAberta(false); setBuscaThread(""); }}
                  className="p-1 text-muted-foreground hover:text-foreground"
                  aria-label="Fechar busca"
                >
                  <X size={13} />
                </button>
              </div>
            )}

            {copilotoAberto && (
              <div className="px-3 py-2 border-b bg-card shrink-0">
                <CopilotPanel
                  conversationId={selected.id}
                  onUsarSugestao={(texto) => setTextoSugerido(texto)}
                />
              </div>
            )}

            <MessageThread
              ref={scrollRef}
              mensagens={mensagensFiltradas}
              carregando={loadingMsgs}
              autorNome={agentName}
              onResponder={setRespondendoA}
              termoBusca={buscaThread}
              onApagar={(m) => void apagarMensagem(m)}
            />

            {notice && (
              <div
                className={`px-4 py-2 text-xs border-t flex items-center gap-2 shrink-0 ${
                  notice.tipo === "erro"
                    ? "bg-red-500/10 text-red-700 dark:text-red-300 border-red-500/25"
                    : "bg-sky-500/10 text-sky-700 dark:text-sky-300 border-sky-500/25"
                }`}
              >
                <span className="flex-1">{notice.texto}</span>
                <button type="button" onClick={() => setNotice(null)} aria-label="Fechar aviso"><X size={13} /></button>
              </div>
            )}

            {/* TRIAGEM — fica acima do composer porque, para quem tria,
                é a ação da tela. */}
            {mostrarTriagem && (
              <PainelTriagem
                conversa={selected}
                teams={teams}
                agents={agents}
                membrosPorEquipe={membrosPorEquipe}
                onTriada={triada}
                onErro={(texto) => setNotice({ tipo: "erro", texto })}
              />
            )}

            {/* A recepção NÃO atende: enquanto a conversa está na caixa
                central, ela só classifica. Deixar o composer ali seria
                convidar a responder um cliente que ainda vai mudar de
                mão. O administrador mantém o composer — ele pode as duas
                coisas. */}
            {!(mostrarTriagem && papel === "recepcao") && (
              <Composer
                cannedResponses={cannedResponses}
                macros={macros}
                agents={agents}
                assinatura={currentUser.assinatura}
                respondendoA={respondendoA}
                onCancelarResposta={() => setRespondendoA(null)}
                enviando={sending}
                onEnviar={enviar}
                onAplicarMacro={(id) => void aplicarMacro(id)}
                provedorCanal={
                  selected.channel_id ? (provedorPorCanal?.[selected.channel_id] ?? null) : null
                }
                injetarTexto={textoSugerido}
                onTextoInjetado={() => setTextoSugerido(null)}
              />
            )}
          </>
        )}
      </section>

      {/* ================= Painel de contato ================= */}
      {selected && painelAberto && <ContactPanel conversation={selected} agentName={agentName} />}

      {/* ================= Modais de ação em massa ================= */}
      <Modal
        aberto={modalMassa === "agente"}
        onFechar={() => setModalMassa(null)}
        titulo="Atribuir agente"
        descricao={`${idsSelecionados.length} conversa(s) selecionada(s).`}
      >
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => void massaAtualizar({ responsavel_id: null })}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm text-muted-foreground"
          >
            Remover atribuição
          </button>
          {agents.map((a) => (
            <button
              key={a.id}
              type="button"
              onClick={() => void massaAtualizar({ responsavel_id: a.id })}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm"
            >
              {a.nome}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        aberto={modalMassa === "prioridade"}
        onFechar={() => setModalMassa(null)}
        titulo="Definir prioridade"
        descricao={`${idsSelecionados.length} conversa(s) selecionada(s).`}
      >
        <div className="space-y-1">
          <button
            type="button"
            onClick={() => void massaAtualizar({ prioridade: null })}
            className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm text-muted-foreground"
          >
            Sem prioridade
          </button>
          {PRIORITY_ORDER.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => void massaAtualizar({ prioridade: p })}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm"
            >
              <PrioridadeChip prioridade={p} />
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        aberto={modalMassa === "etiqueta"}
        onFechar={() => setModalMassa(null)}
        titulo="Adicionar etiqueta"
        descricao={`${idsSelecionados.length} conversa(s) selecionada(s).`}
      >
        <div className="space-y-1">
          {labels.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma etiqueta no catálogo. Cadastre em Configurações › Etiquetas.
            </p>
          )}
          {labels.map((l) => (
            <button
              key={l.id}
              type="button"
              onClick={() => void massaEtiquetar(l.nome)}
              className="w-full text-left px-3 py-2 rounded-md hover:bg-muted text-sm flex items-center gap-2"
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.cor }} />
              {l.nome}
            </button>
          ))}
        </div>
      </Modal>

      <Modal
        aberto={modalMassa === "excluir"}
        onFechar={() => setModalMassa(null)}
        titulo="Excluir conversas"
        descricao="As mensagens dessas conversas também serão apagadas. Não dá para desfazer."
        rodape={
          <>
            <Button variant="outline" size="sm" onClick={() => setModalMassa(null)}>Cancelar</Button>
            <Button variant="destructive" size="sm" onClick={() => void massaExcluir()}>
              Excluir {idsSelecionados.length}
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Você está prestes a excluir <strong>{idsSelecionados.length}</strong> conversa(s)
          e todo o histórico de mensagens delas.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Estado vazio da CAIXA CENTRAL. Vazio aqui quer dizer coisas muito
 * diferentes e o usuário não tem como distinguir sozinho:
 *   · não chegou nada (o normal, e é boa notícia);
 *   · chegou, mas o filtro/busca escondeu;
 *   · o sistema não recebeu nada NUNCA — aí o problema é canal
 *     desconectado, não fila vazia, e mandar a pessoa esperar seria
 *     esconder a falha.
 */
function VazioCaixaCentral({ filtrando, total }: { filtrando: boolean; total: number }) {
  if (filtrando) {
    return (
      <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
        <Search size={28} className="opacity-40" />
        <p className="font-medium text-foreground">Nada com esse filtro.</p>
        <p className="text-xs max-w-[15rem]">
          Pode haver conversas esperando triagem fora do filtro atual — limpe a busca e
          os filtros para ver a caixa inteira.
        </p>
      </div>
    );
  }
  return (
    <div className="p-8 text-center text-sm text-muted-foreground flex flex-col items-center gap-2">
      <PartyPopper size={28} className="opacity-40" />
      <p className="font-medium text-foreground">Tudo triado.</p>
      <p className="text-xs max-w-[15rem]">
        {total === 0
          ? "Nenhuma conversa no sistema ainda. Se os clientes já estão escrevendo, confira as conexões em Canais."
          : "Nenhuma conversa esperando classificação. As novas aparecem aqui sozinhas."}
      </p>
    </div>
  );
}

function AcaoMassa({
  children, titulo, onClick, disabled, perigo,
}: {
  children: React.ReactNode; titulo: string; onClick: () => void; disabled?: boolean; perigo?: boolean;
}) {
  return (
    <button
      type="button"
      title={titulo}
      onClick={onClick}
      disabled={disabled}
      className={`p-1.5 rounded-md hover:bg-background disabled:opacity-30 ${
        perigo ? "text-red-600 dark:text-red-400" : "text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function PainelFiltros({
  onFechar, canal, setCanal, prioridade, setPrioridade,
  equipe, setEquipe, etiqueta, setEtiqueta, conexao, setConexao, conexoes,
  teams, labels, onLimpar,
}: {
  onFechar: () => void;
  canal: string; setCanal: (v: string) => void;
  prioridade: string; setPrioridade: (v: string) => void;
  equipe: string; setEquipe: (v: string) => void;
  etiqueta: string; setEtiqueta: (v: string) => void;
  /** Qual CONEXÃO (número/conta), não o tipo de canal. */
  conexao: string; setConexao: (v: string) => void;
  conexoes: { id: string; nome: string; canal: string; telefone: string | null }[];
  teams: AtendimentoTeam[]; labels: AtendimentoLabel[];
  onLimpar: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onFechar]);

  const cls = "w-full rounded-md border bg-background px-2 py-1.5 text-xs";
  return (
    <div ref={ref} className="absolute right-0 top-9 z-40 w-64 rounded-lg border bg-popover shadow-xl p-3 space-y-2.5">
      <label className="block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Canal</span>
        <select value={canal} onChange={(e) => setCanal(e.target.value)} className={cls}>
          <option value="todos">Todos os canais</option>
          {(Object.keys(CHANNEL_LABELS) as (keyof typeof CHANNEL_LABELS)[]).map((k) => (
            <option key={k} value={k}>{CHANNEL_LABELS[k]}</option>
          ))}
        </select>
      </label>
      {/* Só aparece com mais de uma conexão: com um número só, filtrar
          por ele não separa nada. */}
      {conexoes.length > 1 && (
        <label className="block space-y-1">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Número / conexão
          </span>
          <select value={conexao} onChange={(e) => setConexao(e.target.value)} className={cls}>
            <option value="todas">Qualquer</option>
            {conexoes.map((c) => (
              <option key={c.id} value={c.id}>
                {c.telefone ? `${c.nome} · ${c.telefone}` : c.nome}
              </option>
            ))}
          </select>
        </label>
      )}
      <label className="block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Prioridade</span>
        <select value={prioridade} onChange={(e) => setPrioridade(e.target.value)} className={cls}>
          <option value="todas">Qualquer</option>
          <option value="sem">Sem prioridade</option>
          {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{PRIORITY_LABELS[p]}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Equipe</span>
        <select value={equipe} onChange={(e) => setEquipe(e.target.value)} className={cls}>
          <option value="todas">Qualquer</option>
          <option value="sem">Sem equipe</option>
          {teams.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
        </select>
      </label>
      <label className="block space-y-1">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Etiqueta</span>
        <select value={etiqueta} onChange={(e) => setEtiqueta(e.target.value)} className={cls}>
          <option value="todas">Qualquer</option>
          {labels.map((l) => <option key={l.id} value={l.nome}>{l.nome}</option>)}
        </select>
      </label>
      <button type="button" onClick={onLimpar} className="w-full text-xs text-muted-foreground hover:text-foreground underline pt-1">
        Limpar filtros
      </button>
    </div>
  );
}
