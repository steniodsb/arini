"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Trash2, Zap } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  AUTOMATION_EVENT_LABELS,
  CONDITION_OPERATOR_LABELS,
  CONVERSATION_STATUS_LABELS,
  PRIORITY_LABELS,
  CHANNEL_LABELS,
  type AtendimentoAutomation,
  type AutomationEvent,
  type AutomationCondition,
  type ConditionOperator,
  type ConversationStatus,
  type ConversationPriority,
  type ConversationChannel,
  type MacroAction,
  type AtendimentoTeam,
  type AtendimentoLabel,
  type AgentOption,
} from "@/lib/types";
import {
  PageShell,
  PageHeader,
  Card,
  Table,
  Modal,
  Field,
  TextInput,
  TextArea,
  SelectInput,
  Switch,
  EmptyState,
  Alerta,
} from "@/components/atendimento/ui";
import { Button } from "@/components/ui/button";
import {
  ActionEditor,
  novaAcao,
  resumoAcoes,
  validarAcoes,
  type CatalogosAcao,
} from "../../macros/ActionEditor";

// =====================================================================
// REGRAS DE AUTOMAÇÃO — "quando X acontecer e as condições baterem,
// faça Y". A tela cadastra as regras; a execução é responsabilidade do
// motor em src/lib/atendimento/automations.ts (ainda não plugado no
// webhook — por isso o aviso no topo).
// =====================================================================

/** Origem das opções do campo de valor de uma condição. */
type FonteOpcoes =
  | "texto"
  | "status"
  | "prioridade"
  | "canal"
  | "agentes"
  | "equipes"
  | "etiquetas"
  | "sim_nao";

interface CampoCondicao {
  campo: string;
  label: string;
  fonte: FonteOpcoes;
}

/**
 * Campos que a regra consegue inspecionar. Precisam bater com os nomes
 * que o motor lê do contexto (avaliarCondicoes).
 */
const CAMPOS_CONDICAO: CampoCondicao[] = [
  { campo: "status", label: "Status da conversa", fonte: "status" },
  { campo: "prioridade", label: "Prioridade", fonte: "prioridade" },
  { campo: "canal", label: "Canal", fonte: "canal" },
  { campo: "responsavel_id", label: "Responsável", fonte: "agentes" },
  { campo: "team_id", label: "Equipe", fonte: "equipes" },
  { campo: "tags", label: "Etiquetas", fonte: "etiquetas" },
  { campo: "contato_nome", label: "Nome do contato", fonte: "texto" },
  { campo: "contato_telefone", label: "Telefone do contato", fonte: "texto" },
  { campo: "mensagem", label: "Conteúdo da mensagem", fonte: "texto" },
  { campo: "horario_comercial", label: "Dentro do horário comercial", fonte: "sim_nao" },
];

const OPERADORES = Object.keys(CONDITION_OPERATOR_LABELS) as ConditionOperator[];
const EVENTOS = Object.keys(AUTOMATION_EVENT_LABELS) as AutomationEvent[];

/** Operadores que dispensam valor — o campo some do formulário. */
function operadorSemValor(op: ConditionOperator): boolean {
  return op === "existe" || op === "nao_existe";
}

interface FormRegra {
  id: string | null;
  nome: string;
  descricao: string;
  evento: AutomationEvent;
  condicoes: AutomationCondition[];
  acoes: MacroAction[];
  ativo: boolean;
}

const FORM_VAZIO: FormRegra = {
  id: null,
  nome: "",
  descricao: "",
  evento: "conversa_criada",
  condicoes: [],
  acoes: [],
  ativo: true,
};

function novaCondicao(): AutomationCondition {
  return { campo: "status", operador: "igual", valor: "" };
}

export function AutomationsManager({
  usuarioId,
  initialRegras,
  equipes,
  etiquetas,
  agentes,
}: {
  usuarioId: string;
  initialRegras: AtendimentoAutomation[];
  equipes: AtendimentoTeam[];
  etiquetas: AtendimentoLabel[];
  agentes: AgentOption[];
}) {
  const [regras, setRegras] = useState<AtendimentoAutomation[]>(initialRegras);
  const [form, setForm] = useState<FormRegra | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const catalogos: CatalogosAcao = { agentes, equipes, etiquetas };

  function abrirNova() {
    setErro(null);
    setForm({ ...FORM_VAZIO, condicoes: [novaCondicao()], acoes: [novaAcao()] });
  }

  function abrirEdicao(r: AtendimentoAutomation) {
    setErro(null);
    setForm({
      id: r.id,
      nome: r.nome,
      descricao: r.descricao ?? "",
      evento: r.evento,
      condicoes: (r.condicoes ?? []).map((c) => ({ ...c })),
      acoes: (r.acoes ?? []).map((a) => ({ ...a })),
      ativo: r.ativo,
    });
  }

  /** O switch grava na hora — o usuário espera efeito imediato de liga/desliga. */
  async function alternarAtivo(r: AtendimentoAutomation, ativo: boolean) {
    setErroLista(null);
    setRegras((p) => p.map((x) => (x.id === r.id ? { ...x, ativo } : x)));
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_automations").update({ ativo }).eq("id", r.id);
    if (error) {
      setErroLista(error.message);
      // Desfaz o otimismo se o banco recusou.
      setRegras((p) => p.map((x) => (x.id === r.id ? { ...x, ativo: r.ativo } : x)));
    }
  }

  async function duplicar(r: AtendimentoAutomation) {
    setErroLista(null);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("atendimento_automations")
      .insert({
        nome: `${r.nome} (cópia)`,
        descricao: r.descricao,
        evento: r.evento,
        condicoes: r.condicoes ?? [],
        acoes: r.acoes ?? [],
        // A cópia nasce desligada para ninguém duplicar efeito sem querer.
        ativo: false,
        criado_por: usuarioId,
      })
      .select("*")
      .single();
    if (error) {
      setErroLista(error.message);
      return;
    }
    setRegras((p) => [data as AtendimentoAutomation, ...p]);
  }

  async function excluir(r: AtendimentoAutomation) {
    if (!confirm(`Excluir a regra "${r.nome}"? Essa ação não pode ser desfeita.`)) return;
    setErroLista(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_automations").delete().eq("id", r.id);
    if (error) {
      setErroLista(error.message);
      return;
    }
    setRegras((p) => p.filter((x) => x.id !== r.id));
  }

  async function salvar() {
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) {
      setErro("Dê um nome para a regra.");
      return;
    }
    if (form.condicoes.length === 0) {
      setErro("Adicione pelo menos uma condição.");
      return;
    }
    const semValor = form.condicoes.findIndex(
      (c) => !operadorSemValor(c.operador) && !c.valor.trim(),
    );
    if (semValor >= 0) {
      setErro(`A condição ${semValor + 1} está sem valor.`);
      return;
    }
    const erroAcoes = validarAcoes(form.acoes);
    if (erroAcoes) {
      setErro(erroAcoes);
      return;
    }

    setSalvando(true);
    setErro(null);
    const supabase = createSupabaseBrowser();
    const payload = {
      nome,
      descricao: form.descricao.trim() || null,
      evento: form.evento,
      condicoes: form.condicoes.map((c) => ({
        campo: c.campo,
        operador: c.operador,
        // "existe"/"não existe" não usam valor — grava vazio para não confundir o motor.
        valor: operadorSemValor(c.operador) ? "" : c.valor.trim(),
      })),
      acoes: form.acoes.map((a) => ({ tipo: a.tipo, valor: a.valor.trim() })),
      ativo: form.ativo,
    };

    if (form.id) {
      const { data, error } = await supabase
        .from("atendimento_automations")
        .update(payload)
        .eq("id", form.id)
        .select("*")
        .single();
      setSalvando(false);
      if (error) {
        setErro(error.message);
        return;
      }
      const atualizada = data as AtendimentoAutomation;
      setRegras((p) => p.map((x) => (x.id === atualizada.id ? atualizada : x)));
    } else {
      const { data, error } = await supabase
        .from("atendimento_automations")
        .insert({ ...payload, criado_por: usuarioId })
        .select("*")
        .single();
      setSalvando(false);
      if (error) {
        setErro(error.message);
        return;
      }
      setRegras((p) => [data as AtendimentoAutomation, ...p]);
    }
    setForm(null);
  }

  // ----- condições -----
  function atualizarCondicao(i: number, patch: Partial<AutomationCondition>) {
    if (!form) return;
    setForm({
      ...form,
      condicoes: form.condicoes.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    });
  }
  function removerCondicao(i: number) {
    if (!form) return;
    setForm({ ...form, condicoes: form.condicoes.filter((_, idx) => idx !== i) });
  }

  /** Opções do campo de valor conforme a fonte do campo escolhido. */
  function opcoesDoCampo(campo: string): { valor: string; label: string }[] | null {
    const def = CAMPOS_CONDICAO.find((c) => c.campo === campo);
    switch (def?.fonte) {
      case "status":
        return (Object.keys(CONVERSATION_STATUS_LABELS) as ConversationStatus[]).map((s) => ({
          valor: s,
          label: CONVERSATION_STATUS_LABELS[s],
        }));
      case "prioridade":
        return (Object.keys(PRIORITY_LABELS) as ConversationPriority[]).map((p) => ({
          valor: p,
          label: PRIORITY_LABELS[p],
        }));
      case "canal":
        return (Object.keys(CHANNEL_LABELS) as ConversationChannel[]).map((c) => ({
          valor: c,
          label: CHANNEL_LABELS[c],
        }));
      case "agentes":
        return agentes.map((a) => ({ valor: a.id, label: a.nome }));
      case "equipes":
        return equipes.map((e) => ({ valor: e.id, label: e.nome }));
      case "etiquetas":
        return etiquetas.map((e) => ({ valor: e.nome, label: e.nome }));
      case "sim_nao":
        return [
          { valor: "sim", label: "Sim" },
          { valor: "nao", label: "Não" },
        ];
      default:
        return null; // texto livre
    }
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Regras de automação"
        descricao="Quando um evento acontecer e as condições baterem, execute uma sequência de ações."
        acoes={
          <Button type="button" variant="gold" onClick={abrirNova}>
            <Plus size={15} /> Nova regra
          </Button>
        }
      />

      {/* Honestidade sobre o estado real: a regra fica salva, mas ninguém
          a dispara ainda — falta ligar o motor ao webhook. */}
      <Alerta tipo="atencao">
        As regras criadas aqui ficam <strong>salvas e prontas</strong>, mas ainda{" "}
        <strong>não são disparadas automaticamente</strong>. Quem as executa é o motor no servidor
        (<code>src/lib/atendimento/automations.ts</code>), que ainda não está conectado ao webhook de
        mensagens. Até essa ligação existir, cadastre à vontade — nada roda sozinho.
      </Alerta>

      {erroLista && <Alerta tipo="erro">{erroLista}</Alerta>}

      {regras.length === 0 ? (
        <EmptyState
          icone={<Zap size={34} />}
          titulo="Nenhuma regra cadastrada"
          descricao="Exemplo: quando a conversa é criada no WhatsApp fora do horário comercial, enviar a mensagem de ausência e marcar como pendente."
          acao={
            <Button type="button" variant="gold" onClick={abrirNova}>
              <Plus size={15} /> Nova regra
            </Button>
          }
        />
      ) : (
        <Card>
          <Table colunas={["Regra", "Evento", "Condições", "Ações", "Ativa", ""]}>
            {regras.map((r) => (
              <tr key={r.id} className="hover:bg-muted/30">
                <td className="px-3 py-2.5 align-top">
                  <div className="font-medium">{r.nome}</div>
                  {r.descricao && (
                    <div className="text-xs text-muted-foreground mt-0.5 max-w-sm">{r.descricao}</div>
                  )}
                  <div className="text-[11px] text-muted-foreground mt-1 max-w-sm">
                    {resumoAcoes(r.acoes ?? [], catalogos)}
                  </div>
                </td>
                <td className="px-3 py-2.5 align-top text-xs text-muted-foreground whitespace-nowrap">
                  {AUTOMATION_EVENT_LABELS[r.evento] ?? r.evento}
                </td>
                <td className="px-3 py-2.5 align-top text-xs text-muted-foreground whitespace-nowrap">
                  {(r.condicoes ?? []).length}
                </td>
                <td className="px-3 py-2.5 align-top text-xs text-muted-foreground whitespace-nowrap">
                  {(r.acoes ?? []).length}
                </td>
                <td className="px-3 py-2.5 align-top">
                  <Switch checked={r.ativo} onChange={(v) => void alternarAtivo(r, v)} />
                </td>
                <td className="px-3 py-2.5 align-top">
                  <div className="flex items-center gap-1 justify-end">
                    <button
                      type="button"
                      onClick={() => abrirEdicao(r)}
                      className="p-1.5 rounded text-muted-foreground hover:bg-muted"
                      title="Editar"
                      aria-label={`Editar a regra ${r.nome}`}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void duplicar(r)}
                      className="p-1.5 rounded text-muted-foreground hover:bg-muted"
                      title="Duplicar"
                      aria-label={`Duplicar a regra ${r.nome}`}
                    >
                      <Copy size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => void excluir(r)}
                      className="p-1.5 rounded text-muted-foreground hover:text-red-600"
                      title="Excluir"
                      aria-label={`Excluir a regra ${r.nome}`}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </Table>
        </Card>
      )}

      <Modal
        aberto={form !== null}
        onFechar={() => setForm(null)}
        titulo={form?.id ? "Editar regra" : "Nova regra"}
        descricao="Todas as condições precisam ser verdadeiras (E) para as ações rodarem."
        largura="max-w-2xl"
        rodape={
          <>
            <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" variant="gold" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar regra"}
            </Button>
          </>
        }
      >
        {form && (
          <>
            {erro && <Alerta tipo="erro">{erro}</Alerta>}

            <Field label="Nome" obrigatorio>
              <TextInput
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Triagem fora do horário"
                autoFocus
              />
            </Field>

            <Field label="Descrição">
              <TextArea
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex.: Avisa o cliente e deixa a conversa pendente para o time do dia seguinte."
              />
            </Field>

            <Field label="Evento que dispara a regra" obrigatorio>
              <SelectInput
                value={form.evento}
                onChange={(e) => setForm({ ...form, evento: e.target.value as AutomationEvent })}
              >
                {EVENTOS.map((ev) => (
                  <option key={ev} value={ev}>
                    {AUTOMATION_EVENT_LABELS[ev]}
                  </option>
                ))}
              </SelectInput>
            </Field>

            <Switch
              checked={form.ativo}
              onChange={(v) => setForm({ ...form, ativo: v })}
              label="Regra ativa"
              dica="Desligada, a regra fica salva mas é ignorada pelo motor."
            />

            {/* ---- Condições ---- */}
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-medium">Se todas estas condições forem verdadeiras</h3>

              {form.condicoes.length === 0 && (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
                  Sem condições: adicione pelo menos uma.
                </p>
              )}

              {form.condicoes.map((c, i) => {
                const opcoes = opcoesDoCampo(c.campo);
                const semValor = operadorSemValor(c.operador);
                return (
                  <div key={i} className="rounded-lg border bg-muted/30 p-2.5 flex flex-wrap gap-2 items-center">
                    <span className="text-[11px] font-medium text-muted-foreground w-5 shrink-0">
                      {i + 1}.
                    </span>
                    <SelectInput
                      value={c.campo}
                      // Trocar de campo invalida o valor anterior (id vs. texto).
                      onChange={(e) => atualizarCondicao(i, { campo: e.target.value, valor: "" })}
                      className="flex-1 min-w-[140px]"
                      aria-label={`Campo da condição ${i + 1}`}
                    >
                      {CAMPOS_CONDICAO.map((cc) => (
                        <option key={cc.campo} value={cc.campo}>
                          {cc.label}
                        </option>
                      ))}
                    </SelectInput>
                    <SelectInput
                      value={c.operador}
                      onChange={(e) =>
                        atualizarCondicao(i, { operador: e.target.value as ConditionOperator })
                      }
                      className="w-[140px]"
                      aria-label={`Operador da condição ${i + 1}`}
                    >
                      {OPERADORES.map((op) => (
                        <option key={op} value={op}>
                          {CONDITION_OPERATOR_LABELS[op]}
                        </option>
                      ))}
                    </SelectInput>

                    {!semValor &&
                      (opcoes ? (
                        <SelectInput
                          value={c.valor}
                          onChange={(e) => atualizarCondicao(i, { valor: e.target.value })}
                          className="flex-1 min-w-[140px]"
                          aria-label={`Valor da condição ${i + 1}`}
                        >
                          <option value="">Selecione…</option>
                          {opcoes.map((o) => (
                            <option key={o.valor} value={o.valor}>
                              {o.label}
                            </option>
                          ))}
                        </SelectInput>
                      ) : (
                        <TextInput
                          value={c.valor}
                          onChange={(e) => atualizarCondicao(i, { valor: e.target.value })}
                          className="flex-1 min-w-[140px]"
                          placeholder="Valor"
                          aria-label={`Valor da condição ${i + 1}`}
                        />
                      ))}

                    <button
                      type="button"
                      onClick={() => removerCondicao(i)}
                      className="p-1.5 rounded text-muted-foreground hover:text-red-600 shrink-0"
                      title="Remover condição"
                      aria-label={`Remover condição ${i + 1}`}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                );
              })}

              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setForm({ ...form, condicoes: [...form.condicoes, novaCondicao()] })}
              >
                <Plus size={14} /> Adicionar condição
              </Button>
            </div>

            {/* ---- Ações (mesmo editor das macros) ---- */}
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-medium">Então faça</h3>
              <ActionEditor
                acoes={form.acoes}
                onChange={(acoes) => setForm({ ...form, acoes })}
                catalogos={catalogos}
                idDatalist="automacao-etiquetas"
              />
            </div>
          </>
        )}
      </Modal>
    </PageShell>
  );
}
