"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/atendimento/ui";
import {
  Shield, ChevronDown, ChevronRight, ArrowRightLeft, UserMinus,
  Undo2, History, ArrowRight,
} from "lucide-react";
import {
  ACAO_TRANSFERENCIA_LABELS,
  type AgentOption, type AtendimentoTeam, type Conversation, type Transferencia,
} from "@/lib/types";
import { tempoRelativo } from "./ConversationList";

// =====================================================================
// AÇÕES DO ADMINISTRADOR sobre uma conversa JÁ TRIADA.
//
// Só é renderizado para quem tem papel `administrador` — a RLS deixaria a
// recepção/atendente escrever em algumas dessas colunas, mas a rota de
// triagem recusa por papel. Mostrar um botão que o servidor recusa é pior
// do que não ter o botão: o usuário vê um erro e não entende o modelo.
//
// Vem RECOLHIDO. Transferir e devolver são exceções no dia a dia; ocupar
// a tela com elas empurraria a conversa (o trabalho de verdade) para
// baixo.
// =====================================================================

type Acao = "transferencia" | "retirar" | "devolver_central";

export function AcoesAdmin({
  conversa,
  teams,
  agents,
  membrosPorEquipe,
  onAtualizada,
  onErro,
}: {
  conversa: Conversation;
  teams: AtendimentoTeam[];
  agents: AgentOption[];
  membrosPorEquipe: Record<string, string[]>;
  onAtualizada: (conversa: Conversation) => void;
  onErro: (mensagem: string) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [enviando, setEnviando] = useState<Acao | null>(null);
  const [confirmarDevolucao, setConfirmarDevolucao] = useState(false);

  // Formulário de transferência
  const [filaId, setFilaId] = useState<string>(conversa.team_id ?? "");
  const [responsavelId, setResponsavelId] = useState<string>(conversa.responsavel_id ?? "");
  const [motivo, setMotivo] = useState("");

  // Histórico
  const [historico, setHistorico] = useState<Transferencia[] | null>(null);
  const [historicoAberto, setHistoricoAberto] = useState(false);

  const nomePorId = useMemo(() => {
    const m = new Map<string, string>();
    for (const a of agents) m.set(a.id, a.nome);
    return m;
  }, [agents]);

  const nomeEquipe = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.nome);
    return m;
  }, [teams]);

  // Trocar de conversa tem que zerar o formulário: senão o administrador
  // abre a conversa seguinte com a fila da anterior já preenchida e
  // transfere para o lugar errado achando que confirmou o que via.
  useEffect(() => {
    setFilaId(conversa.team_id ?? "");
    setResponsavelId(conversa.responsavel_id ?? "");
    setMotivo("");
    setHistorico(null);
    setHistoricoAberto(false);
  }, [conversa.id, conversa.team_id, conversa.responsavel_id]);

  const carregarHistorico = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("atendimento_transferencias")
      .select("*")
      .eq("conversation_id", conversa.id)
      .order("created_at", { ascending: false })
      .limit(50);
    setHistorico((data ?? []) as Transferencia[]);
  }, [conversa.id]);

  useEffect(() => {
    if (historicoAberto && historico === null) void carregarHistorico();
  }, [historicoAberto, historico, carregarHistorico]);

  // Atendentes da fila escolhida no formulário. Fora dela o select
  // ofereceria gente que nem enxerga a conversa depois de atribuída.
  const membros = useMemo(() => {
    if (!filaId) return agents;
    const ids = new Set(membrosPorEquipe[filaId] ?? []);
    return agents.filter((a) => ids.has(a.id));
  }, [filaId, membrosPorEquipe, agents]);

  async function executar(acao: Acao, corpo: Record<string, unknown> = {}) {
    setEnviando(acao);
    try {
      const res = await fetch("/api/atendimento/triagem", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversa.id, acao, ...corpo }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        conversa?: Conversation;
      };
      if (!res.ok || !json.conversa) {
        onErro(json.error ?? "Não deu para executar a ação.");
        return;
      }
      setMotivo("");
      // O histórico mudou — força recarga na próxima abertura.
      setHistorico(null);
      onAtualizada(json.conversa);
    } catch {
      onErro("Erro de rede ao executar a ação.");
    } finally {
      setEnviando(null);
    }
  }

  const mudouAlgo =
    (filaId || null) !== (conversa.team_id ?? null) ||
    (responsavelId || null) !== (conversa.responsavel_id ?? null);

  return (
    <div className="border-b bg-amber-500/5 shrink-0">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full px-3 py-1.5 flex items-center gap-2 text-left hover:bg-amber-500/10"
      >
        {aberto ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <Shield size={13} className="text-amber-600 dark:text-amber-400" />
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">
          Administração
        </span>
        <span className="text-[11px] text-muted-foreground truncate flex-1">
          {conversa.team_id ? (nomeEquipe.get(conversa.team_id) ?? "fila removida") : "sem fila"}
          {" · "}
          {conversa.responsavel_id
            ? (nomePorId.get(conversa.responsavel_id) ?? "atendente removido")
            : "sem responsável"}
        </span>
      </button>

      {aberto && (
        <div className="px-3 pb-3 pt-1 space-y-3 border-t border-amber-500/20">
          {/* -------- Transferir -------- */}
          <div className="grid sm:grid-cols-3 gap-2 items-end">
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Fila
              </span>
              <select
                value={filaId}
                onChange={(e) => { setFilaId(e.target.value); setResponsavelId(""); }}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Sem fila</option>
                {teams.map((t) => <option key={t.id} value={t.id}>{t.nome}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Atendente
              </span>
              <select
                value={responsavelId}
                onChange={(e) => setResponsavelId(e.target.value)}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              >
                <option value="">Deixar na fila</option>
                {membros.map((a) => <option key={a.id} value={a.id}>{a.nome}</option>)}
              </select>
            </label>
            <label className="block space-y-1">
              <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                Motivo (opcional)
              </span>
              <input
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                placeholder="Ex.: é assunto de locação"
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs"
              />
            </label>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!mudouAlgo || enviando !== null}
              onClick={() =>
                void executar("transferencia", {
                  teamId: filaId || null,
                  responsavelId: responsavelId || null,
                  observacao: motivo.trim() || null,
                })
              }
            >
              <ArrowRightLeft size={13} />
              {enviando === "transferencia" ? "Transferindo…" : "Transferir"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={!conversa.responsavel_id || enviando !== null}
              title="Tira o responsável e devolve a conversa para a fila"
              onClick={() => void executar("retirar", { observacao: motivo.trim() || null })}
            >
              <UserMinus size={13} />
              {enviando === "retirar" ? "Retirando…" : "Retirar do atendente"}
            </Button>

            <Button
              type="button"
              size="sm"
              variant="destructive"
              disabled={enviando !== null}
              onClick={() => setConfirmarDevolucao(true)}
            >
              <Undo2 size={13} /> Devolver à caixa central
            </Button>

            <button
              type="button"
              onClick={() => setHistoricoAberto((v) => !v)}
              className="ml-auto inline-flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground"
            >
              <History size={12} />
              {historicoAberto ? "Ocultar histórico" : "Histórico"}
            </button>
          </div>

          {/* -------- Histórico -------- */}
          {historicoAberto && (
            <div className="rounded-lg border bg-card divide-y max-h-48 overflow-y-auto">
              {historico === null && (
                <p className="p-2.5 text-[11px] text-muted-foreground">Carregando…</p>
              )}
              {historico?.length === 0 && (
                <p className="p-2.5 text-[11px] text-muted-foreground">
                  Nada registrado ainda. A primeira linha aparece quando a conversa for triada.
                </p>
              )}
              {historico?.map((t) => (
                <LinhaHistorico
                  key={t.id}
                  t={t}
                  nomePorId={nomePorId}
                  nomeEquipe={nomeEquipe}
                />
              ))}
            </div>
          )}
        </div>
      )}

      <Modal
        aberto={confirmarDevolucao}
        onFechar={() => setConfirmarDevolucao(false)}
        titulo="Devolver à caixa central"
        descricao="A conversa volta para o começo do fluxo."
        rodape={
          <>
            <Button variant="outline" size="sm" onClick={() => setConfirmarDevolucao(false)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              size="sm"
              disabled={enviando !== null}
              onClick={() => {
                setConfirmarDevolucao(false);
                void executar("devolver_central", { observacao: motivo.trim() || null });
              }}
            >
              Devolver
            </Button>
          </>
        }
      >
        <p className="text-sm">
          A fila e o responsável serão <strong>apagados</strong> e a conversa volta para a
          caixa central, esperando triagem de novo.
        </p>
        <p className="text-xs text-muted-foreground">
          Quem atendia deixa de enxergar a conversa na hora. Use quando a classificação
          estiver errada e ninguém souber para onde mandar — para trocar de fila, prefira{" "}
          <strong>Transferir</strong>.
        </p>
      </Modal>
    </div>
  );
}

/**
 * `tempoRelativo` devolve "ontem" e "12/03" — "há ontem" não existe em
 * português. Então o "há" só entra quando a peça é uma duração.
 */
function quandoFoi(iso: string): string {
  const rel = tempoRelativo(iso);
  if (rel === "agora") return "agora";
  if (rel === "ontem") return "ontem";
  if (/^\d+ (min|h|d)$/.test(rel)) return `há ${rel}`;
  return `em ${rel}`;
}

/** "Recepção Demo triou para Venda Urbana · há 2 h" */
function LinhaHistorico({
  t, nomePorId, nomeEquipe,
}: {
  t: Transferencia;
  nomePorId: Map<string, string>;
  nomeEquipe: Map<string, string>;
}) {
  const autor = t.feito_por ? (nomePorId.get(t.feito_por) ?? "Alguém") : "Sistema";
  const de = t.de_equipe ? nomeEquipe.get(t.de_equipe) : null;
  const para = t.para_equipe ? nomeEquipe.get(t.para_equipe) : null;
  const paraAgente = t.para_agente ? nomePorId.get(t.para_agente) : null;
  const deAgente = t.de_agente ? nomePorId.get(t.de_agente) : null;

  // Cada ação lê melhor com uma frase própria — um template genérico
  // ("mudou de X para Y") vira ruído justamente quando o campo é nulo.
  // O rótulo do tipo é só o fallback (ação nova no banco, tela antiga).
  let frase: string = ACAO_TRANSFERENCIA_LABELS[t.acao] ?? t.acao;
  switch (t.acao) {
    case "triagem":
      frase = `triou para ${para ?? "uma fila"}${paraAgente ? ` › ${paraAgente}` : " (sem responsável)"}`;
      break;
    case "transferencia":
      frase = `transferiu${de ? ` de ${de}` : ""} para ${para ?? "sem fila"}${paraAgente ? ` › ${paraAgente}` : ""}`;
      break;
    case "assumir":
      frase = `assumiu a conversa${para ? ` na fila ${para}` : ""}`;
      break;
    case "devolver":
      frase = t.para_equipe
        ? `retirou ${deAgente ?? "o atendente"} — a conversa voltou para a fila ${para}`
        : "devolveu à caixa central";
      break;
  }

  return (
    <div className="px-2.5 py-1.5">
      <div className="text-[11px] leading-snug">
        <ArrowRight size={10} className="inline -mt-px mr-1 text-muted-foreground" />
        <strong>{autor}</strong> {frase}{" "}
        <span className="text-muted-foreground">· {quandoFoi(t.created_at)}</span>
      </div>
      {t.motivo && (
        <div className="text-[11px] text-muted-foreground italic pl-4 truncate" title={t.motivo}>
          “{t.motivo}”
        </div>
      )}
    </div>
  );
}
