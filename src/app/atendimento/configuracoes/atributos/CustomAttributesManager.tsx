"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Modal, Field, TextInput, TextArea, SelectInput,
  EmptyState, Card, Table, Alerta, Spinner,
} from "@/components/atendimento/ui";
import {
  CUSTOM_ATTRIBUTE_TYPE_LABELS,
  type CustomAttributeDef,
  type CustomAttributeType,
} from "@/lib/types";
import { Plus, Pencil, Trash2, SlidersHorizontal, X } from "lucide-react";

const TIPOS = Object.keys(CUSTOM_ATTRIBUTE_TYPE_LABELS) as CustomAttributeType[];

type AplicaA = "conversa" | "contato";
const ABAS: { id: AplicaA; label: string }[] = [
  { id: "conversa", label: "Conversa" },
  { id: "contato", label: "Contato" },
];

/** "Bairro de interesse" → "bairro_de_interesse" (a chave é usada no jsonb). */
function paraSnakeCase(texto: string): string {
  return texto
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 60);
}

type Rascunho = {
  id: string | null;
  nome: string;
  chave: string;
  // Depois que o usuário editar a chave à mão, paramos de sobrescrevê-la.
  chaveManual: boolean;
  descricao: string;
  tipo: CustomAttributeType;
  opcoes: string[];
  aplica_a: AplicaA;
};

export function CustomAttributesManager({ initial }: { initial: CustomAttributeDef[] }) {
  const [atributos, setAtributos] = useState(initial);
  const [aba, setAba] = useState<AplicaA>("conversa");
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [excluindo, setExcluindo] = useState<CustomAttributeDef | null>(null);
  const [novaOpcao, setNovaOpcao] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const supabase = () => createSupabaseBrowser();
  const daAba = atributos.filter((a) => a.aplica_a === aba);

  function novo() {
    setErro(null);
    setNovaOpcao("");
    setRascunho({
      id: null, nome: "", chave: "", chaveManual: false,
      descricao: "", tipo: "texto", opcoes: [], aplica_a: aba,
    });
  }

  function editar(a: CustomAttributeDef) {
    setErro(null);
    setNovaOpcao("");
    setRascunho({
      id: a.id,
      nome: a.nome,
      chave: a.chave,
      chaveManual: true,
      descricao: a.descricao ?? "",
      tipo: a.tipo,
      opcoes: [...(a.opcoes ?? [])],
      aplica_a: a.aplica_a,
    });
  }

  function setNome(nome: string) {
    if (!rascunho) return;
    setRascunho({
      ...rascunho,
      nome,
      chave: rascunho.chaveManual ? rascunho.chave : paraSnakeCase(nome),
    });
  }

  function addOpcao() {
    if (!rascunho || !novaOpcao.trim()) return;
    if (rascunho.opcoes.includes(novaOpcao.trim())) { setNovaOpcao(""); return; }
    setRascunho({ ...rascunho, opcoes: [...rascunho.opcoes, novaOpcao.trim()] });
    setNovaOpcao("");
  }

  function removeOpcao(i: number) {
    if (!rascunho) return;
    const opcoes = [...rascunho.opcoes];
    opcoes.splice(i, 1);
    setRascunho({ ...rascunho, opcoes });
  }

  async function salvar() {
    if (!rascunho || !rascunho.nome.trim() || !rascunho.chave.trim()) return;
    setSalvando(true);
    setErro(null);
    const payload = {
      nome: rascunho.nome.trim(),
      chave: paraSnakeCase(rascunho.chave),
      descricao: rascunho.descricao.trim() || null,
      tipo: rascunho.tipo,
      // Só o tipo "lista" usa opções; os demais gravam vazio para não deixar lixo.
      opcoes: rascunho.tipo === "lista" ? rascunho.opcoes : [],
      aplica_a: rascunho.aplica_a,
    };

    const sb = supabase();
    const { data, error } = rascunho.id
      ? await sb.from("atendimento_custom_attributes").update(payload).eq("id", rascunho.id).select("*").single()
      : await sb.from("atendimento_custom_attributes").insert(payload).select("*").single();

    setSalvando(false);
    if (error) {
      // A tabela tem unique(chave, aplica_a) — traduz o erro cru do Postgres.
      setErro(
        error.code === "23505"
          ? "Já existe um atributo com essa chave neste escopo."
          : error.message,
      );
      return;
    }

    const salvo = data as CustomAttributeDef;
    setAtributos((p) =>
      (rascunho.id ? p.map((x) => (x.id === salvo.id ? salvo : x)) : [...p, salvo])
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    );
    setRascunho(null);
  }

  async function excluir() {
    if (!excluindo) return;
    const { error } = await supabase().from("atendimento_custom_attributes").delete().eq("id", excluindo.id);
    if (error) { setErro(error.message); setExcluindo(null); return; }
    setAtributos((p) => p.filter((x) => x.id !== excluindo.id));
    setExcluindo(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Atributos personalizados"
        descricao="Campos extras que você grava nas conversas e nos contatos."
        acoes={
          <Button type="button" variant="gold" size="sm" onClick={novo}>
            <Plus size={15} /> Novo atributo
          </Button>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="flex gap-1 border-b">
        {ABAS.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`px-3 py-2 text-[13px] border-b-2 -mb-px ${
              aba === a.id
                ? "border-arini text-arini dark:text-gold font-medium dark:border-gold"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {a.label}
          </button>
        ))}
      </div>

      {daAba.length === 0 ? (
        <EmptyState
          icone={<SlidersHorizontal size={34} />}
          titulo={`Nenhum atributo de ${aba}`}
          descricao="Crie campos como orçamento, bairro de interesse ou motivo do contato."
          acao={
            <Button type="button" variant="gold" size="sm" onClick={novo}>
              <Plus size={15} /> Novo atributo
            </Button>
          }
        />
      ) : (
        <Card>
          <Table colunas={["Nome", "Chave", "Tipo", "Opções", ""]}>
            {daAba.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30 align-top">
                <td className="px-3 py-2">
                  <div className="font-medium">{a.nome}</div>
                  {a.descricao && <div className="text-xs text-muted-foreground">{a.descricao}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">
                  <code className="text-xs bg-muted rounded px-1.5 py-0.5">{a.chave}</code>
                </td>
                <td className="px-3 py-2 whitespace-nowrap text-muted-foreground">
                  {CUSTOM_ATTRIBUTE_TYPE_LABELS[a.tipo]}
                </td>
                <td className="px-3 py-2">
                  {a.tipo === "lista" && (a.opcoes ?? []).length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {a.opcoes.map((o) => (
                        <span key={o} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">{o}</span>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => editar(a)}
                      className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindo(a)}
                      className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                      aria-label="Excluir"
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
        aberto={rascunho != null}
        onFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? "Editar atributo" : "Novo atributo personalizado"}
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRascunho(null)}>Cancelar</Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => void salvar()}
              disabled={salvando || !rascunho?.nome.trim() || !rascunho?.chave.trim()}
            >
              {salvando && <Spinner />} Salvar
            </Button>
          </>
        }
      >
        {rascunho && (
          <>
            <Field label="Aplica-se a">
              <SelectInput
                value={rascunho.aplica_a}
                onChange={(e) => setRascunho({ ...rascunho, aplica_a: e.target.value as AplicaA })}
              >
                {ABAS.map((a) => (
                  <option key={a.id} value={a.id}>{a.label}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Nome" obrigatorio>
              <TextInput
                value={rascunho.nome}
                onChange={(e) => setNome(e.target.value)}
                placeholder="Ex.: Bairro de interesse"
                autoFocus
              />
            </Field>
            <Field label="Chave" obrigatorio dica="Identificador usado internamente. Gerado a partir do nome, mas você pode ajustar.">
              <TextInput
                value={rascunho.chave}
                onChange={(e) => setRascunho({ ...rascunho, chave: e.target.value, chaveManual: true })}
                placeholder="bairro_de_interesse"
              />
            </Field>
            <Field label="Descrição">
              <TextArea
                value={rascunho.descricao}
                onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                placeholder="Para que serve este campo."
              />
            </Field>
            <Field label="Tipo">
              <SelectInput
                value={rascunho.tipo}
                onChange={(e) => setRascunho({ ...rascunho, tipo: e.target.value as CustomAttributeType })}
              >
                {TIPOS.map((t) => (
                  <option key={t} value={t}>{CUSTOM_ATTRIBUTE_TYPE_LABELS[t]}</option>
                ))}
              </SelectInput>
            </Field>

            {rascunho.tipo === "lista" && (
              <Field label="Opções" obrigatorio dica="Os valores que o agente poderá escolher.">
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {rascunho.opcoes.length === 0 && (
                      <span className="text-xs text-muted-foreground">Nenhuma opção ainda.</span>
                    )}
                    {rascunho.opcoes.map((o, i) => (
                      <span key={`${o}-${i}`} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs">
                        {o}
                        <button
                          type="button"
                          onClick={() => removeOpcao(i)}
                          className="text-muted-foreground hover:text-red-600"
                          aria-label={`Remover ${o}`}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <TextInput
                      value={novaOpcao}
                      onChange={(e) => setNovaOpcao(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") { e.preventDefault(); addOpcao(); }
                      }}
                      placeholder="Nova opção"
                    />
                    <Button type="button" variant="outline" size="sm" onClick={addOpcao} disabled={!novaOpcao.trim()}>
                      <Plus size={15} />
                    </Button>
                  </div>
                </div>
              </Field>
            )}
          </>
        )}
      </Modal>

      <Modal
        aberto={excluindo != null}
        onFechar={() => setExcluindo(null)}
        titulo="Excluir atributo"
        descricao="Esta ação não pode ser desfeita."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void excluir()}>
              <Trash2 size={15} /> Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Excluir <strong>{excluindo?.nome}</strong>? Os valores já gravados nas conversas e contatos
          continuam no banco, mas deixam de aparecer na interface.
        </p>
      </Modal>
    </div>
  );
}
