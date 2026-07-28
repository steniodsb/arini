"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Alerta,
  Card,
  EmptyState,
  Field,
  SelectInput,
  Spinner,
  TextArea,
  TextInput,
} from "@/components/atendimento/ui";
import { type CannedResponse } from "@/lib/types";
import { FolderOpen, MessageSquareText, Plus, Trash2 } from "lucide-react";

// =====================================================================
// Respostas rápidas — cadastro e catálogo, agrupados por categoria.
//
// `canned_responses.categoria` (migração 0035) é texto livre, sem tabela
// de categorias. Isso é bom (ninguém precisa cadastrar categoria antes de
// usar) e é ruim (dá para criar "Locação", "locacao" e "Locação " como
// três coisas diferentes). O <datalist> do formulário existe justamente
// para isso: mostra o que já foi usado e o atendente reaproveita em vez
// de redigitar. O agrupamento também compara sem acento e sem caixa, para
// que uma divergência de digitação não parta a categoria em duas.
// =====================================================================

/** `CannedResponse` (types.ts) ainda não declara `categoria`. */
export type RespostaRapida = CannedResponse & { categoria: string | null };

/** Balde das respostas sem categoria. Também é o rótulo mostrado na tela. */
const SEM_CATEGORIA = "Geral";

/** Chave de comparação: minúsculo, sem acento, sem espaço nas pontas. */
function chaveCategoria(valor: string | null | undefined): string {
  const t = (valor ?? "").trim();
  if (!t) return SEM_CATEGORIA.toLowerCase();
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "");
}

/** Rótulo exibido — o texto como o usuário digitou, ou "Geral". */
function rotuloCategoria(valor: string | null | undefined): string {
  return (valor ?? "").trim() || SEM_CATEGORIA;
}

type Grupo = { chave: string; rotulo: string; itens: RespostaRapida[] };

export function CannedManager({ initial }: { initial: RespostaRapida[] }) {
  const [items, setItems] = useState<RespostaRapida[]>(initial);
  const [atalho, setAtalho] = useState("");
  const [titulo, setTitulo] = useState("");
  const [categoria, setCategoria] = useState("");
  const [conteudo, setConteudo] = useState("");
  const [filtro, setFiltro] = useState(""); // "" = todas
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Categorias já usadas, para o <datalist> e para o filtro do topo. */
  const categorias = useMemo(() => {
    const mapa = new Map<string, string>();
    for (const cr of items) {
      const bruto = (cr.categoria ?? "").trim();
      if (!bruto) continue;
      // Primeira grafia vista vence — evita alternar o rótulo a cada render.
      if (!mapa.has(chaveCategoria(bruto))) mapa.set(chaveCategoria(bruto), bruto);
    }
    return Array.from(mapa.entries())
      .map(([chave, rotulo]) => ({ chave, rotulo }))
      .sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR"));
  }, [items]);

  const temSemCategoria = useMemo(
    () => items.some((cr) => !(cr.categoria ?? "").trim()),
    [items],
  );

  /** Lista agrupada: categorias em ordem alfabética e "Geral" sempre por último. */
  const grupos = useMemo<Grupo[]>(() => {
    const visiveis = filtro ? items.filter((cr) => chaveCategoria(cr.categoria) === filtro) : items;

    const mapa = new Map<string, Grupo>();
    for (const cr of visiveis) {
      const chave = chaveCategoria(cr.categoria);
      let grupo = mapa.get(chave);
      if (!grupo) {
        grupo = { chave, rotulo: rotuloCategoria(cr.categoria), itens: [] };
        mapa.set(chave, grupo);
      }
      grupo.itens.push(cr);
    }
    for (const g of mapa.values()) {
      g.itens.sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR"));
    }

    const chaveGeral = SEM_CATEGORIA.toLowerCase();
    return Array.from(mapa.values()).sort((a, b) => {
      // "Geral" é a sobra, não uma categoria de verdade: vai para o fim.
      if (a.chave === chaveGeral) return 1;
      if (b.chave === chaveGeral) return -1;
      return a.rotulo.localeCompare(b.rotulo, "pt-BR");
    });
  }, [items, filtro]);

  async function add() {
    if (!titulo.trim() || !conteudo.trim()) return;
    setSaving(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { data, error: erro } = await supabase
      .from("canned_responses")
      .insert({
        atalho: (atalho.trim() || titulo.trim().toLowerCase().replace(/\s+/g, "_")).slice(0, 40),
        titulo: titulo.trim(),
        // Categoria vazia grava NULL: string vazia criaria um terceiro estado
        // ("", null e texto) para significar a mesma coisa.
        categoria: categoria.trim() || null,
        conteudo: conteudo.trim(),
      })
      .select("*")
      .single();
    setSaving(false);
    if (erro) {
      setError(erro.message);
      return;
    }
    setItems((p) =>
      [...p, data as RespostaRapida].sort((a, b) => a.titulo.localeCompare(b.titulo, "pt-BR")),
    );
    setAtalho("");
    setTitulo("");
    setConteudo("");
    // A categoria PERMANECE preenchida de propósito: quem cadastra respostas
    // costuma cadastrar várias da mesma categoria em sequência.
  }

  async function remove(id: string) {
    const supabase = createSupabaseBrowser();
    const { error: erro } = await supabase.from("canned_responses").delete().eq("id", id);
    if (erro) {
      setError(erro.message);
      return;
    }
    setItems((p) => p.filter((x) => x.id !== id));
  }

  return (
    <div className="grid md:grid-cols-2 gap-6">
      {/* ---- Formulário ---- */}
      <Card titulo="Nova resposta rápida" className="h-fit">
        <div className="p-4 space-y-3">
          <Field label="Título" obrigatorio>
            <TextInput
              placeholder="Ex.: Horário de atendimento"
              value={titulo}
              onChange={(e) => setTitulo(e.target.value)}
            />
          </Field>

          <Field label="Atalho" dica="Sem barra. O atendente digita /atalho no campo de resposta.">
            <TextInput
              placeholder="Ex.: horario"
              value={atalho}
              onChange={(e) => setAtalho(e.target.value)}
            />
          </Field>

          <Field
            label="Categoria"
            dica="Digite uma nova ou escolha uma já usada. Em branco, a resposta cai em “Geral”."
          >
            <TextInput
              list="categorias-respostas"
              placeholder="Ex.: Locação"
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
            />
          </Field>
          {/* O datalist é o que evita "Locação" e "locação" virarem duas. */}
          <datalist id="categorias-respostas">
            {categorias.map((c) => (
              <option key={c.chave} value={c.rotulo} />
            ))}
          </datalist>

          <Field label="Conteúdo" obrigatorio>
            <TextArea
              rows={4}
              placeholder="Conteúdo da mensagem…"
              value={conteudo}
              onChange={(e) => setConteudo(e.target.value)}
            />
          </Field>

          {error && <Alerta tipo="erro">{error}</Alerta>}

          <Button
            type="button"
            variant="gold"
            onClick={() => void add()}
            disabled={saving || !titulo.trim() || !conteudo.trim()}
          >
            {saving ? <Spinner size={15} /> : <Plus size={15} />}
            {saving ? "Salvando…" : "Adicionar"}
          </Button>
        </div>
      </Card>

      {/* ---- Catálogo agrupado ---- */}
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <SelectInput
            value={filtro}
            onChange={(e) => setFiltro(e.target.value)}
            className="w-auto"
            aria-label="Filtrar por categoria"
          >
            <option value="">Todas as categorias</option>
            {categorias.map((c) => (
              <option key={c.chave} value={c.chave}>
                {c.rotulo}
              </option>
            ))}
            {temSemCategoria && (
              <option value={SEM_CATEGORIA.toLowerCase()}>{SEM_CATEGORIA} (sem categoria)</option>
            )}
          </SelectInput>
          <span className="text-xs text-muted-foreground">
            {items.length} resposta(s) · {categorias.length} categoria(s)
          </span>
        </div>

        {grupos.length === 0 ? (
          <Card>
            <EmptyState
              icone={<MessageSquareText size={34} />}
              titulo={filtro ? "Nenhuma resposta nesta categoria" : "Nenhuma resposta cadastrada"}
              descricao={
                filtro
                  ? "Escolha outra categoria no filtro ao lado."
                  : "Cadastre a primeira ao lado — ela fica disponível no campo de resposta da conversa."
              }
              acao={
                filtro ? (
                  <Button type="button" variant="outline" size="sm" onClick={() => setFiltro("")}>
                    Ver todas
                  </Button>
                ) : undefined
              }
            />
          </Card>
        ) : (
          grupos.map((grupo) => (
            <section key={grupo.chave} className="space-y-2">
              <h3 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                <FolderOpen size={13} className="text-arini dark:text-gold" />
                {grupo.rotulo}
                <span className="font-normal normal-case opacity-70">({grupo.itens.length})</span>
              </h3>

              {grupo.itens.map((cr) => (
                <div key={cr.id} className="rounded-lg border bg-card p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-sm font-medium">
                        {cr.titulo}{" "}
                        <span className="text-muted-foreground text-xs">/{cr.atalho}</span>
                      </div>
                      <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-line">
                        {cr.conteudo}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => void remove(cr.id)}
                      className="text-muted-foreground hover:text-red-600 shrink-0"
                      title="Excluir"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          ))
        )}
      </div>
    </div>
  );
}
