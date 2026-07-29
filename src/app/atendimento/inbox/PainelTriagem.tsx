"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Send, AlertTriangle } from "lucide-react";
import type { AgentOption, AtendimentoTeam, Conversation } from "@/lib/types";
import { formatarEspera, minutosEsperando, esperaCritica } from "./espera";

// =====================================================================
// PAINEL DE TRIAGEM — o passo que tira a conversa da caixa central.
//
// Aparece quando a conversa selecionada AINDA NÃO FOI TRIADA
// (`triada_em is null`) e quem está olhando pode triar (recepção ou
// administrador).
//
// DECISÕES DE DESENHO
// -------------------
// · Filas como BOTÕES GRANDES em grade, não como <select>. A recepção faz
//   isso dezenas de vezes por dia: um clique direto no destino é mais
//   rápido e menos sujeito a erro do que abrir uma lista e caçar o item.
// · O atendente é OPCIONAL e só lista membros DAQUELA fila. Sem escolha,
//   a conversa fica na fila sem dono e qualquer membro pode assumir — é
//   assim que se cobre férias sem depender do administrador.
// · A observação é opcional e vira NOTA INTERNA: quem for atender abre a
//   conversa e lê o contexto ali, sem precisar de outro sistema.
// =====================================================================

export function PainelTriagem({
  conversa,
  teams,
  agents,
  membrosPorEquipe,
  onTriada,
  onErro,
}: {
  conversa: Conversation;
  teams: AtendimentoTeam[];
  agents: AgentOption[];
  /** team_id -> profile_id[]. Vem do servidor (a RLS de membros é restrita). */
  membrosPorEquipe: Record<string, string[]>;
  /** Chamado com a conversa já atualizada — o inbox tira ela da lista. */
  onTriada: (conversa: Conversation) => void;
  onErro: (mensagem: string) => void;
}) {
  const [filaId, setFilaId] = useState<string | null>(null);
  const [responsavelId, setResponsavelId] = useState<string>("");
  const [observacao, setObservacao] = useState("");
  const [enviando, setEnviando] = useState(false);

  const minutos = minutosEsperando(conversa);
  const critico = esperaCritica(minutos);

  // Só os membros da fila escolhida. Uma fila sem membros cadastrados
  // devolve lista vazia — e aí o aviso abaixo explica o que fazer, em vez
  // de mostrar um select vazio sem motivo aparente.
  const membros = useMemo(() => {
    if (!filaId) return [];
    const ids = new Set(membrosPorEquipe[filaId] ?? []);
    return agents.filter((a) => ids.has(a.id));
  }, [filaId, membrosPorEquipe, agents]);

  function escolherFila(id: string) {
    setFilaId(id);
    setResponsavelId(""); // o atendente anterior pode não ser da nova fila
  }

  async function atribuir() {
    if (!filaId || enviando) return;
    setEnviando(true);
    try {
      const res = await fetch("/api/atendimento/triagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: conversa.id,
          acao: "triagem",
          teamId: filaId,
          responsavelId: responsavelId || null,
          observacao: observacao.trim() || null,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        conversa?: Conversation;
      };
      if (!res.ok || !json.conversa) {
        onErro(json.error ?? "Não deu para atribuir esta conversa.");
        return;
      }
      // Limpa antes de devolver o controle: o inbox vai selecionar a
      // PRÓXIMA conversa da caixa e o painel remonta com o estado zerado.
      setFilaId(null);
      setResponsavelId("");
      setObservacao("");
      onTriada(json.conversa);
    } catch {
      onErro("Erro de rede ao atribuir a conversa.");
    } finally {
      setEnviando(false);
    }
  }

  const filaEscolhida = teams.find((t) => t.id === filaId) ?? null;

  return (
    <div className="border-t bg-card shrink-0">
      <div className="px-3 py-2 border-b flex items-center gap-2 flex-wrap">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-arini dark:text-gold">
          Triagem
        </span>
        <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
          Escolha a fila e encaminhe. Enquanto isso, ninguém está atendendo.
        </span>
        <span
          className={`text-[11px] rounded-full px-2 py-0.5 font-medium ${
            critico
              ? "bg-red-500/15 text-red-700 dark:text-red-300"
              : "bg-muted text-muted-foreground"
          }`}
          title="Tempo esperando triagem"
        >
          {critico && <AlertTriangle size={10} className="inline mr-1 -mt-px" />}
          esperando {formatarEspera(minutos)}
        </span>
      </div>

      <div className="p-3 space-y-3 max-h-[46vh] overflow-y-auto">
        {teams.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            Nenhuma fila cadastrada. Crie as filas em{" "}
            <strong>Configurações › Equipes</strong> antes de triar.
          </p>
        ) : (
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
              Fila
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              {teams.map((t) => {
                const ativa = t.id === filaId;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => escolherFila(t.id)}
                    title={t.descricao ?? undefined}
                    className={`rounded-lg border px-2.5 py-2 text-left text-[13px] leading-tight transition-colors ${
                      ativa
                        ? "border-arini bg-arini/10 text-arini font-medium dark:border-gold dark:bg-gold/15 dark:text-gold"
                        : "hover:bg-muted text-foreground/90"
                    }`}
                  >
                    {t.nome}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {filaEscolhida && (
          <div className="grid sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Atendente (opcional)
              </span>
              <select
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm"
              >
                <option value="">Deixar na fila (qualquer um assume)</option>
                {membros.map((a) => (
                  <option key={a.id} value={a.id}>{a.nome}</option>
                ))}
              </select>
              <span className="block text-[11px] text-muted-foreground">
                {membros.length === 0
                  ? `Ninguém está na fila "${filaEscolhida.nome}" ainda — cadastre membros em Configurações › Agentes.`
                  : "Sem escolher, a conversa fica disponível para toda a fila."}
              </span>
            </label>

            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Observação (opcional)
              </span>
              <textarea
                value={observacao}
                onChange={(e) => setObservacao(e.target.value)}
                rows={2}
                placeholder="Ex.: cliente já falou com a Ana em janeiro."
                className="w-full rounded-md border bg-background px-2 py-1.5 text-sm resize-y"
              />
              <span className="block text-[11px] text-muted-foreground">
                Vira nota interna — o cliente não vê.
              </span>
            </label>
          </div>
        )}
      </div>

      <div className="px-3 py-2 border-t flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground flex-1 min-w-0 truncate">
          {filaEscolhida ? (
            <>
              Encaminhar para <strong>{filaEscolhida.nome}</strong>
              {responsavelId && (
                <>
                  {" "}
                  <ArrowRight size={11} className="inline -mt-px" />{" "}
                  <strong>{agents.find((a) => a.id === responsavelId)?.nome}</strong>
                </>
              )}
            </>
          ) : (
            "Escolha uma fila acima."
          )}
        </span>
        <Button
          type="button"
          variant="gold"
          size="sm"
          disabled={!filaId || enviando}
          onClick={() => void atribuir()}
        >
          <Send size={14} /> {enviando ? "Atribuindo…" : "Atribuir"}
        </Button>
      </div>
    </div>
  );
}
