import {
  AlarmClock, AlertTriangle, Bot, Check, ChevronDown, ChevronUp,
  ChevronsUp, Clock, Equal, Tag,
} from "lucide-react";
import {
  PRIORITY_CLASSES, PRIORITY_DOT, PRIORITY_LABELS,
  STATUS_CLASSES, STATUS_DOT, CONVERSATION_STATUS_LABELS,
  type ConversationPriority, type ConversationStatus,
} from "@/lib/types";

// =====================================================================
// Chips do atendimento — etiqueta, prioridade, status e flags.
//
// Existiam espalhados: cada tela montava o seu `<span>` com as classes na
// mão, e o mesmo "Urgente" aparecia de três jeitos diferentes. Cor que
// muda de tela para tela deixa de ser informação e vira decoração.
//
// Duas regras que valem para todos os chips daqui:
//
// 1. COR NUNCA VIAJA SOZINHA. Cada chip tem ícone ou texto junto —
//    ~8% dos homens têm alguma deficiência de visão de cores, e
//    "vermelho = urgente" não chega neles. O ícone é redundância
//    proposital, não enfeite.
//
// 2. A ETIQUETA usa a cor escolhida pelo usuário, que pode ser qualquer
//    hex. Por isso ela não usa classe do Tailwind: o fundo sai da própria
//    cor com opacidade baixa, e o texto, da cor cheia — assim funciona
//    tanto no tema claro quanto no escuro sem precisar de duas versões.
// =====================================================================

const BASE = "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none";

const PRIORITY_ICON: Record<ConversationPriority, typeof ChevronsUp> = {
  urgente: ChevronsUp,
  alta: ChevronUp,
  media: Equal,
  baixa: ChevronDown,
};

const STATUS_ICON: Record<ConversationStatus, typeof Check> = {
  aberta: Clock,
  pendente: Clock,
  resolvida: Check,
  adiada: AlarmClock,
};

export function PrioridadeChip({
  prioridade,
  compacto = false,
}: {
  prioridade: ConversationPriority;
  /** Só a bolinha, para listas densas. */
  compacto?: boolean;
}) {
  const Icone = PRIORITY_ICON[prioridade];
  if (compacto) {
    return (
      <span
        title={`Prioridade ${PRIORITY_LABELS[prioridade].toLowerCase()}`}
        className={`h-2 w-2 rounded-full shrink-0 ${PRIORITY_DOT[prioridade]}`}
      />
    );
  }
  return (
    <span className={`${BASE} ${PRIORITY_CLASSES[prioridade]}`}>
      <Icone size={10} />
      {PRIORITY_LABELS[prioridade]}
    </span>
  );
}

export function StatusChip({
  status,
  compacto = false,
}: {
  status: ConversationStatus;
  compacto?: boolean;
}) {
  const Icone = STATUS_ICON[status];
  if (compacto) {
    return (
      <span
        title={CONVERSATION_STATUS_LABELS[status]}
        className={`h-2 w-2 rounded-full shrink-0 ${STATUS_DOT[status]}`}
      />
    );
  }
  return (
    <span className={`${BASE} ${STATUS_CLASSES[status]}`}>
      <Icone size={10} />
      {CONVERSATION_STATUS_LABELS[status]}
    </span>
  );
}

/**
 * Etiqueta com a cor cadastrada. Sem cor definida, cai num cinza neutro —
 * nunca na cor de ação, que significa outra coisa na tela.
 */
export function EtiquetaChip({
  nome,
  cor,
  comIcone = false,
  onRemover,
}: {
  nome: string;
  cor?: string | null;
  comIcone?: boolean;
  onRemover?: () => void;
}) {
  const estilo = cor
    ? { backgroundColor: `${cor}1f`, color: cor, borderColor: `${cor}59` }
    : undefined;
  return (
    <span
      className={`${BASE} ${cor ? "" : "bg-muted text-muted-foreground border-border"}`}
      style={estilo}
    >
      {comIcone ? (
        <Tag size={9} />
      ) : (
        <span
          className="h-1.5 w-1.5 rounded-full shrink-0"
          style={cor ? { backgroundColor: cor } : undefined}
        />
      )}
      {nome}
      {onRemover && (
        <button
          type="button"
          onClick={onRemover}
          title={`Remover ${nome}`}
          className="ml-0.5 opacity-60 hover:opacity-100"
        >
          ×
        </button>
      )}
    </span>
  );
}

/**
 * Sinalizadores de exceção: SLA estourado, bot conduzindo, conversa
 * adiada. São vermelhos/âmbares de propósito — quem varre a lista com o
 * olho precisa achar estes antes de ler qualquer nome.
 */
export function FlagChip({
  tipo,
  titulo,
  children,
}: {
  tipo: "alerta" | "atencao" | "info" | "neutro";
  titulo?: string;
  children: React.ReactNode;
}) {
  const cls = {
    alerta: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/30",
    atencao: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    info: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
    neutro: "bg-muted text-muted-foreground border-border",
  }[tipo];
  return (
    <span className={`${BASE} ${cls}`} title={titulo}>
      {children}
    </span>
  );
}

export function SlaChip({ titulo = "SLA violado" }: { titulo?: string }) {
  return (
    <FlagChip tipo="alerta" titulo={titulo}>
      <AlertTriangle size={10} /> SLA
    </FlagChip>
  );
}

export function BotChip({ titulo = "Bot conduzindo a conversa" }: { titulo?: string }) {
  return (
    <FlagChip tipo="info" titulo={titulo}>
      <Bot size={10} /> Bot
    </FlagChip>
  );
}
