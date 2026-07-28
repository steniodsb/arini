"use client";

import { useState } from "react";
import { Eye, Filter, Pencil, Plus, Trash2, Users } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  CONDITION_OPERATOR_LABELS,
  CONVERSATION_STATUS_LABELS,
  PRIORITY_LABELS,
  CHANNEL_LABELS,
  LEAD_STAGES,
  type AtendimentoSegment,
  type AutomationCondition,
  type ConditionOperator,
  type ConversationStatus,
  type ConversationPriority,
  type ConversationChannel,
  type LeadOrigin,
  type AtendimentoTeam,
  type AtendimentoLabel,
  type AtendimentoInbox,
  type AtendimentoCompany,
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
  SelectInput,
  EmptyState,
  Alerta,
  Spinner,
} from "@/components/atendimento/ui";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  CAMPOS_SEGMENTO,
  SEGMENT_TIPO_LABELS,
  TABELA_SEGMENTO,
  construirConsulta,
  campoDoSegmento,
  operadorSemValor,
  type SegmentTipo,
  type FonteOpcoesSegmento,
} from "@/lib/atendimento/segments";

// =====================================================================
// SEGMENTOS SALVOS — filtros nomeados de conversas ou de contatos.
//
// A mesma linguagem visual das Regras de automação (mesmo construtor de
// condições, mesmos operadores) porque, para o usuário, é a MESMA ideia:
// "campo + operador + valor". O que muda é o destino: aqui o filtro não
// dispara ação nenhuma, só recorta uma lista.
//
// A coluna "Resultados" é contada de verdade (no servidor, ao carregar, e
// no navegador depois de salvar) — número guardado envelheceria em horas.
// =====================================================================

const OPERADORES = Object.keys(CONDITION_OPERATOR_LABELS) as ConditionOperator[];
const TIPOS: SegmentTipo[] = ["conversa", "contato"];

/** Origens do lead (enum lead_origin). Rótulos ficam aqui: types.ts não os traz. */
const ORIGEM_LABELS: Record<LeadOrigin, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  indicacao: "Indicação",
  trafego_pago: "Tráfego pago",
  placa: "Placa",
  portal: "Portal",
  tiktok: "TikTok",
  messenger: "Messenger",
  telegram: "Telegram",
  email: "E-mail",
  outros: "Outros",
};

interface FormSegmento {
  id: string | null;
  nome: string;
  tipo: SegmentTipo;
  visibilidade: "global" | "pessoal";
  filtros: AutomationCondition[];
}

/** Linha crua da pré-visualização — só o que a tabela mostra. */
interface LinhaPrevia {
  id: string;
  titulo: string;
  detalhe: string | null;
}

function novaCondicao(tipo: SegmentTipo): AutomationCondition {
  return { campo: CAMPOS_SEGMENTO[tipo][0].campo, operador: "igual", valor: "" };
}

const FORM_VAZIO: FormSegmento = {
  id: null,
  nome: "",
  tipo: "conversa",
  visibilidade: "global",
  filtros: [],
};

export function SegmentsManager({
  usuarioId,
  initialSegmentos,
  contagensIniciais,
  autores,
  equipes,
  etiquetas,
  caixas,
  empresas,
  agentes,
}: {
  usuarioId: string;
  initialSegmentos: AtendimentoSegment[];
  contagensIniciais: Record<string, number | null>;
  autores: Record<string, string>;
  equipes: AtendimentoTeam[];
  etiquetas: AtendimentoLabel[];
  caixas: AtendimentoInbox[];
  empresas: AtendimentoCompany[];
  agentes: AgentOption[];
}) {
  const [segmentos, setSegmentos] = useState<AtendimentoSegment[]>(initialSegmentos);
  const [contagens, setContagens] = useState<Record<string, number | null>>(contagensIniciais);
  const [form, setForm] = useState<FormSegmento | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Pré-visualização do modal.
  const [previa, setPrevia] = useState<LinhaPrevia[] | null>(null);
  const [previaTotal, setPreviaTotal] = useState<number | null>(null);
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);

  function abrirNova() {
    setErro(null);
    setPrevia(null);
    setPreviaTotal(null);
    setForm({ ...FORM_VAZIO, filtros: [novaCondicao("conversa")] });
  }

  function abrirEdicao(s: AtendimentoSegment) {
    setErro(null);
    setPrevia(null);
    setPreviaTotal(null);
    setForm({
      id: s.id,
      nome: s.nome,
      tipo: (s.tipo ?? "conversa") as SegmentTipo,
      visibilidade: s.visibilidade,
      filtros: (s.filtros ?? []).map((f) => ({ ...f })),
    });
  }

  /** Conta quantos registros o filtro devolve AGORA (usado após salvar). */
  async function recontar(tipo: SegmentTipo, filtros: AutomationCondition[]): Promise<number | null> {
    const supabase = createSupabaseBrowser();
    const { count, error } = await construirConsulta(
      supabase.from(TABELA_SEGMENTO[tipo]).select("id", { count: "exact", head: true }),
      filtros,
      tipo,
    );
    return error ? null : count ?? 0;
  }

  async function excluir(s: AtendimentoSegment) {
    if (!confirm(`Excluir o segmento "${s.nome}"? Essa ação não pode ser desfeita.`)) return;
    setErroLista(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_segments").delete().eq("id", s.id);
    if (error) {
      setErroLista(error.message);
      return;
    }
    setSegmentos((p) => p.filter((x) => x.id !== s.id));
  }

  /** Valida o formulário e devolve os filtros já normalizados (ou null). */
  function filtrosValidos(f: FormSegmento): AutomationCondition[] | null {
    const semValor = f.filtros.findIndex(
      (c) => !operadorSemValor(c.operador) && !c.valor.trim(),
    );
    if (semValor >= 0) {
      setErro(`A condição ${semValor + 1} está sem valor.`);
      return null;
    }
    return f.filtros.map((c) => ({
      campo: c.campo,
      operador: c.operador,
      // "está preenchido"/"está vazio" não usam valor — grava vazio.
      valor: operadorSemValor(c.operador) ? "" : c.valor.trim(),
    }));
  }

  async function preVisualizar() {
    if (!form) return;
    const filtros = filtrosValidos(form);
    if (!filtros) return;

    setErro(null);
    setCarregandoPrevia(true);
    setPrevia(null);

    const supabase = createSupabaseBrowser();
    // Campos diferentes por tipo: conversa mostra contato + último recado;
    // contato mostra nome + e-mail/telefone.
    const colunas =
      form.tipo === "conversa"
        ? "id, contato_nome, contato_telefone, status, last_message_preview"
        : "id, nome, email, telefone, stage";

    const { data, count, error } = await construirConsulta(
      supabase
        .from(TABELA_SEGMENTO[form.tipo])
        .select(colunas, { count: "exact" })
        .limit(10),
      filtros,
      form.tipo,
    );

    setCarregandoPrevia(false);
    if (error) {
      setErro(error.message);
      return;
    }

    const linhas = (data ?? []) as unknown as Record<string, string | null>[];
    setPreviaTotal(count ?? linhas.length);
    setPrevia(
      linhas.map((l) =>
        form.tipo === "conversa"
          ? {
              id: String(l.id),
              titulo: l.contato_nome || l.contato_telefone || "Sem nome",
              detalhe: l.last_message_preview ?? l.status ?? null,
            }
          : {
              id: String(l.id),
              titulo: l.nome || "Sem nome",
              detalhe: l.email || l.telefone || l.stage || null,
            },
      ),
    );
  }

  async function salvar() {
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) {
      setErro("Dê um nome para o segmento.");
      return;
    }
    if (form.filtros.length === 0) {
      setErro("Adicione pelo menos uma condição.");
      return;
    }
    const filtros = filtrosValidos(form);
    if (!filtros) return;

    setSalvando(true);
    setErro(null);
    const supabase = createSupabaseBrowser();
    const payload = {
      nome,
      tipo: form.tipo,
      filtros,
      visibilidade: form.visibilidade,
    };

    const { data, error } = form.id
      ? await supabase.from("atendimento_segments").update(payload).eq("id", form.id).select("*").single()
      : await supabase
          .from("atendimento_segments")
          .insert({ ...payload, criado_por: usuarioId })
          .select("*")
          .single();

    setSalvando(false);
    if (error) {
      setErro(error.message);
      return;
    }

    const salvo = data as AtendimentoSegment;
    setSegmentos((p) =>
      form.id ? p.map((x) => (x.id === salvo.id ? salvo : x)) : [salvo, ...p],
    );
    setForm(null);

    // Conta o resultado do segmento recém-salvo sem recarregar a página.
    const total = await recontar(form.tipo, filtros);
    setContagens((p) => ({ ...p, [salvo.id]: total }));
  }

  // ----- condições -----
  function atualizarCondicao(i: number, patch: Partial<AutomationCondition>) {
    if (!form) return;
    setForm({
      ...form,
      filtros: form.filtros.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    });
    setPrevia(null);
  }
  function removerCondicao(i: number) {
    if (!form) return;
    setForm({ ...form, filtros: form.filtros.filter((_, idx) => idx !== i) });
    setPrevia(null);
  }

  /** Opções do campo de valor conforme a fonte do campo escolhido. */
  function opcoesDoCampo(tipo: SegmentTipo, campo: string): { valor: string; label: string }[] | null {
    const fonte: FonteOpcoesSegmento | undefined = campoDoSegmento(tipo, campo)?.fonte;
    switch (fonte) {
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
      case "caixas":
        return caixas.map((c) => ({ valor: c.id, label: c.nome }));
      case "empresas":
        return empresas.map((c) => ({ valor: c.id, label: c.nome }));
      case "estagio":
        return LEAD_STAGES.map((s) => ({ valor: s.key, label: s.label }));
      case "origem":
        return (Object.keys(ORIGEM_LABELS) as LeadOrigin[]).map((o) => ({
          valor: o,
          label: ORIGEM_LABELS[o],
        }));
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
        titulo="Segmentos salvos"
        descricao="Filtros nomeados de conversas ou de contatos, para não remontar a mesma busca todo dia."
        acoes={
          <Button type="button" variant="gold" onClick={abrirNova}>
            <Plus size={15} /> Novo segmento
          </Button>
        }
      />

      {erroLista && <Alerta tipo="erro">{erroLista}</Alerta>}

      {segmentos.length === 0 ? (
        <EmptyState
          icone={<Filter size={34} />}
          titulo="Nenhum segmento salvo"
          descricao="Exemplo: conversas urgentes sem responsável, ou contatos que vieram de tráfego pago e ainda estão na etapa Novo."
          acao={
            <Button type="button" variant="gold" onClick={abrirNova}>
              <Plus size={15} /> Novo segmento
            </Button>
          }
        />
      ) : (
        <Card>
          <Table
            colunas={["Segmento", "Tipo", "Condições", "Resultados", "Visibilidade", "Criado por", ""]}
          >
            {segmentos.map((s) => {
              const tipo = (s.tipo ?? "conversa") as SegmentTipo;
              const total = contagens[s.id];
              return (
                <tr key={s.id} className="hover:bg-muted/30">
                  <td className="px-3 py-2.5 align-top font-medium">{s.nome}</td>
                  <td className="px-3 py-2.5 align-top">
                    <Badge variant="outline">{SEGMENT_TIPO_LABELS[tipo]}</Badge>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground whitespace-nowrap">
                    {(s.filtros ?? []).length}
                  </td>
                  <td className="px-3 py-2.5 align-top whitespace-nowrap">
                    {total === null || total === undefined ? (
                      <span className="text-xs text-muted-foreground" title="Não foi possível contar">
                        —
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1.5 text-sm">
                        <Users size={13} className="text-muted-foreground" />
                        {total}
                      </span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <Badge variant="muted">
                      {s.visibilidade === "global" ? "Todo o time" : "Só eu"}
                    </Badge>
                  </td>
                  <td className="px-3 py-2.5 align-top text-xs text-muted-foreground">
                    {(s.criado_por && autores[s.criado_por]) || "—"}
                  </td>
                  <td className="px-3 py-2.5 align-top">
                    <div className="flex items-center gap-1 justify-end">
                      <button
                        type="button"
                        onClick={() => abrirEdicao(s)}
                        className="p-1.5 rounded text-muted-foreground hover:bg-muted"
                        title="Editar"
                        aria-label={`Editar o segmento ${s.nome}`}
                      >
                        <Pencil size={15} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void excluir(s)}
                        className="p-1.5 rounded text-muted-foreground hover:text-red-600"
                        title="Excluir"
                        aria-label={`Excluir o segmento ${s.nome}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </Table>
        </Card>
      )}

      <Modal
        aberto={form !== null}
        onFechar={() => setForm(null)}
        titulo={form?.id ? "Editar segmento" : "Novo segmento"}
        descricao="Todas as condições precisam ser verdadeiras (E) para o registro entrar no segmento."
        largura="max-w-2xl"
        rodape={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => void preVisualizar()}
              disabled={carregandoPrevia || salvando}
            >
              {carregandoPrevia ? <Spinner size={14} /> : <Eye size={15} />} Pré-visualizar
            </Button>
            <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" variant="gold" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar segmento"}
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
                placeholder="Ex.: Urgentes sem responsável"
                autoFocus
              />
            </Field>

            <div className="grid sm:grid-cols-2 gap-3">
              <Field label="O que este segmento lista" obrigatorio>
                <SelectInput
                  value={form.tipo}
                  onChange={(e) => {
                    // Trocar o tipo troca a tabela: as condições antigas
                    // apontam para colunas que não existem na nova.
                    const tipo = e.target.value as SegmentTipo;
                    setForm({ ...form, tipo, filtros: [novaCondicao(tipo)] });
                    setPrevia(null);
                    setPreviaTotal(null);
                  }}
                >
                  {TIPOS.map((t) => (
                    <option key={t} value={t}>
                      {SEGMENT_TIPO_LABELS[t]}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Quem enxerga" dica="Pessoal aparece só para você.">
                <SelectInput
                  value={form.visibilidade}
                  onChange={(e) =>
                    setForm({ ...form, visibilidade: e.target.value as "global" | "pessoal" })
                  }
                >
                  <option value="global">Todo o time</option>
                  <option value="pessoal">Só eu</option>
                </SelectInput>
              </Field>
            </div>

            {/* ---- Condições ---- */}
            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-medium">Se todas estas condições forem verdadeiras</h3>

              {form.filtros.length === 0 && (
                <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
                  Sem condições: adicione pelo menos uma.
                </p>
              )}

              {form.filtros.map((c, i) => {
                const opcoes = opcoesDoCampo(form.tipo, c.campo);
                const semValor = operadorSemValor(c.operador);
                return (
                  <div
                    key={i}
                    className="rounded-lg border bg-muted/30 p-2.5 flex flex-wrap gap-2 items-center"
                  >
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
                      {CAMPOS_SEGMENTO[form.tipo].map((cc) => (
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
                onClick={() =>
                  setForm({ ...form, filtros: [...form.filtros, novaCondicao(form.tipo)] })
                }
              >
                <Plus size={14} /> Adicionar condição
              </Button>
            </div>

            {/* ---- Pré-visualização ---- */}
            {previa && (
              <div className="space-y-2 pt-1">
                <h3 className="text-xs font-medium">
                  Pré-visualização — {previaTotal ?? previa.length}{" "}
                  {(previaTotal ?? previa.length) === 1 ? "resultado" : "resultados"}
                  {previa.length < (previaTotal ?? 0) && " (mostrando os 10 primeiros)"}
                </h3>
                {previa.length === 0 ? (
                  <p className="text-xs text-muted-foreground rounded-lg border border-dashed px-3 py-4 text-center">
                    Nenhum registro bate com essas condições hoje.
                  </p>
                ) : (
                  <ul className="rounded-lg border divide-y">
                    {previa.map((l) => (
                      <li key={l.id} className="px-3 py-2">
                        <div className="text-sm truncate">{l.titulo}</div>
                        {l.detalhe && (
                          <div className="text-[11px] text-muted-foreground truncate">
                            {l.detalhe}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </>
        )}
      </Modal>
    </PageShell>
  );
}
