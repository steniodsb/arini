"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Alerta, Modal } from "@/components/atendimento/ui";
import { Button } from "@/components/ui/button";
import { Users2, Check } from "lucide-react";
import {
  PAPEL_LABELS, PAPEL_DESCRICAO,
  type AtendimentoPapel, type AtendimentoTeam,
} from "@/lib/types";

// =====================================================================
// AGENTES — acesso, PAPEL e FILAS.
//
// As três colunas respondem perguntas diferentes e nenhuma substitui as
// outras:
//   · ACESSO  — a pessoa entra no sistema de atendimento?
//   · PAPEL   — ela tria, atende ou administra? (eixo da RLS na 0040)
//   · FILAS   — de quais equipes ela participa?
//
// A coluna FILAS não é enfeite: um `atendente` sem nenhuma fila não
// enxerga conversa nenhuma. A tela avisa isso explicitamente na linha,
// senão o suporte recebe "o sistema não mostra nada para o Fulano" e
// ninguém liga a causa ao efeito.
//
// Acesso e papel gravam pela rota /api/atendimento/agentes (que audita).
// As filas gravam direto em `atendimento_team_members` pelo cliente, como
// já faz a tela de Equipes — é vínculo de equipe, não permissão de
// leitura de conversa alheia.
// =====================================================================

type AgentRow = {
  id: string;
  nome: string;
  email: string;
  sector: string;
  is_admin_central: boolean;
  atendimento_access: boolean;
  atendimento_papel: AtendimentoPapel;
};

type Member = { team_id: string; profile_id: string };

export function AgentsManager({
  initial,
  canManage,
  teams,
  initialMembers,
}: {
  initial: AgentRow[];
  canManage: boolean;
  teams: AtendimentoTeam[];
  initialMembers: Member[];
}) {
  const [rows, setRows] = useState(initial);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filasDe, setFilasDe] = useState<AgentRow | null>(null);

  const nomeEquipe = useMemo(() => {
    const m = new Map<string, string>();
    for (const t of teams) m.set(t.id, t.nome);
    return m;
  }, [teams]);

  const filasDoAgente = (id: string) =>
    members.filter((m) => m.profile_id === id).map((m) => m.team_id);

  async function salvar(id: string, corpo: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    const res = await fetch("/api/atendimento/agentes", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ profileId: id, ...corpo }),
    });
    setBusy(null);
    if (!res.ok) {
      const j = (await res.json().catch(() => ({}))) as { error?: string };
      setError(j.error ?? "Falha ao salvar.");
      return false;
    }
    return true;
  }

  async function alternarAcesso(id: string, access: boolean) {
    if (await salvar(id, { access })) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, atendimento_access: access } : r)));
    }
  }

  async function trocarPapel(id: string, papel: AtendimentoPapel) {
    const anterior = rows.find((r) => r.id === id)?.atendimento_papel;
    // Otimista: o select já mostra o novo valor. Se a rota recusar,
    // voltamos — deixar o select "pulando" depois do salvamento é pior.
    setRows((p) => p.map((r) => (r.id === id ? { ...r, atendimento_papel: papel } : r)));
    const ok = await salvar(id, { atendimento_papel: papel });
    if (!ok && anterior) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, atendimento_papel: anterior } : r)));
    }
  }

  async function alternarFila(profileId: string, teamId: string, dentro: boolean) {
    setError(null);
    const supabase = createSupabaseBrowser();
    if (dentro) {
      const { error } = await supabase
        .from("atendimento_team_members")
        .insert({ team_id: teamId, profile_id: profileId });
      if (error) { setError(error.message); return; }
      setMembers((p) => [...p, { team_id: teamId, profile_id: profileId }]);
    } else {
      const { error } = await supabase
        .from("atendimento_team_members")
        .delete()
        .eq("team_id", teamId)
        .eq("profile_id", profileId);
      if (error) { setError(error.message); return; }
      setMembers((p) => p.filter((m) => !(m.team_id === teamId && m.profile_id === profileId)));
    }
  }

  return (
    <div className="space-y-3">
      <Alerta tipo="info">
        <strong>Como o atendimento se organiza:</strong> tudo que chega cai na{" "}
        <strong>caixa central</strong>, que só o administrador e a recepção enxergam.
        <br />
        A <strong>recepção</strong> classifica a conversa numa fila e encaminha; o{" "}
        <strong>atendente</strong> só vê as filas de que participa e o que está atribuído a ele.
        <br />
        O <strong>administrador</strong> vê tudo, transfere e devolve conversas para a caixa
        central.
      </Alerta>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!canManage && (
        <p className="text-xs text-muted-foreground">
          Só a diretoria pode alterar acesso, papel e filas dos agentes.
        </p>
      )}

      <div className="rounded-xl border bg-card divide-y">
        {rows.map((r) => {
          const habilitado = r.atendimento_access || r.is_admin_central;
          const filas = filasDoAgente(r.id);
          // A diretoria é administradora pela regra do banco
          // (`fn_atendimento_papel`), aconteça o que acontecer com a
          // coluna. Mostrar um select editável ali seria mentira.
          const papelEfetivo: AtendimentoPapel = r.is_admin_central
            ? "administrador"
            : r.atendimento_papel;
          const semFilaAtrapalha = habilitado && papelEfetivo === "atendente" && filas.length === 0;

          return (
            <div key={r.id} className="p-3 space-y-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium">{r.nome}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {r.email} · {r.sector}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {r.is_admin_central && (
                    <span className="text-[11px] text-muted-foreground">diretoria (sempre)</span>
                  )}
                  <button
                    type="button"
                    disabled={!canManage || r.is_admin_central || busy === r.id}
                    onClick={() => void alternarAcesso(r.id, !r.atendimento_access)}
                    className={`relative h-6 w-11 rounded-full transition-colors ${habilitado ? "bg-arini" : "bg-muted"} ${(!canManage || r.is_admin_central) ? "opacity-50" : ""}`}
                    title={habilitado ? "Com acesso" : "Sem acesso"}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${habilitado ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-2 gap-2">
                {/* -------- Papel -------- */}
                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Papel no atendimento
                  </span>
                  <select
                    value={papelEfetivo}
                    disabled={!canManage || r.is_admin_central || busy === r.id}
                    onChange={(e) => void trocarPapel(r.id, e.target.value as AtendimentoPapel)}
                    // A descrição também vai no title: quem já sabe o que
                    // é não precisa ler a linha de baixo toda vez.
                    title={PAPEL_DESCRICAO[papelEfetivo]}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                  >
                    {(Object.keys(PAPEL_LABELS) as AtendimentoPapel[]).map((p) => (
                      <option key={p} value={p}>{PAPEL_LABELS[p]}</option>
                    ))}
                  </select>
                  <span className="block text-[11px] text-muted-foreground leading-snug">
                    {PAPEL_DESCRICAO[papelEfetivo]}
                  </span>
                </label>

                {/* -------- Filas -------- */}
                <div className="space-y-1">
                  <span className="block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Filas
                  </span>
                  <button
                    type="button"
                    disabled={!canManage}
                    onClick={() => setFilasDe(r)}
                    className="w-full flex items-center gap-2 rounded-md border bg-background px-2 py-1.5 text-sm text-left hover:bg-muted disabled:opacity-60"
                  >
                    <Users2 size={14} className="shrink-0 text-muted-foreground" />
                    <span className="truncate flex-1">
                      {filas.length === 0
                        ? "Nenhuma fila"
                        : filas.map((id) => nomeEquipe.get(id) ?? "—").join(", ")}
                    </span>
                    <span className="text-[11px] text-muted-foreground shrink-0">alterar</span>
                  </button>
                  <span className="block text-[11px] leading-snug">
                    {semFilaAtrapalha ? (
                      <span className="text-amber-700 dark:text-amber-400">
                        Sem fila, este atendente não enxerga conversa nenhuma.
                      </span>
                    ) : (
                      <span className="text-muted-foreground">
                        As conversas da fila aparecem para todos os membros dela.
                      </span>
                    )}
                  </span>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <Modal
        aberto={filasDe !== null}
        onFechar={() => setFilasDe(null)}
        titulo={filasDe ? `Filas de ${filasDe.nome}` : "Filas"}
        descricao="Marque as equipes de que a pessoa participa. Vale na hora."
        rodape={
          <Button variant="outline" size="sm" onClick={() => setFilasDe(null)}>Fechar</Button>
        }
      >
        {teams.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            Nenhuma equipe cadastrada. Crie as filas em Configurações › Equipes.
          </p>
        ) : (
          <div className="space-y-1">
            {teams.map((t) => {
              const dentro =
                filasDe != null &&
                members.some((m) => m.team_id === t.id && m.profile_id === filasDe.id);
              return (
                <button
                  key={t.id}
                  type="button"
                  disabled={!canManage || !filasDe}
                  onClick={() => filasDe && void alternarFila(filasDe.id, t.id, !dentro)}
                  className="w-full flex items-start gap-2.5 px-3 py-2 rounded-md hover:bg-muted text-left disabled:opacity-60"
                >
                  <span
                    className={`mt-0.5 h-4 w-4 shrink-0 rounded border flex items-center justify-center ${
                      dentro ? "bg-arini border-arini text-white dark:bg-gold dark:border-gold dark:text-arini" : ""
                    }`}
                  >
                    {dentro && <Check size={11} />}
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm">{t.nome}</span>
                    {t.descricao && (
                      <span className="block text-[11px] text-muted-foreground">{t.descricao}</span>
                    )}
                  </span>
                </button>
              );
            })}
          </div>
        )}
      </Modal>
    </div>
  );
}
