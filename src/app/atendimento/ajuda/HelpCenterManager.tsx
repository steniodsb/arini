"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageShell, PageHeader, Modal, Field, TextInput, TextArea, SelectInput,
  Switch, EmptyState, Card, Table, Alerta, inputCls, Spinner,
} from "@/components/atendimento/ui";
import { formatDateTimeBR } from "@/lib/utils";
import {
  BookOpen, Plus, Pencil, Trash2, ArrowUp, ArrowDown, Search, FileText,
  Globe, Eye, EyeOff, Archive, Send, LayoutGrid,
} from "lucide-react";
import { markdownParaHtml } from "./markdown";
import { paraSlug, type Artigo, type ArtigoStatus, type Categoria, type Portal } from "./tipos";

const STATUS_LABEL: Record<ArtigoStatus, string> = {
  rascunho: "Rascunho",
  publicado: "Publicado",
  arquivado: "Arquivado",
};

const STATUS_CLS: Record<ArtigoStatus, string> = {
  rascunho: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  publicado: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  arquivado: "bg-muted text-muted-foreground border-border",
};

const IDIOMAS = [
  { valor: "pt-BR", rotulo: "Português (Brasil)" },
  { valor: "en-US", rotulo: "Inglês (EUA)" },
  { valor: "es-ES", rotulo: "Espanhol" },
];

function Badge({ status }: { status: ArtigoStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

// Estado dos formulários — mantidos "planos" para o modal ser simples.
type FormPortal = {
  id: string | null;
  nome: string; slug: string; descricao: string;
  cor: string; idioma: string; dominio: string; ativo: boolean;
  // Slug travado assim que o usuário edita à mão, para não sobrescrever.
  slugManual: boolean;
};
type FormCategoria = {
  id: string | null;
  nome: string; slug: string; descricao: string; slugManual: boolean;
};
type FormArtigo = {
  id: string | null;
  titulo: string; slug: string; categoria: string; resumo: string;
  conteudo: string; status: ArtigoStatus; slugManual: boolean;
};

const PORTAL_VAZIO: FormPortal = {
  id: null, nome: "", slug: "", descricao: "",
  cor: "#092316", idioma: "pt-BR", dominio: "", ativo: true, slugManual: false,
};
const CATEGORIA_VAZIA: FormCategoria = { id: null, nome: "", slug: "", descricao: "", slugManual: false };
const ARTIGO_VAZIO: FormArtigo = {
  id: null, titulo: "", slug: "", categoria: "", resumo: "",
  conteudo: "", status: "rascunho", slugManual: false,
};

export function HelpCenterManager({
  initialPortais, initialCategorias, initialArtigos, autores, usuarioId,
}: {
  initialPortais: Portal[];
  initialCategorias: Categoria[];
  initialArtigos: Artigo[];
  autores: Record<string, string>;
  usuarioId: string;
}) {
  const supabase = createSupabaseBrowser();

  const [portais, setPortais] = useState(initialPortais);
  const [categorias, setCategorias] = useState(initialCategorias);
  const [artigos, setArtigos] = useState(initialArtigos);
  const [portalSel, setPortalSel] = useState<string | null>(initialPortais[0]?.id ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [formPortal, setFormPortal] = useState<FormPortal | null>(null);
  const [formCategoria, setFormCategoria] = useState<FormCategoria | null>(null);
  const [formArtigo, setFormArtigo] = useState<FormArtigo | null>(null);
  const [abaEditor, setAbaEditor] = useState<"escrever" | "previa">("escrever");

  const [busca, setBusca] = useState("");
  const [filtroStatus, setFiltroStatus] = useState<"todos" | ArtigoStatus>("todos");
  const [filtroCategoria, setFiltroCategoria] = useState<string>("todas");

  const categoriasDoPortal = useMemo(
    () => categorias.filter((c) => c.portal_id === portalSel).sort((a, b) => a.ordem - b.ordem),
    [categorias, portalSel],
  );

  const artigosDoPortal = useMemo(() => {
    const termo = busca.trim().toLowerCase();
    return artigos
      .filter((a) => a.portal_id === portalSel)
      .filter((a) => (filtroStatus === "todos" ? true : a.status === filtroStatus))
      .filter((a) =>
        filtroCategoria === "todas"
          ? true
          : filtroCategoria === "sem"
            ? !a.category_id
            : a.category_id === filtroCategoria,
      )
      .filter((a) =>
        !termo ||
        a.titulo.toLowerCase().includes(termo) ||
        (a.resumo ?? "").toLowerCase().includes(termo),
      );
  }, [artigos, portalSel, busca, filtroStatus, filtroCategoria]);

  const nomeCategoria = (id: string | null) =>
    categorias.find((c) => c.id === id)?.nome ?? "—";

  // ================= PORTAIS =================

  async function salvarPortal() {
    if (!formPortal) return;
    const nome = formPortal.nome.trim();
    const slug = (formPortal.slug.trim() || paraSlug(nome));
    if (!nome || !slug) { setErro("Informe nome e slug do portal."); return; }

    setSalvando(true); setErro(null);
    const payload = {
      nome,
      slug,
      descricao: formPortal.descricao.trim() || null,
      cor: formPortal.cor,
      idioma: formPortal.idioma,
      dominio_customizado: formPortal.dominio.trim() || null,
      ativo: formPortal.ativo,
    };

    if (formPortal.id) {
      const { data, error } = await supabase
        .from("atendimento_portals").update(payload).eq("id", formPortal.id).select("*").single();
      setSalvando(false);
      if (error) { setErro(error.message); return; }
      setPortais((p) => p.map((x) => (x.id === formPortal.id ? (data as Portal) : x)));
    } else {
      const { data, error } = await supabase
        .from("atendimento_portals").insert(payload).select("*").single();
      setSalvando(false);
      if (error) { setErro(error.message); return; }
      setPortais((p) => [...p, data as Portal]);
      setPortalSel((data as Portal).id);
    }
    setFormPortal(null);
  }

  async function excluirPortal(p: Portal) {
    if (!confirm(`Excluir o portal "${p.nome}"? As categorias e artigos dele também serão apagados.`)) return;
    const { error } = await supabase.from("atendimento_portals").delete().eq("id", p.id);
    if (error) { setErro(error.message); return; }
    setPortais((lista) => lista.filter((x) => x.id !== p.id));
    setCategorias((lista) => lista.filter((c) => c.portal_id !== p.id));
    setArtigos((lista) => lista.filter((a) => a.portal_id !== p.id));
    if (portalSel === p.id) setPortalSel(null);
  }

  // ================= CATEGORIAS =================

  async function salvarCategoria() {
    if (!formCategoria || !portalSel) return;
    const nome = formCategoria.nome.trim();
    const slug = formCategoria.slug.trim() || paraSlug(nome);
    if (!nome || !slug) { setErro("Informe nome e slug da categoria."); return; }

    setSalvando(true); setErro(null);
    const base = { nome, slug, descricao: formCategoria.descricao.trim() || null };

    if (formCategoria.id) {
      const { data, error } = await supabase
        .from("atendimento_categories").update(base).eq("id", formCategoria.id).select("*").single();
      setSalvando(false);
      if (error) { setErro(error.message); return; }
      setCategorias((p) => p.map((c) => (c.id === formCategoria.id ? (data as Categoria) : c)));
    } else {
      const ordem = categoriasDoPortal.length;
      const { data, error } = await supabase
        .from("atendimento_categories")
        .insert({ ...base, portal_id: portalSel, ordem })
        .select("*").single();
      setSalvando(false);
      if (error) { setErro(error.message); return; }
      setCategorias((p) => [...p, data as Categoria]);
    }
    setFormCategoria(null);
  }

  async function excluirCategoria(c: Categoria) {
    if (!confirm(`Excluir a categoria "${c.nome}"? Os artigos dela ficam sem categoria.`)) return;
    const { error } = await supabase.from("atendimento_categories").delete().eq("id", c.id);
    if (error) { setErro(error.message); return; }
    setCategorias((lista) => lista.filter((x) => x.id !== c.id));
    setArtigos((lista) => lista.map((a) => (a.category_id === c.id ? { ...a, category_id: null } : a)));
  }

  /** Troca a posição com o vizinho e persiste as duas ordens. */
  async function moverCategoria(id: string, direcao: -1 | 1) {
    const lista = [...categoriasDoPortal];
    const i = lista.findIndex((c) => c.id === id);
    const j = i + direcao;
    if (i < 0 || j < 0 || j >= lista.length) return;
    [lista[i], lista[j]] = [lista[j], lista[i]];

    const comOrdem = lista.map((c, idx) => ({ ...c, ordem: idx }));
    setCategorias((todas) =>
      todas.map((c) => comOrdem.find((x) => x.id === c.id) ?? c),
    );
    for (const c of [comOrdem[i], comOrdem[j]]) {
      const { error } = await supabase
        .from("atendimento_categories").update({ ordem: c.ordem }).eq("id", c.id);
      if (error) { setErro(error.message); return; }
    }
  }

  // ================= ARTIGOS =================

  function abrirArtigo(a?: Artigo) {
    setAbaEditor("escrever");
    setFormArtigo(
      a
        ? {
            id: a.id, titulo: a.titulo, slug: a.slug, categoria: a.category_id ?? "",
            resumo: a.resumo ?? "", conteudo: a.conteudo ?? "", status: a.status, slugManual: true,
          }
        : { ...ARTIGO_VAZIO },
    );
  }

  async function salvarArtigo(novoStatus?: ArtigoStatus) {
    if (!formArtigo || !portalSel) return;
    const titulo = formArtigo.titulo.trim();
    const slug = formArtigo.slug.trim() || paraSlug(titulo);
    if (!titulo || !slug) { setErro("Informe o título do artigo."); return; }

    const status = novoStatus ?? formArtigo.status;
    setSalvando(true); setErro(null);

    const payload = {
      titulo,
      slug,
      category_id: formArtigo.categoria || null,
      resumo: formArtigo.resumo.trim() || null,
      conteudo: formArtigo.conteudo,
      status,
      // published_at só é preenchido na publicação; despublicar/arquivar limpa.
      published_at: status === "publicado" ? new Date().toISOString() : null,
    };

    if (formArtigo.id) {
      const { data, error } = await supabase
        .from("atendimento_articles").update(payload).eq("id", formArtigo.id).select("*").single();
      setSalvando(false);
      if (error) { setErro(error.message); return; }
      setArtigos((p) => p.map((a) => (a.id === formArtigo.id ? (data as Artigo) : a)));
    } else {
      const { data, error } = await supabase
        .from("atendimento_articles")
        .insert({ ...payload, portal_id: portalSel, autor_id: usuarioId })
        .select("*").single();
      setSalvando(false);
      if (error) { setErro(error.message); return; }
      setArtigos((p) => [data as Artigo, ...p]);
    }
    setFormArtigo(null);
  }

  /** Muda só o status de um artigo já salvo (ações rápidas da tabela). */
  async function mudarStatus(a: Artigo, status: ArtigoStatus) {
    const { data, error } = await supabase
      .from("atendimento_articles")
      .update({ status, published_at: status === "publicado" ? new Date().toISOString() : null })
      .eq("id", a.id).select("*").single();
    if (error) { setErro(error.message); return; }
    setArtigos((p) => p.map((x) => (x.id === a.id ? (data as Artigo) : x)));
  }

  async function excluirArtigo(a: Artigo) {
    if (!confirm(`Excluir o artigo "${a.titulo}"?`)) return;
    const { error } = await supabase.from("atendimento_articles").delete().eq("id", a.id);
    if (error) { setErro(error.message); return; }
    setArtigos((p) => p.filter((x) => x.id !== a.id));
  }

  const portal = portais.find((p) => p.id === portalSel) ?? null;

  return (
    <PageShell>
      <PageHeader
        titulo="Central de Ajuda"
        descricao="Portais, categorias e artigos de autoatendimento."
        acoes={
          <Button size="sm" variant="gold" onClick={() => setFormPortal({ ...PORTAL_VAZIO })}>
            <Plus size={15} /> Novo portal
          </Button>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* ================= PORTAIS ================= */}
      {portais.length === 0 ? (
        <EmptyState
          icone={<BookOpen size={34} />}
          titulo="Nenhum portal ainda"
          descricao="Crie um portal para começar a publicar artigos de ajuda."
          acao={
            <Button size="sm" variant="gold" onClick={() => setFormPortal({ ...PORTAL_VAZIO })}>
              <Plus size={15} /> Criar portal
            </Button>
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {portais.map((p) => {
            const total = artigos.filter((a) => a.portal_id === p.id).length;
            const ativo = p.id === portalSel;
            return (
              // Não usamos <button> no cartão porque ele contém botões de
              // ação dentro (aninhar <button> é HTML inválido).
              <div
                key={p.id}
                role="button"
                tabIndex={0}
                onClick={() => setPortalSel(p.id)}
                onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setPortalSel(p.id); }}
                className={`cursor-pointer text-left rounded-xl border bg-card p-4 transition-colors ${
                  ativo ? "border-arini dark:border-gold ring-1 ring-arini/30 dark:ring-gold/30" : "hover:bg-muted/40"
                }`}
              >
                <div className="flex items-start gap-3">
                  <span
                    className="mt-0.5 h-8 w-8 shrink-0 rounded-lg flex items-center justify-center"
                    style={{ background: p.cor }}
                  >
                    <BookOpen size={16} className="text-white" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="text-sm font-semibold truncate">{p.nome}</h3>
                      {!p.ativo && (
                        <span className="text-[10px] rounded-full border px-1.5 py-0.5 text-muted-foreground">
                          inativo
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-muted-foreground font-mono truncate">/{p.slug}</p>
                    <p className="text-xs text-muted-foreground mt-1.5">
                      {total} {total === 1 ? "artigo" : "artigos"} · {p.idioma}
                    </p>
                  </div>
                </div>
                <div className="mt-3 flex items-center gap-1">
                  <Button
                    size="sm" variant="ghost"
                    onClick={(e) => {
                      e.stopPropagation();
                      setFormPortal({
                        id: p.id, nome: p.nome, slug: p.slug, descricao: p.descricao ?? "",
                        cor: p.cor, idioma: p.idioma, dominio: p.dominio_customizado ?? "",
                        ativo: p.ativo, slugManual: true,
                      });
                    }}
                  >
                    <Pencil size={13} /> Editar
                  </Button>
                  <Button
                    size="sm" variant="ghost"
                    className="text-muted-foreground hover:text-red-600"
                    onClick={(e) => { e.stopPropagation(); void excluirPortal(p); }}
                  >
                    <Trash2 size={13} />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ================= CATEGORIAS + ARTIGOS ================= */}
      {portal && (
        <div className="grid gap-4 lg:grid-cols-3 items-start">
          {/* --- Categorias --- */}
          <Card
            titulo="Categorias"
            descricao={portal.nome}
            acoes={
              <Button size="sm" variant="outline" onClick={() => setFormCategoria({ ...CATEGORIA_VAZIA })}>
                <Plus size={14} />
              </Button>
            }
          >
            {categoriasDoPortal.length === 0 ? (
              <p className="p-4 text-xs text-muted-foreground">
                Nenhuma categoria. Artigos sem categoria ficam soltos no portal.
              </p>
            ) : (
              <ul className="divide-y">
                {categoriasDoPortal.map((c, idx) => (
                  <li key={c.id} className="p-3 flex items-start gap-2">
                    <LayoutGrid size={14} className="mt-0.5 shrink-0 text-muted-foreground" />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm truncate">{c.nome}</p>
                      <p className="text-[11px] text-muted-foreground font-mono truncate">{c.slug}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {artigos.filter((a) => a.category_id === c.id).length} artigo(s)
                      </p>
                    </div>
                    <div className="flex items-center gap-0.5 shrink-0">
                      <button
                        type="button" title="Subir" disabled={idx === 0}
                        onClick={() => void moverCategoria(c.id, -1)}
                        className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowUp size={13} />
                      </button>
                      <button
                        type="button" title="Descer" disabled={idx === categoriasDoPortal.length - 1}
                        onClick={() => void moverCategoria(c.id, 1)}
                        className="p-1 rounded text-muted-foreground hover:bg-muted disabled:opacity-30"
                      >
                        <ArrowDown size={13} />
                      </button>
                      <button
                        type="button" title="Editar"
                        onClick={() =>
                          setFormCategoria({
                            id: c.id, nome: c.nome, slug: c.slug,
                            descricao: c.descricao ?? "", slugManual: true,
                          })
                        }
                        className="p-1 rounded text-muted-foreground hover:bg-muted"
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        type="button" title="Excluir"
                        onClick={() => void excluirCategoria(c)}
                        className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-muted"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          {/* --- Artigos --- */}
          <div className="lg:col-span-2 space-y-3">
            <Card
              titulo="Artigos"
              descricao={`${artigosDoPortal.length} de ${artigos.filter((a) => a.portal_id === portal.id).length} artigo(s)`}
              acoes={
                <Button size="sm" variant="gold" onClick={() => abrirArtigo()}>
                  <Plus size={14} /> Novo artigo
                </Button>
              }
            >
              <div className="p-3 flex flex-wrap items-center gap-2 border-b">
                <div className="relative flex-1 min-w-[180px]">
                  <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
                  <input
                    value={busca}
                    onChange={(e) => setBusca(e.target.value)}
                    placeholder="Buscar por título ou resumo…"
                    className={`${inputCls} pl-8`}
                  />
                </div>
                <SelectInput
                  value={filtroStatus}
                  onChange={(e) => setFiltroStatus(e.target.value as "todos" | ArtigoStatus)}
                  className="w-auto"
                >
                  <option value="todos">Todos os status</option>
                  <option value="rascunho">Rascunho</option>
                  <option value="publicado">Publicado</option>
                  <option value="arquivado">Arquivado</option>
                </SelectInput>
                <SelectInput
                  value={filtroCategoria}
                  onChange={(e) => setFiltroCategoria(e.target.value)}
                  className="w-auto"
                >
                  <option value="todas">Todas as categorias</option>
                  <option value="sem">Sem categoria</option>
                  {categoriasDoPortal.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </SelectInput>
              </div>

              {artigosDoPortal.length === 0 ? (
                <EmptyState
                  icone={<FileText size={30} />}
                  titulo="Nenhum artigo encontrado"
                  descricao="Ajuste os filtros ou crie o primeiro artigo deste portal."
                />
              ) : (
                <Table colunas={["Título", "Categoria", "Status", "Autor", "Views", "Atualizado", ""]}>
                  {artigosDoPortal.map((a) => (
                    <tr key={a.id} className="hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <button
                          type="button"
                          onClick={() => abrirArtigo(a)}
                          className="text-left font-medium hover:text-arini dark:hover:text-gold"
                        >
                          {a.titulo}
                        </button>
                        {a.resumo && (
                          <p className="text-[11px] text-muted-foreground line-clamp-1">{a.resumo}</p>
                        )}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {nomeCategoria(a.category_id)}
                      </td>
                      <td className="px-3 py-2"><Badge status={a.status} /></td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                        {a.autor_id ? (autores[a.autor_id] ?? "—") : "—"}
                      </td>
                      <td className="px-3 py-2 text-muted-foreground">{a.visualizacoes}</td>
                      <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">
                        {formatDateTimeBR(a.updated_at)}
                      </td>
                      <td className="px-3 py-2">
                        <div className="flex items-center justify-end gap-0.5">
                          {a.status !== "publicado" ? (
                            <button
                              type="button" title="Publicar"
                              onClick={() => void mudarStatus(a, "publicado")}
                              className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-emerald-600"
                            >
                              <Eye size={14} />
                            </button>
                          ) : (
                            <button
                              type="button" title="Despublicar"
                              onClick={() => void mudarStatus(a, "rascunho")}
                              className="p-1 rounded text-muted-foreground hover:bg-muted"
                            >
                              <EyeOff size={14} />
                            </button>
                          )}
                          {a.status !== "arquivado" && (
                            <button
                              type="button" title="Arquivar"
                              onClick={() => void mudarStatus(a, "arquivado")}
                              className="p-1 rounded text-muted-foreground hover:bg-muted"
                            >
                              <Archive size={14} />
                            </button>
                          )}
                          <button
                            type="button" title="Editar"
                            onClick={() => abrirArtigo(a)}
                            className="p-1 rounded text-muted-foreground hover:bg-muted"
                          >
                            <Pencil size={14} />
                          </button>
                          <button
                            type="button" title="Excluir"
                            onClick={() => void excluirArtigo(a)}
                            className="p-1 rounded text-muted-foreground hover:text-red-600 hover:bg-muted"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </Table>
              )}
            </Card>
          </div>
        </div>
      )}

      {/* ================= MODAL: PORTAL ================= */}
      <Modal
        aberto={formPortal !== null}
        onFechar={() => setFormPortal(null)}
        titulo={formPortal?.id ? "Editar portal" : "Novo portal"}
        descricao="O slug define a URL pública do portal de ajuda."
        rodape={
          <>
            <Button size="sm" variant="ghost" onClick={() => setFormPortal(null)}>Cancelar</Button>
            <Button size="sm" variant="gold" onClick={() => void salvarPortal()} disabled={salvando}>
              {salvando ? <Spinner /> : null} Salvar
            </Button>
          </>
        }
      >
        {formPortal && (
          <>
            <Field label="Nome" obrigatorio>
              <TextInput
                value={formPortal.nome}
                onChange={(e) => {
                  const nome = e.target.value;
                  setFormPortal((f) =>
                    f ? { ...f, nome, slug: f.slugManual ? f.slug : paraSlug(nome) } : f,
                  );
                }}
                placeholder="Central de Ajuda Arini"
              />
            </Field>
            <Field label="Slug" obrigatorio dica="Gerado do nome, mas você pode editar.">
              <TextInput
                value={formPortal.slug}
                onChange={(e) =>
                  setFormPortal((f) => (f ? { ...f, slug: paraSlug(e.target.value), slugManual: true } : f))
                }
                placeholder="ajuda"
              />
            </Field>
            <Field label="Descrição">
              <TextArea
                value={formPortal.descricao}
                onChange={(e) => setFormPortal((f) => (f ? { ...f, descricao: e.target.value } : f))}
                placeholder="Para que serve este portal…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Cor">
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={formPortal.cor}
                    onChange={(e) => setFormPortal((f) => (f ? { ...f, cor: e.target.value } : f))}
                    className="h-9 w-12 rounded border bg-background"
                  />
                  <TextInput
                    value={formPortal.cor}
                    onChange={(e) => setFormPortal((f) => (f ? { ...f, cor: e.target.value } : f))}
                  />
                </div>
              </Field>
              <Field label="Idioma">
                <SelectInput
                  value={formPortal.idioma}
                  onChange={(e) => setFormPortal((f) => (f ? { ...f, idioma: e.target.value } : f))}
                >
                  {IDIOMAS.map((i) => (
                    <option key={i.valor} value={i.valor}>{i.rotulo}</option>
                  ))}
                </SelectInput>
              </Field>
            </div>
            <Field label="Domínio customizado" dica="Opcional. Ex.: ajuda.arini.com.br (o DNS precisa apontar para cá).">
              <TextInput
                value={formPortal.dominio}
                onChange={(e) => setFormPortal((f) => (f ? { ...f, dominio: e.target.value } : f))}
                placeholder="ajuda.seudominio.com.br"
              />
            </Field>
            <Switch
              checked={formPortal.ativo}
              onChange={(v) => setFormPortal((f) => (f ? { ...f, ativo: v } : f))}
              label="Portal ativo"
              dica="Portais inativos ficam ocultos para o público."
            />
          </>
        )}
      </Modal>

      {/* ================= MODAL: CATEGORIA ================= */}
      <Modal
        aberto={formCategoria !== null}
        onFechar={() => setFormCategoria(null)}
        titulo={formCategoria?.id ? "Editar categoria" : "Nova categoria"}
        rodape={
          <>
            <Button size="sm" variant="ghost" onClick={() => setFormCategoria(null)}>Cancelar</Button>
            <Button size="sm" variant="gold" onClick={() => void salvarCategoria()} disabled={salvando}>
              {salvando ? <Spinner /> : null} Salvar
            </Button>
          </>
        }
      >
        {formCategoria && (
          <>
            <Field label="Nome" obrigatorio>
              <TextInput
                value={formCategoria.nome}
                onChange={(e) => {
                  const nome = e.target.value;
                  setFormCategoria((f) =>
                    f ? { ...f, nome, slug: f.slugManual ? f.slug : paraSlug(nome) } : f,
                  );
                }}
                placeholder="Primeiros passos"
              />
            </Field>
            <Field label="Slug" obrigatorio>
              <TextInput
                value={formCategoria.slug}
                onChange={(e) =>
                  setFormCategoria((f) => (f ? { ...f, slug: paraSlug(e.target.value), slugManual: true } : f))
                }
              />
            </Field>
            <Field label="Descrição">
              <TextArea
                value={formCategoria.descricao}
                onChange={(e) => setFormCategoria((f) => (f ? { ...f, descricao: e.target.value } : f))}
              />
            </Field>
          </>
        )}
      </Modal>

      {/* ================= MODAL: ARTIGO ================= */}
      <Modal
        aberto={formArtigo !== null}
        onFechar={() => setFormArtigo(null)}
        titulo={formArtigo?.id ? "Editar artigo" : "Novo artigo"}
        descricao="Conteúdo em markdown. Use a aba Pré-visualizar para conferir."
        largura="max-w-3xl"
        rodape={
          <>
            <Button size="sm" variant="ghost" onClick={() => setFormArtigo(null)}>Cancelar</Button>
            {formArtigo?.id && formArtigo.status === "publicado" && (
              <Button size="sm" variant="outline" onClick={() => void salvarArtigo("rascunho")} disabled={salvando}>
                <EyeOff size={14} /> Despublicar
              </Button>
            )}
            {formArtigo?.id && formArtigo.status !== "arquivado" && (
              <Button size="sm" variant="outline" onClick={() => void salvarArtigo("arquivado")} disabled={salvando}>
                <Archive size={14} /> Arquivar
              </Button>
            )}
            <Button size="sm" variant="outline" onClick={() => void salvarArtigo("rascunho")} disabled={salvando}>
              Salvar rascunho
            </Button>
            <Button size="sm" variant="gold" onClick={() => void salvarArtigo("publicado")} disabled={salvando}>
              {salvando ? <Spinner /> : <Send size={14} />} Publicar
            </Button>
          </>
        }
      >
        {formArtigo && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Título" obrigatorio className="sm:col-span-2">
                <TextInput
                  value={formArtigo.titulo}
                  onChange={(e) => {
                    const titulo = e.target.value;
                    setFormArtigo((f) =>
                      f ? { ...f, titulo, slug: f.slugManual ? f.slug : paraSlug(titulo) } : f,
                    );
                  }}
                  placeholder="Como agendar uma visita ao imóvel"
                />
              </Field>
              <Field label="Slug" dica="Gerado do título.">
                <TextInput
                  value={formArtigo.slug}
                  onChange={(e) =>
                    setFormArtigo((f) => (f ? { ...f, slug: paraSlug(e.target.value), slugManual: true } : f))
                  }
                />
              </Field>
              <Field label="Categoria">
                <SelectInput
                  value={formArtigo.categoria}
                  onChange={(e) => setFormArtigo((f) => (f ? { ...f, categoria: e.target.value } : f))}
                >
                  <option value="">Sem categoria</option>
                  {categoriasDoPortal.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </SelectInput>
              </Field>
            </div>

            <Field label="Resumo" dica="Aparece na listagem e nos resultados de busca.">
              <TextArea
                value={formArtigo.resumo}
                onChange={(e) => setFormArtigo((f) => (f ? { ...f, resumo: e.target.value } : f))}
                className="min-h-[50px]"
              />
            </Field>

            <div>
              <div className="flex items-center gap-1 mb-1.5">
                {(["escrever", "previa"] as const).map((ab) => (
                  <button
                    key={ab}
                    type="button"
                    onClick={() => setAbaEditor(ab)}
                    className={`px-2.5 py-1 rounded-md text-xs transition-colors ${
                      abaEditor === ab
                        ? "bg-arini/10 text-arini dark:text-gold dark:bg-gold/15 font-medium"
                        : "text-muted-foreground hover:bg-muted"
                    }`}
                  >
                    {ab === "escrever" ? "Escrever" : "Pré-visualizar"}
                  </button>
                ))}
                <span className="ml-auto text-[11px] text-muted-foreground">
                  # título · **negrito** · *itálico* · `código` · - lista · [link](url)
                </span>
              </div>
              {abaEditor === "escrever" ? (
                <TextArea
                  value={formArtigo.conteudo}
                  onChange={(e) => setFormArtigo((f) => (f ? { ...f, conteudo: e.target.value } : f))}
                  className="min-h-[280px] font-mono text-[13px]"
                  placeholder={"## Passo a passo\n\n1. Acesse o site\n2. Escolha o imóvel\n\n**Dica:** fale com o corretor."}
                />
              ) : (
                <div
                  className="min-h-[280px] rounded-md border bg-background px-3 py-2 text-sm overflow-y-auto max-h-[420px]"
                  // Seguro: markdownParaHtml escapa todo o texto do autor antes de gerar as tags.
                  dangerouslySetInnerHTML={{ __html: markdownParaHtml(formArtigo.conteudo) }}
                />
              )}
            </div>

            {formArtigo.id && (
              <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                <Globe size={12} /> Status atual: <Badge status={formArtigo.status} />
              </p>
            )}
          </>
        )}
      </Modal>
    </PageShell>
  );
}
