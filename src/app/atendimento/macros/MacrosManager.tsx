"use client";

import { useState } from "react";
import { Copy, Pencil, Plus, Trash2, Workflow } from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  type AtendimentoMacro,
  type AtendimentoTeam,
  type AtendimentoLabel,
  type AgentOption,
  type MacroAction,
} from "@/lib/types";
import {
  PageShell,
  PageHeader,
  Card,
  Modal,
  Field,
  TextInput,
  TextArea,
  SelectInput,
  EmptyState,
  Alerta,
} from "@/components/atendimento/ui";
import { Button } from "@/components/ui/button";
import { ActionEditor, novaAcao, resumoAcoes, validarAcoes, type CatalogosAcao } from "./ActionEditor";

// =====================================================================
// MACROS — sequências de ações que o agente dispara em 1 clique dentro
// da conversa. Esta tela só cadastra/edita; quem executa é o botão de
// macro na caixa de entrada.
// =====================================================================

type Visibilidade = AtendimentoMacro["visibilidade"];

/** Estado do formulário do modal (separado da linha do banco). */
interface FormMacro {
  id: string | null;
  nome: string;
  descricao: string;
  visibilidade: Visibilidade;
  acoes: MacroAction[];
}

const FORM_VAZIO: FormMacro = {
  id: null,
  nome: "",
  descricao: "",
  visibilidade: "global",
  acoes: [novaAcao()],
};

export function MacrosManager({
  usuarioId,
  initialMacros,
  equipes,
  etiquetas,
  agentes,
}: {
  usuarioId: string;
  initialMacros: AtendimentoMacro[];
  equipes: AtendimentoTeam[];
  etiquetas: AtendimentoLabel[];
  agentes: AgentOption[];
}) {
  const [macros, setMacros] = useState<AtendimentoMacro[]>(initialMacros);
  const [form, setForm] = useState<FormMacro | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [erroLista, setErroLista] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const catalogos: CatalogosAcao = { agentes, equipes, etiquetas };

  function abrirNova() {
    setErro(null);
    setForm({ ...FORM_VAZIO, acoes: [novaAcao()] });
  }

  function abrirEdicao(m: AtendimentoMacro) {
    setErro(null);
    setForm({
      id: m.id,
      nome: m.nome,
      descricao: m.descricao ?? "",
      visibilidade: m.visibilidade,
      // Cópia rasa das ações para o cancelar não sujar a lista.
      acoes: (m.acoes ?? []).map((a) => ({ ...a })),
    });
  }

  async function duplicar(m: AtendimentoMacro) {
    setErroLista(null);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("atendimento_macros")
      .insert({
        nome: `${m.nome} (cópia)`,
        descricao: m.descricao,
        visibilidade: m.visibilidade,
        acoes: m.acoes ?? [],
        criado_por: usuarioId,
      })
      .select("*")
      .single();
    if (error) {
      setErroLista(error.message);
      return;
    }
    setMacros((p) => ordenar([...p, data as AtendimentoMacro]));
  }

  async function excluir(m: AtendimentoMacro) {
    if (!confirm(`Excluir a macro "${m.nome}"? Essa ação não pode ser desfeita.`)) return;
    setErroLista(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_macros").delete().eq("id", m.id);
    if (error) {
      setErroLista(error.message);
      return;
    }
    setMacros((p) => p.filter((x) => x.id !== m.id));
  }

  async function salvar() {
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) {
      setErro("Dê um nome para a macro.");
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
    // Grava os valores já aparados — o motor compara texto exato (etiquetas).
    const payload = {
      nome,
      descricao: form.descricao.trim() || null,
      visibilidade: form.visibilidade,
      acoes: form.acoes.map((a) => ({ tipo: a.tipo, valor: a.valor.trim() })),
    };

    if (form.id) {
      const { data, error } = await supabase
        .from("atendimento_macros")
        .update(payload)
        .eq("id", form.id)
        .select("*")
        .single();
      setSalvando(false);
      if (error) {
        setErro(error.message);
        return;
      }
      const atualizada = data as AtendimentoMacro;
      setMacros((p) => ordenar(p.map((x) => (x.id === atualizada.id ? atualizada : x))));
    } else {
      const { data, error } = await supabase
        .from("atendimento_macros")
        // criado_por só no insert: quem criou não muda numa edição.
        .insert({ ...payload, criado_por: usuarioId })
        .select("*")
        .single();
      setSalvando(false);
      if (error) {
        setErro(error.message);
        return;
      }
      setMacros((p) => ordenar([...p, data as AtendimentoMacro]));
    }
    setForm(null);
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Macros"
        descricao="Sequências de ações que o agente dispara em um clique dentro da conversa."
        acoes={
          <Button type="button" variant="gold" onClick={abrirNova}>
            <Plus size={15} /> Nova macro
          </Button>
        }
      />

      {erroLista && <Alerta tipo="erro">{erroLista}</Alerta>}

      {macros.length === 0 ? (
        <EmptyState
          icone={<Workflow size={34} />}
          titulo="Nenhuma macro cadastrada"
          descricao="Crie uma macro para agrupar ações repetitivas — enviar a mensagem de encerramento, etiquetar e resolver, por exemplo."
          acao={
            <Button type="button" variant="gold" onClick={abrirNova}>
              <Plus size={15} /> Nova macro
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {macros.map((m) => (
            <Card key={m.id} className="p-4 space-y-2">
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold truncate">{m.nome}</h3>
                  {m.descricao && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{m.descricao}</p>
                  )}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                    m.visibilidade === "global"
                      ? "border-arini/30 text-arini dark:text-gold dark:border-gold/30"
                      : "border-border text-muted-foreground"
                  }`}
                >
                  {m.visibilidade === "global" ? "Global" : "Pessoal"}
                </span>
              </div>

              <p className="text-xs text-muted-foreground leading-relaxed">
                {resumoAcoes(m.acoes ?? [], catalogos)}
              </p>

              <div className="flex items-center gap-1 pt-1">
                <Button type="button" variant="ghost" size="sm" onClick={() => abrirEdicao(m)}>
                  <Pencil size={14} /> Editar
                </Button>
                <Button type="button" variant="ghost" size="sm" onClick={() => void duplicar(m)}>
                  <Copy size={14} /> Duplicar
                </Button>
                <button
                  type="button"
                  onClick={() => void excluir(m)}
                  className="ml-auto p-1.5 rounded text-muted-foreground hover:text-red-600"
                  title="Excluir macro"
                  aria-label={`Excluir a macro ${m.nome}`}
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Modal
        aberto={form !== null}
        onFechar={() => setForm(null)}
        titulo={form?.id ? "Editar macro" : "Nova macro"}
        descricao="As ações rodam na ordem de cima para baixo."
        largura="max-w-2xl"
        rodape={
          <>
            <Button type="button" variant="ghost" onClick={() => setForm(null)} disabled={salvando}>
              Cancelar
            </Button>
            <Button type="button" variant="gold" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar macro"}
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
                placeholder="Ex.: Resolver e agradecer"
                autoFocus
              />
            </Field>

            <Field label="Descrição" dica="Ajuda o time a saber quando usar esta macro.">
              <TextArea
                rows={2}
                value={form.descricao}
                onChange={(e) => setForm({ ...form, descricao: e.target.value })}
                placeholder="Ex.: Encerra o atendimento agradecendo e marca como atendido."
              />
            </Field>

            <Field label="Visibilidade">
              <SelectInput
                value={form.visibilidade}
                onChange={(e) => setForm({ ...form, visibilidade: e.target.value as Visibilidade })}
              >
                <option value="global">Global — todo o time usa</option>
                <option value="pessoal">Pessoal — só eu vejo</option>
              </SelectInput>
            </Field>

            <div className="space-y-2 pt-1">
              <h3 className="text-xs font-medium">Ações da macro</h3>
              <ActionEditor
                acoes={form.acoes}
                onChange={(acoes) => setForm({ ...form, acoes })}
                catalogos={catalogos}
                idDatalist="macro-etiquetas"
              />
            </div>
          </>
        )}
      </Modal>
    </PageShell>
  );
}

function ordenar(lista: AtendimentoMacro[]): AtendimentoMacro[] {
  return [...lista].sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
}
