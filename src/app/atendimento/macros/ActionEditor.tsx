"use client";

import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import {
  MACRO_ACTION_LABELS,
  CONVERSATION_STATUS_LABELS,
  PRIORITY_LABELS,
  type MacroAction,
  type MacroActionType,
  type ConversationStatus,
  type ConversationPriority,
  type AgentOption,
  type AtendimentoTeam,
  type AtendimentoLabel,
} from "@/lib/types";
import { SelectInput, TextArea, TextInput } from "@/components/atendimento/ui";
import { Button } from "@/components/ui/button";

// =====================================================================
// Editor de SEQUÊNCIA DE AÇÕES — compartilhado por Macros ("o que o
// agente dispara em 1 clique") e por Regras de automação ("então faça").
// Os dois lugares gravam exatamente o mesmo formato (MacroAction[]) no
// jsonb, então manter um editor só evita divergência entre as telas.
// =====================================================================

/** Catálogos que alimentam os selects de valor de cada tipo de ação. */
export interface CatalogosAcao {
  agentes: AgentOption[];
  equipes: AtendimentoTeam[];
  etiquetas: AtendimentoLabel[];
}

const TIPOS_ACAO = Object.keys(MACRO_ACTION_LABELS) as MacroActionType[];

/** Ação em branco — o tipo mais comum abre já selecionado. */
export function novaAcao(): MacroAction {
  return { tipo: "enviar_mensagem", valor: "" };
}

/** Tipos cujo valor é texto livre (renderizam textarea). */
function ehTextoLivre(tipo: MacroActionType): boolean {
  return tipo === "enviar_mensagem" || tipo === "adicionar_nota";
}

// Verbos curtos para o resumo da macro na listagem — "Resolver" lê melhor
// que "Mudar o status para Resolvida".
const VERBO_STATUS: Record<ConversationStatus, string> = {
  aberta: "Reabrir",
  pendente: "Marcar como pendente",
  resolvida: "Resolver",
  adiada: "Adiar",
};

/**
 * Resumo legível de uma sequência de ações.
 * Ex.: "Enviar mensagem → Etiquetar 'atendido' → Resolver".
 */
export function resumoAcoes(acoes: MacroAction[], catalogos?: Partial<CatalogosAcao>): string {
  if (acoes.length === 0) return "Nenhuma ação";
  return acoes.map((a) => resumoAcao(a, catalogos)).join(" → ");
}

function resumoAcao(acao: MacroAction, catalogos?: Partial<CatalogosAcao>): string {
  const { tipo, valor } = acao;
  switch (tipo) {
    case "atribuir_agente": {
      const nome = catalogos?.agentes?.find((a) => a.id === valor)?.nome;
      return `Atribuir a ${nome ?? "agente"}`;
    }
    case "atribuir_equipe": {
      const nome = catalogos?.equipes?.find((e) => e.id === valor)?.nome;
      return `Atribuir à equipe ${nome ?? "—"}`;
    }
    case "mudar_status":
      return VERBO_STATUS[valor as ConversationStatus] ?? "Mudar o status";
    case "mudar_prioridade":
      return `Prioridade ${PRIORITY_LABELS[valor as ConversationPriority] ?? valor}`;
    case "adicionar_etiqueta":
      return `Etiquetar "${valor}"`;
    case "remover_etiqueta":
      return `Remover etiqueta "${valor}"`;
    case "enviar_mensagem":
      return "Enviar mensagem";
    case "adicionar_nota":
      return "Adicionar nota interna";
    default:
      return MACRO_ACTION_LABELS[tipo] ?? tipo;
  }
}

/**
 * Valida a lista de ações. Retorna a mensagem de erro ou null se estiver ok.
 * Regra: pelo menos uma ação e nenhuma ação sem valor.
 */
export function validarAcoes(acoes: MacroAction[]): string | null {
  if (acoes.length === 0) return "Adicione pelo menos uma ação.";
  const vazia = acoes.findIndex((a) => !a.valor.trim());
  if (vazia >= 0) {
    return `A ação ${vazia + 1} ("${MACRO_ACTION_LABELS[acoes[vazia].tipo]}") está sem valor.`;
  }
  return null;
}

/** Editor com linhas ordenadas: tipo + valor, remover e reordenar com ↑/↓. */
export function ActionEditor({
  acoes,
  onChange,
  catalogos,
  idDatalist = "catalogo-etiquetas",
}: {
  acoes: MacroAction[];
  onChange: (acoes: MacroAction[]) => void;
  catalogos: CatalogosAcao;
  /** Id do datalist de etiquetas — único por tela para não colidir no DOM. */
  idDatalist?: string;
}) {
  function atualizar(index: number, patch: Partial<MacroAction>) {
    onChange(acoes.map((a, i) => (i === index ? { ...a, ...patch } : a)));
  }
  function trocarTipo(index: number, tipo: MacroActionType) {
    // O valor antigo não faz sentido no novo tipo (id de agente vs. texto),
    // então zera para o usuário escolher de novo.
    atualizar(index, { tipo, valor: "" });
  }
  function remover(index: number) {
    onChange(acoes.filter((_, i) => i !== index));
  }
  function mover(index: number, delta: number) {
    const destino = index + delta;
    if (destino < 0 || destino >= acoes.length) return;
    const copia = [...acoes];
    [copia[index], copia[destino]] = [copia[destino], copia[index]];
    onChange(copia);
  }

  return (
    <div className="space-y-2">
      {/* Sugestões do catálogo de etiquetas — o campo continua livre para
          o usuário digitar uma etiqueta nova que ainda não existe. */}
      <datalist id={idDatalist}>
        {catalogos.etiquetas.map((e) => (
          <option key={e.id} value={e.nome} />
        ))}
      </datalist>

      {acoes.length === 0 && (
        <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
          Nenhuma ação ainda. Adicione a primeira abaixo.
        </p>
      )}

      {acoes.map((acao, i) => (
        <div key={i} className="rounded-lg border bg-muted/30 p-2.5 space-y-2">
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-medium text-muted-foreground w-5 shrink-0">{i + 1}.</span>
            <SelectInput
              value={acao.tipo}
              onChange={(e) => trocarTipo(i, e.target.value as MacroActionType)}
              className="flex-1"
              aria-label={`Tipo da ação ${i + 1}`}
            >
              {TIPOS_ACAO.map((t) => (
                <option key={t} value={t}>
                  {MACRO_ACTION_LABELS[t]}
                </option>
              ))}
            </SelectInput>
            <div className="flex items-center gap-0.5 shrink-0">
              <button
                type="button"
                onClick={() => mover(i, -1)}
                disabled={i === 0}
                className="p-1.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                title="Mover para cima"
                aria-label={`Mover ação ${i + 1} para cima`}
              >
                <ArrowUp size={14} />
              </button>
              <button
                type="button"
                onClick={() => mover(i, 1)}
                disabled={i === acoes.length - 1}
                className="p-1.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                title="Mover para baixo"
                aria-label={`Mover ação ${i + 1} para baixo`}
              >
                <ArrowDown size={14} />
              </button>
              <button
                type="button"
                onClick={() => remover(i)}
                className="p-1.5 rounded text-muted-foreground hover:text-red-600"
                title="Remover ação"
                aria-label={`Remover ação ${i + 1}`}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>

          <div className="pl-7">
            <ValorAcao
              acao={acao}
              catalogos={catalogos}
              idDatalist={idDatalist}
              onChange={(valor) => atualizar(i, { valor })}
            />
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...acoes, novaAcao()])}
      >
        <Plus size={14} /> Adicionar ação
      </Button>
    </div>
  );
}

/** Campo de valor — muda de acordo com o tipo da ação. */
function ValorAcao({
  acao,
  catalogos,
  idDatalist,
  onChange,
}: {
  acao: MacroAction;
  catalogos: CatalogosAcao;
  idDatalist: string;
  onChange: (valor: string) => void;
}) {
  const { tipo, valor } = acao;

  if (ehTextoLivre(tipo)) {
    return (
      <TextArea
        rows={3}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder={
          tipo === "enviar_mensagem"
            ? "Mensagem que o cliente vai receber…"
            : "Nota interna (só a equipe vê)…"
        }
      />
    );
  }

  if (tipo === "adicionar_etiqueta" || tipo === "remover_etiqueta") {
    return (
      <TextInput
        list={idDatalist}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Escolha do catálogo ou digite uma etiqueta nova"
      />
    );
  }

  const opcoes: { valor: string; label: string }[] =
    tipo === "atribuir_agente"
      ? catalogos.agentes.map((a) => ({ valor: a.id, label: a.nome }))
      : tipo === "atribuir_equipe"
        ? catalogos.equipes.map((e) => ({ valor: e.id, label: e.nome }))
        : tipo === "mudar_status"
          ? (Object.keys(CONVERSATION_STATUS_LABELS) as ConversationStatus[]).map((s) => ({
              valor: s,
              label: CONVERSATION_STATUS_LABELS[s],
            }))
          : (Object.keys(PRIORITY_LABELS) as ConversationPriority[]).map((p) => ({
              valor: p,
              label: PRIORITY_LABELS[p],
            }));

  return (
    <SelectInput value={valor} onChange={(e) => onChange(e.target.value)}>
      <option value="">Selecione…</option>
      {opcoes.map((o) => (
        <option key={o.valor} value={o.valor}>
          {o.label}
        </option>
      ))}
    </SelectInput>
  );
}
