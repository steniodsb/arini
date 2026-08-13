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
// AGENTES — acesso, CARGO, PAPEL e FILAS.
//
// As quatro colunas respondem perguntas diferentes e nenhuma substitui as
// outras:
//   · ACESSO  — a pessoa entra no sistema de atendimento?
//   · CARGO   — como ela se identifica para o time (0043). É rótulo, não
//               permissão: "Corretora", "Gerente de Locação". Aparece ao
//               lado do nome no seletor de responsável, na triagem e no
//               histórico de quem assumiu o quê.
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
  cargo: string | null;
  is_admin_central: boolean;
  atendimento_access: boolean;
  atendimento_papel: AtendimentoPapel;
};

/** Mesmo limite da rota — a tela avisa antes de o servidor recusar. */
const CARGO_MAX = 40;

/**
 * Sugestões de cargo. Não é um enum: imobiliária inventa função nova toda
 * hora, e travar a lista só faria alguém escrever "Corretor" no campo
 * errado. É `datalist` — sugere sem impedir.
 */
const CARGOS_SUGERIDOS = [
  "Corretor", "Corretora", "Captador", "Captadora",
  "Recepcionista", "Gerente de Locação", "Gerente de Vendas",
  "Marketing", "Financeiro", "Jurídico", "Administrativo", "Diretoria",
];

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
  // O que está sendo digitado no campo de cargo, por agente. Some no blur:
  // aí a fonte da verdade volta a ser a linha (que já foi gravada, ou
  // revertida se o servidor recusou).
  const [rascunhoCargo, setRascunhoCargo] = useState<Record<string, string>>({});

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

  /**
   * Grava o cargo no blur (e no Enter), não a cada tecla: seriam dez POSTs
   * e dez linhas de auditoria para escrever "Corretora". Sai cedo quando
   * nada mudou, senão trocar de campo já geraria log.
   */
  async function salvarCargo(id: string, valor: string) {
    const limpo = valor.trim().slice(0, CARGO_MAX);
    const atual = rows.find((r) => r.id === id)?.cargo ?? null;
    const novo = limpo || null;
    if (novo === atual) return;

    setRows((p) => p.map((r) => (r.id === id ? { ...r, cargo: novo } : r)));
    const ok = await salvar(id, { cargo: novo });
    if (!ok) {
      setRows((p) => p.map((r) => (r.id === id ? { ...r, cargo: atual } : r)));
    }
  }

  function largarCargo(id: string) {
    setRascunhoCargo((p) => {
      if (!(id in p)) return p;
      const resto: Record<string, string> = {};
      for (const chave of Object.keys(p)) if (chave !== id) resto[chave] = p[chave];
      return resto;
    });
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
      {/* Uma lista só para a tela inteira — cada linha aponta para ela. */}
      <datalist id="cargos-sugeridos">
        {CARGOS_SUGERIDOS.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>

      <Alerta tipo="info">
        <strong>Como o atendimento se organiza:</strong> tudo que chega cai na{" "}
        <strong>caixa central</strong>, que só o administrador e a recepção enxergam.
        <br />
        A <strong>recepção</strong> classifica a conversa numa fila e encaminha; o{" "}
        <strong>atendente</strong> só vê as filas de que participa e o que está atribuído a ele.
        <br />
        O <strong>administrador</strong> vê tudo, transfere e devolve conversas para a caixa
        central.
        <br />
        O <strong>cargo</strong> não muda permissão nenhuma — é só como a pessoa se
        identifica para o time quando assume um lead.
      </Alerta>

      {error && <p className="text-sm text-red-600">{error}</p>}
      {!canManage && (
        <p className="text-xs text-muted-foreground">
          Só a diretoria pode alterar acesso, cargo, papel e filas dos agentes.
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
                  <div className="text-sm font-medium flex items-center gap-1.5 flex-wrap">
                    {r.nome}
                    {r.cargo && (
                      <span className="rounded-full border px-1.5 py-px text-[10px] font-normal text-muted-foreground">
                        {r.cargo}
                      </span>
                    )}
                  </div>
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
                    className={`relative h-6 w-11 rounded-full transition-colors ${habilitado ? "bg-acao" : "bg-muted"} ${(!canManage || r.is_admin_central) ? "opacity-50" : ""}`}
                    title={habilitado ? "Com acesso" : "Sem acesso"}
                  >
                    <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white transition-all ${habilitado ? "left-[22px]" : "left-0.5"}`} />
                  </button>
                </div>
              </div>

              <div className="grid sm:grid-cols-3 gap-2">
                {/* -------- Cargo -------- */}
                <label className="block space-y-1">
                  <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    Cargo
                  </span>
                  <input
                    value={rascunhoCargo[r.id] ?? r.cargo ?? ""}
                    disabled={!canManage || busy === r.id}
                    maxLength={CARGO_MAX}
                    list="cargos-sugeridos"
                    placeholder="Ex.: Corretora"
                    onChange={(e) =>
                      setRascunhoCargo((p) => ({ ...p, [r.id]: e.target.value }))
                    }
                    onBlur={(e) => {
                      const valor = e.target.value;
                      largarCargo(r.id);
                      void salvarCargo(r.id, valor);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") e.currentTarget.blur();
                      // Esc desiste da edição sem gravar.
                      if (e.key === "Escape") {
                        largarCargo(r.id);
                        e.currentTarget.blur();
                      }
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1.5 text-sm disabled:opacity-60"
                  />
                  <span className="block text-[11px] text-muted-foreground leading-snug">
                    Aparece ao lado do nome quando esta pessoa assume um lead.
                  </span>
                </label>

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
                      dentro ? "bg-acao border-acao text-acao-foreground" : ""
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
