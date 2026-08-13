"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Alerta, Card, Field, Modal, TextArea, TextInput,
} from "@/components/atendimento/ui";
import { errMessage } from "@/lib/utils";
import { rotuloAgente, type AtendimentoTeam, type AgentOption } from "@/lib/types";
import {
  AlertTriangle, Check, Loader2, MessageSquare, Pencil, Plus, Trash2, UserPlus, Users,
} from "lucide-react";

// =====================================================================
// FILAS (a tabela se chama `atendimento_teams`; o resto do sistema, e o
// time, chama de fila — a tela usa a palavra que eles usam).
//
// A fila decide DUAS coisas, e é por isso que ela não é um cadastro
// qualquer:
//   1. QUEM ENXERGA — atendente só vê conversa das filas dele. Fila sem
//      membro é um buraco: a recepção encaminha e ninguém recebe.
//   2. PARA ONDE VAI — é o destino da triagem e das automações.
//
// Por isso a tela mostra, em cima de tudo, os dois estados que quebram a
// operação sem avisar: fila sem ninguém dentro e agente fora de todas as
// filas (esse não vê conversa nenhuma e conclui que o sistema quebrou).
// =====================================================================

type Member = { team_id: string; profile_id: string };
type Contagem = { total: number; abertas: number };

export function TeamsManager({
  initialTeams,
  agents,
  initialMembers,
  conversasPorFila = {},
}: {
  initialTeams: AtendimentoTeam[];
  agents: AgentOption[];
  initialMembers: Member[];
  /** team_id -> conversas ligadas àquela fila (para o impacto da exclusão). */
  conversasPorFila?: Record<string, Contagem>;
}) {
  const router = useRouter();
  const [teams, setTeams] = useState(initialTeams);
  const [members, setMembers] = useState<Member[]>(initialMembers);
  const [selected, setSelected] = useState<string | null>(initialTeams[0]?.id ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  // Criação / edição
  const [form, setForm] = useState<{ id: string | null; nome: string; descricao: string } | null>(null);
  // Exclusão
  const [excluindo, setExcluindo] = useState<AtendimentoTeam | null>(null);
  const [moverConversas, setMoverConversas] = useState(false);

  const supabase = () => createSupabaseBrowser();

  const membrosDa = useMemo(() => {
    const m: Record<string, string[]> = {};
    for (const x of members) (m[x.team_id] ??= []).push(x.profile_id);
    return m;
  }, [members]);

  /** Quem não está em fila alguma — o erro mais provável do primeiro dia. */
  const semFila = useMemo(
    () => agents.filter((a) => !members.some((m) => m.profile_id === a.id)),
    [agents, members],
  );

  const sel = teams.find((t) => t.id === selected) ?? null;
  const isMember = (pid: string) => sel != null && (membrosDa[sel.id] ?? []).includes(pid);

  async function salvarFila() {
    if (!form || !form.nome.trim()) return;
    setOcupado(true);
    setErro(null);
    const payload = { nome: form.nome.trim(), descricao: form.descricao.trim() || null };

    if (form.id) {
      const { error } = await supabase()
        .from("atendimento_teams")
        .update(payload)
        .eq("id", form.id);
      setOcupado(false);
      if (error) { setErro(errMessage(error)); return; }
      setTeams((p) => p.map((t) => (t.id === form.id ? { ...t, ...payload } : t)));
    } else {
      const { data, error } = await supabase()
        .from("atendimento_teams")
        .insert(payload)
        .select("*")
        .single();
      setOcupado(false);
      if (error) { setErro(errMessage(error)); return; }
      const nova = data as AtendimentoTeam;
      setTeams((p) => [...p, nova].sort((a, b) => a.nome.localeCompare(b.nome)));
      setSelected(nova.id);
    }
    setForm(null);
    router.refresh();
  }

  /**
   * Excluir fila com conversas ligadas falharia na FK (o banco recusa) e
   * o agente veria um erro cru de Postgres. Aqui a conversa é devolvida à
   * caixa central primeiro — decisão explícita, com o número na frente.
   */
  async function excluirFila() {
    if (!excluindo) return;
    const cont = conversasPorFila[excluindo.id];
    setOcupado(true);
    setErro(null);

    if (cont?.total && moverConversas) {
      const { error } = await supabase()
        .from("conversations")
        .update({ team_id: null })
        .eq("team_id", excluindo.id);
      if (error) { setOcupado(false); setErro(errMessage(error)); return; }
    }

    const { error } = await supabase().from("atendimento_teams").delete().eq("id", excluindo.id);
    setOcupado(false);
    if (error) { setErro(errMessage(error)); return; }

    setTeams((p) => p.filter((t) => t.id !== excluindo.id));
    setMembers((p) => p.filter((m) => m.team_id !== excluindo.id));
    if (selected === excluindo.id) setSelected(null);
    setExcluindo(null);
    setMoverConversas(false);
    router.refresh();
  }

  async function alternarMembro(teamId: string, profileId: string, entrar: boolean) {
    setErro(null);
    // Otimista: o checkbox responde na hora e volta atrás se o banco recusar.
    setMembers((p) =>
      entrar
        ? [...p, { team_id: teamId, profile_id: profileId }]
        : p.filter((m) => !(m.team_id === teamId && m.profile_id === profileId)),
    );
    const q = entrar
      ? supabase().from("atendimento_team_members").insert({ team_id: teamId, profile_id: profileId })
      : supabase().from("atendimento_team_members").delete().eq("team_id", teamId).eq("profile_id", profileId);
    const { error } = await q;
    if (error) {
      setErro(errMessage(error));
      setMembers((p) =>
        entrar
          ? p.filter((m) => !(m.team_id === teamId && m.profile_id === profileId))
          : [...p, { team_id: teamId, profile_id: profileId }],
      );
      return;
    }
    router.refresh();
  }

  const filasVazias = teams.filter((t) => (membrosDa[t.id] ?? []).length === 0);

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl text-arini dark:text-gold">Filas de atendimento</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            A fila decide quem <strong>enxerga</strong> a conversa e para onde a triagem
            <strong> encaminha</strong>. Atendente fora de fila não vê conversa nenhuma.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => { setErro(null); setForm({ id: null, nome: "", descricao: "" }); }}
        >
          <Plus size={15} /> Nova fila
        </Button>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* Os dois estados que quebram a operação em silêncio. */}
      {semFila.length > 0 && (
        <Alerta tipo="atencao">
          <strong>{semFila.length} pessoa(s) fora de qualquer fila</strong> — elas abrem o
          atendimento e não veem conversa alguma: {semFila.map((a) => a.nome).join(", ")}.
          {sel && " Selecione a fila ao lado e marque quem entra."}
        </Alerta>
      )}
      {filasVazias.length > 0 && (
        <Alerta tipo="atencao">
          <strong>Fila sem ninguém dentro:</strong> {filasVazias.map((t) => t.nome).join(", ")}. O
          que for encaminhado para lá não chega a ninguém.
        </Alerta>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* ------------------------------ Filas ------------------------------ */}
        <Card titulo="Filas" descricao="Clique para ver e editar os membros.">
          <div className="divide-y">
            {teams.length === 0 && (
              <p className="p-4 text-sm text-muted-foreground">
                Nenhuma fila cadastrada. Sem fila, toda conversa fica na caixa central.
              </p>
            )}
            {teams.map((t) => {
              const qtd = (membrosDa[t.id] ?? []).length;
              const cont = conversasPorFila[t.id];
              const ativa = selected === t.id;
              return (
                <div
                  key={t.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelected(t.id)}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setSelected(t.id); }}
                  className={`flex items-start justify-between gap-2 p-3 cursor-pointer ${
                    ativa ? "bg-acao/10" : "hover:bg-muted/40"
                  }`}
                >
                  <div className="min-w-0">
                    <div className="text-sm font-medium truncate">{t.nome}</div>
                    {t.descricao && (
                      <div className="text-[11px] text-muted-foreground truncate">{t.descricao}</div>
                    )}
                    <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
                      <span
                        className={`inline-flex items-center gap-1 ${
                          qtd === 0 ? "text-amber-600 dark:text-amber-400 font-medium" : ""
                        }`}
                      >
                        {qtd === 0 ? <AlertTriangle size={11} /> : <Users size={11} />}
                        {qtd === 0 ? "sem ninguém" : `${qtd} ${qtd === 1 ? "pessoa" : "pessoas"}`}
                      </span>
                      {cont?.total ? (
                        <span className="inline-flex items-center gap-1">
                          <MessageSquare size={11} />
                          {cont.total} conversa{cont.total === 1 ? "" : "s"}
                          {cont.abertas ? ` · ${cont.abertas} em aberto` : ""}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      title="Renomear"
                      onClick={(e) => {
                        e.stopPropagation();
                        setErro(null);
                        setForm({ id: t.id, nome: t.nome, descricao: t.descricao ?? "" });
                      }}
                      className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      title="Excluir"
                      onClick={(e) => {
                        e.stopPropagation();
                        setErro(null);
                        setMoverConversas(false);
                        setExcluindo(t);
                      }}
                      className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* ----------------------------- Membros ----------------------------- */}
        <Card
          titulo={sel ? `Quem atende — ${sel.nome}` : "Quem atende"}
          descricao={
            sel
              ? "Marcar alguém aqui é o que faz as conversas desta fila aparecerem para essa pessoa."
              : "Selecione uma fila ao lado."
          }
        >
          {sel ? (
            <div className="p-4 space-y-3">
              {(membrosDa[sel.id] ?? []).length === 0 && (
                <Alerta tipo="atencao">
                  Esta fila está vazia. Encaminhar para ela agora é o mesmo que arquivar a conversa.
                </Alerta>
              )}
              <div className="space-y-1">
                {agents.map((a) => {
                  const dentro = isMember(a.id);
                  const foraDeTudo = semFila.some((s) => s.id === a.id);
                  return (
                    <label
                      key={a.id}
                      className="flex items-center gap-2 text-sm cursor-pointer rounded-md px-2 py-1.5 hover:bg-muted/60"
                    >
                      <input
                        type="checkbox"
                        checked={dentro}
                        onChange={(e) => void alternarMembro(sel.id, a.id, e.target.checked)}
                        className="h-3.5 w-3.5"
                      />
                      <span className="flex-1 min-w-0 truncate">{rotuloAgente(a)}</span>
                      {foraDeTudo && (
                        <span
                          title="Esta pessoa não está em nenhuma fila"
                          className="text-[10px] text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"
                        >
                          <AlertTriangle size={10} /> sem fila
                        </span>
                      )}
                    </label>
                  );
                })}
              </div>

              {semFila.length > 0 && (
                <div className="border-t pt-3">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      for (const a of semFila) void alternarMembro(sel.id, a.id, true);
                    }}
                  >
                    <UserPlus size={14} /> Trazer os {semFila.length} sem fila para esta
                  </Button>
                </div>
              )}
            </div>
          ) : (
            <p className="p-4 text-sm text-muted-foreground">Nenhuma fila selecionada.</p>
          )}
        </Card>
      </div>

      {/* --------------------------- Criar / editar --------------------------- */}
      <Modal
        aberto={form !== null}
        onFechar={() => setForm(null)}
        titulo={form?.id ? "Editar fila" : "Nova fila"}
        descricao="O nome aparece na triagem, nas automações e no filtro da caixa."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void salvarFila()}
              disabled={ocupado || !form?.nome.trim()}
            >
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {form?.id ? "Salvar" : "Criar fila"}
            </Button>
          </>
        }
      >
        <Field label="Nome" obrigatorio>
          <TextInput
            value={form?.nome ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, nome: e.target.value } : f))}
            placeholder="Ex.: Venda Urbana"
            autoFocus
          />
        </Field>
        <Field label="Descrição" dica="Para o time saber o que entra nesta fila.">
          <TextArea
            rows={2}
            value={form?.descricao ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, descricao: e.target.value } : f))}
            placeholder="Ex.: apartamentos e casas na cidade"
          />
        </Field>
      </Modal>

      {/* ------------------------------ Excluir ------------------------------ */}
      <Modal
        aberto={excluindo !== null}
        onFechar={() => setExcluindo(null)}
        titulo={`Excluir a fila ${excluindo?.nome ?? ""}?`}
        descricao="Os membros voltam a ficar sem esta fila; ninguém é excluído."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void excluirFila()}
              disabled={
                ocupado ||
                Boolean(excluindo && conversasPorFila[excluindo.id]?.total && !moverConversas)
              }
            >
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Excluir
            </Button>
          </>
        }
      >
        {excluindo && conversasPorFila[excluindo.id]?.total ? (
          <>
            <Alerta tipo="atencao">
              <strong>{conversasPorFila[excluindo.id].total} conversa(s)</strong> estão nesta fila
              {conversasPorFila[excluindo.id].abertas
                ? `, sendo ${conversasPorFila[excluindo.id].abertas} em aberto`
                : ""}
              . O banco não deixa excluir uma fila com conversa ligada — elas precisam ir para
              algum lugar antes.
            </Alerta>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={moverConversas}
                onChange={(e) => setMoverConversas(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Devolver essas conversas para a <strong>caixa central</strong> (sem fila) e então
                excluir. Elas continuam existindo, com todo o histórico.
              </span>
            </label>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Nenhuma conversa está ligada a esta fila. Pode excluir com segurança.
          </p>
        )}
      </Modal>
    </>
  );
}
