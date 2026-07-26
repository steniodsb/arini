"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Alerta,
  Card,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  PageShell,
  SelectInput,
  Spinner,
  Switch,
  Table,
  TextArea,
  TextInput,
} from "@/components/atendimento/ui";
import { LEAD_ORIGINS, LEAD_STAGES, type CustomAttributeDef } from "@/lib/types";
import { errMessage, formatDateTimeBR } from "@/lib/utils";
import {
  Ban,
  Building2,
  GitMerge,
  Plus,
  Search,
  ShieldCheck,
  Trash2,
  Upload,
  Users,
} from "lucide-react";
import { ContatoDetalhe } from "./ContatoDetalhe";
import {
  CAMPOS_CSV,
  corEtapa,
  inicialDe,
  parseCSV,
  rotuloEtapa,
  rotuloOrigem,
  type AgenteOpcao,
  type CampoCSV,
  type ContatoInput,
  type ContatoRow,
  type EmpresaOpcao,
} from "./tipos";

const POR_PAGINA = 50;
/** Tamanho do lote no importador — insert único por requisição. */
const LOTE_IMPORT = 100;
/** Colunas que a lista lê do banco ao recarregar (mesma seleção da page.tsx). */
const COLUNAS_LEAD =
  "id, nome, telefone, whatsapp, email, origem, stage, observacoes, company_id, custom_attributes, bloqueado, avatar_url, created_at, ultima_interacao_em";

/**
 * Toda escrita em `leads` passa pela rota de API: a RLS do CRM só deixa os
 * setores recepcao/administrativo gravarem, e o agente de atendimento tem
 * apenas leitura. A rota valida o acesso e grava com a service role.
 */
async function chamarApi<T extends object>(payload: unknown): Promise<T> {
  const res = await fetch("/api/atendimento/contatos", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new Error(json.error ?? `Falha na requisição (${res.status}).`);
  return json;
}

export function ContatosList({
  initial,
  empresas,
  atributos,
  agentes,
  usuarioId,
  erroInicial,
}: {
  initial: ContatoRow[];
  empresas: EmpresaOpcao[];
  atributos: CustomAttributeDef[];
  agentes: AgenteOpcao[];
  usuarioId: string;
  erroInicial: string | null;
}) {
  const [contatos, setContatos] = useState<ContatoRow[]>(initial);
  const [busca, setBusca] = useState("");
  const [filtroEtapa, setFiltroEtapa] = useState("");
  const [filtroOrigem, setFiltroOrigem] = useState("");
  const [filtroEmpresa, setFiltroEmpresa] = useState("");
  const [pagina, setPagina] = useState(0);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [erro, setErro] = useState<string | null>(erroInicial);
  const [ocupado, setOcupado] = useState(false);

  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<ContatoRow | null>(null);
  const [csvAberto, setCsvAberto] = useState(false);
  const [mesclarAberto, setMesclarAberto] = useState(false);
  const [empresaMassaAberto, setEmpresaMassaAberto] = useState(false);
  const [empresaMassa, setEmpresaMassa] = useState("");
  const [detalheId, setDetalheId] = useState<string | null>(null);

  const detalhe = contatos.find((c) => c.id === detalheId) ?? null;
  const nomeEmpresa = (id: string | null) =>
    id ? empresas.find((e) => e.id === id)?.nome ?? "—" : "—";

  const filtrados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    return contatos.filter((c) => {
      if (filtroEtapa && c.stage !== filtroEtapa) return false;
      if (filtroOrigem && c.origem !== filtroOrigem) return false;
      if (filtroEmpresa === "__sem__") {
        if (c.company_id) return false;
      } else if (filtroEmpresa && c.company_id !== filtroEmpresa) {
        return false;
      }
      if (!q) return true;
      return `${c.nome} ${c.telefone ?? ""} ${c.whatsapp ?? ""} ${c.email ?? ""}`
        .toLowerCase()
        .includes(q);
    });
  }, [contatos, busca, filtroEtapa, filtroOrigem, filtroEmpresa]);

  const totalPaginas = Math.max(1, Math.ceil(filtrados.length / POR_PAGINA));
  const paginaAtual = Math.min(pagina, totalPaginas - 1);
  const visiveis = filtrados.slice(paginaAtual * POR_PAGINA, (paginaAtual + 1) * POR_PAGINA);
  const todosDaPagina = visiveis.length > 0 && visiveis.every((c) => selecionados.includes(c.id));

  /** Qualquer mudança de filtro volta para a primeira página. */
  function aplicarFiltro(fn: () => void) {
    fn();
    setPagina(0);
  }

  function alternarSelecao(id: string) {
    setSelecionados((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]));
  }

  function alternarPagina() {
    const idsPagina = visiveis.map((c) => c.id);
    setSelecionados((p) =>
      todosDaPagina ? p.filter((x) => !idsPagina.includes(x)) : Array.from(new Set([...p, ...idsPagina])),
    );
  }

  /** Recarrega a lista do banco (leitura é liberada pela RLS ao atendente). */
  async function recarregar() {
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("leads")
      .select(COLUNAS_LEAD)
      .order("ultima_interacao_em", { ascending: false })
      .limit(500);
    if (error) {
      setErro(error.message);
      return;
    }
    setContatos((data ?? []) as unknown as ContatoRow[]);
  }

  function aplicarAtualizacoes(atualizados: ContatoRow[]) {
    setContatos((p) => p.map((c) => atualizados.find((a) => a.id === c.id) ?? c));
  }

  async function excluir(ids: string[]) {
    if (ids.length === 0) return;
    const msg =
      ids.length === 1
        ? "Excluir este contato? A ação é irreversível e leva junto as notas dele."
        : `Excluir ${ids.length} contatos? A ação é irreversível e leva junto as notas deles.`;
    if (!window.confirm(msg)) return;
    setOcupado(true);
    setErro(null);
    try {
      await chamarApi({ acao: "excluir", ids });
      setContatos((p) => p.filter((c) => !ids.includes(c.id)));
      setSelecionados((p) => p.filter((x) => !ids.includes(x)));
      if (detalheId && ids.includes(detalheId)) setDetalheId(null);
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setOcupado(false);
    }
  }

  async function acaoEmMassa(dados: ContatoInput) {
    if (selecionados.length === 0) return;
    setOcupado(true);
    setErro(null);
    try {
      const r = await chamarApi<{ contatos: ContatoRow[] }>({
        acao: "massa",
        ids: selecionados,
        dados,
      });
      aplicarAtualizacoes(r.contatos ?? []);
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setOcupado(false);
    }
  }

  const selecionadosObj = selecionados
    .map((id) => contatos.find((c) => c.id === id))
    .filter((c): c is ContatoRow => Boolean(c));

  return (
    <PageShell>
      <PageHeader
        titulo="Contatos"
        descricao={`${contatos.length} contatos carregados · ${filtrados.length} no filtro atual`}
        acoes={
          <>
            {/* Atalho para a lista de bloqueados — a ação em massa "Bloquear"
                fica logo abaixo, e sem este link não haveria como rever depois
                quem foi parar lá. */}
            <Button asChild variant="outline" size="sm">
              <Link href="/atendimento/contatos/bloqueados">
                <Ban size={15} /> Bloqueados
              </Link>
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={() => setCsvAberto(true)}>
              <Upload size={15} /> Importar CSV
            </Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => {
                setEditando(null);
                setFormAberto(true);
              }}
            >
              <Plus size={15} /> Novo contato
            </Button>
          </>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* Barra de busca e filtros */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search
            size={14}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
          />
          <input
            value={busca}
            onChange={(e) => aplicarFiltro(() => setBusca(e.target.value))}
            placeholder="Buscar por nome, telefone ou e-mail…"
            className="w-full rounded-md border bg-background pl-8 pr-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
          />
        </div>
        <SelectInput
          value={filtroEtapa}
          onChange={(e) => aplicarFiltro(() => setFiltroEtapa(e.target.value))}
          className="w-auto"
        >
          <option value="">Todas as etapas</option>
          {LEAD_STAGES.map((s) => (
            <option key={s.key} value={s.key}>
              {s.label}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={filtroOrigem}
          onChange={(e) => aplicarFiltro(() => setFiltroOrigem(e.target.value))}
          className="w-auto"
        >
          <option value="">Todas as origens</option>
          {LEAD_ORIGINS.map((o) => (
            <option key={o} value={o}>
              {rotuloOrigem(o)}
            </option>
          ))}
        </SelectInput>
        <SelectInput
          value={filtroEmpresa}
          onChange={(e) => aplicarFiltro(() => setFiltroEmpresa(e.target.value))}
          className="w-auto"
        >
          <option value="">Todas as empresas</option>
          <option value="__sem__">Sem empresa</option>
          {empresas.map((e) => (
            <option key={e.id} value={e.id}>
              {e.nome}
            </option>
          ))}
        </SelectInput>
      </div>

      {/* Seleção e ações em massa */}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={todosDaPagina}
            onChange={alternarPagina}
            disabled={visiveis.length === 0}
            className="h-3.5 w-3.5 accent-current text-arini dark:text-gold"
          />
          <span className="text-muted-foreground">
            {selecionados.length > 0
              ? `${selecionados.length} selecionado(s)`
              : "Selecionar os desta página"}
          </span>
        </label>

        {selecionados.length > 0 && (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => {
                setEmpresaMassa("");
                setEmpresaMassaAberto(true);
              }}
            >
              <Building2 size={14} /> Definir empresa
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => void acaoEmMassa({ bloqueado: true })}
            >
              <Ban size={14} /> Bloquear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado}
              onClick={() => void acaoEmMassa({ bloqueado: false })}
            >
              <ShieldCheck size={14} /> Desbloquear
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={ocupado || selecionados.length !== 2}
              title="Selecione exatamente 2 contatos para mesclar"
              onClick={() => setMesclarAberto(true)}
            >
              <GitMerge size={14} /> Mesclar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={ocupado}
              onClick={() => void excluir(selecionados)}
            >
              <Trash2 size={14} /> Excluir
            </Button>
            {ocupado && <Spinner size={14} />}
          </>
        )}
      </div>

      <Card className="overflow-hidden">
        {filtrados.length === 0 ? (
          <EmptyState
            icone={<Users size={34} />}
            titulo="Nenhum contato encontrado"
            descricao="Ajuste os filtros ou cadastre um contato novo."
            acao={
              <Button
                type="button"
                variant="gold"
                size="sm"
                onClick={() => {
                  setEditando(null);
                  setFormAberto(true);
                }}
              >
                <Plus size={15} /> Novo contato
              </Button>
            }
          />
        ) : (
          <Table
            colunas={["", "Nome", "Telefone", "E-mail", "Empresa", "Etapa", "Última interação"]}
          >
            {visiveis.map((c) => (
              <tr
                key={c.id}
                onClick={() => setDetalheId(c.id)}
                className="cursor-pointer hover:bg-muted/40"
              >
                <td className="px-3 py-2 w-8" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    checked={selecionados.includes(c.id)}
                    onChange={() => alternarSelecao(c.id)}
                    className="h-3.5 w-3.5"
                  />
                </td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="h-7 w-7 shrink-0 rounded-full bg-arini/10 text-arini dark:text-gold dark:bg-gold/15 flex items-center justify-center text-[11px] font-semibold">
                      {inicialDe(c.nome)}
                    </span>
                    <span className="truncate">{c.nome}</span>
                    {c.bloqueado && (
                      <Ban size={12} className="text-red-500 shrink-0" aria-label="Bloqueado" />
                    )}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {c.telefone ?? c.whatsapp ?? "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{c.email ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground">{nomeEmpresa(c.company_id)}</td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-xs whitespace-nowrap">
                    <span className={`h-1.5 w-1.5 rounded-full ${corEtapa(c.stage)}`} />
                    {rotuloEtapa(c.stage)}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {formatDateTimeBR(c.ultima_interacao_em)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* Paginação simples (a lista inteira já está no cliente) */}
      {filtrados.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
          <span>
            Mostrando {paginaAtual * POR_PAGINA + 1}–
            {Math.min((paginaAtual + 1) * POR_PAGINA, filtrados.length)} de {filtrados.length}
          </span>
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={paginaAtual === 0}
              onClick={() => setPagina(paginaAtual - 1)}
            >
              Anterior
            </Button>
            <span>
              {paginaAtual + 1} / {totalPaginas}
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={paginaAtual >= totalPaginas - 1}
              onClick={() => setPagina(paginaAtual + 1)}
            >
              Próxima
            </Button>
          </div>
        </div>
      )}

      {formAberto && (
        <ModalContato
          key={editando?.id ?? "novo"}
          contato={editando}
          empresas={empresas}
          atributos={atributos}
          onFechar={() => setFormAberto(false)}
          onSalvo={(c) => {
            setContatos((p) => {
              const existe = p.some((x) => x.id === c.id);
              return existe ? p.map((x) => (x.id === c.id ? c : x)) : [c, ...p];
            });
            setFormAberto(false);
          }}
        />
      )}

      {csvAberto && (
        <ModalCSV
          onFechar={() => setCsvAberto(false)}
          onImportado={() => void recarregar()}
        />
      )}

      {mesclarAberto && selecionadosObj.length === 2 && (
        <ModalMesclar
          a={selecionadosObj[0]}
          b={selecionadosObj[1]}
          empresas={empresas}
          onFechar={() => setMesclarAberto(false)}
          onMesclado={(destino, origemId) => {
            setContatos((p) =>
              p.filter((c) => c.id !== origemId).map((c) => (c.id === destino.id ? destino : c)),
            );
            setSelecionados([]);
            setMesclarAberto(false);
            if (detalheId === origemId) setDetalheId(destino.id);
          }}
        />
      )}

      <Modal
        aberto={empresaMassaAberto}
        onFechar={() => setEmpresaMassaAberto(false)}
        titulo="Definir empresa"
        descricao={`${selecionados.length} contato(s) selecionado(s).`}
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setEmpresaMassaAberto(false)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              disabled={ocupado}
              onClick={async () => {
                await acaoEmMassa({ company_id: empresaMassa || null });
                setEmpresaMassaAberto(false);
              }}
            >
              Aplicar
            </Button>
          </>
        }
      >
        <Field label="Empresa" dica="Deixe em branco para desvincular os contatos de qualquer empresa.">
          <SelectInput value={empresaMassa} onChange={(e) => setEmpresaMassa(e.target.value)}>
            <option value="">Sem empresa</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </SelectInput>
        </Field>
      </Modal>

      {detalhe && (
        <ContatoDetalhe
          contato={detalhe}
          empresas={empresas}
          atributos={atributos}
          agentes={agentes}
          usuarioId={usuarioId}
          onFechar={() => setDetalheId(null)}
          onEditar={(c) => {
            setEditando(c);
            setFormAberto(true);
          }}
          onExcluir={(c) => void excluir([c.id])}
          onAlterado={(c) => aplicarAtualizacoes([c])}
        />
      )}
    </PageShell>
  );
}

// =====================================================================
// Modal de criar / editar contato
// =====================================================================

interface FormContato {
  nome: string;
  telefone: string;
  whatsapp: string;
  email: string;
  origem: string;
  stage: string;
  company_id: string;
  observacoes: string;
  custom: Record<string, unknown>;
}

function paraForm(c: ContatoRow | null): FormContato {
  return {
    nome: c?.nome ?? "",
    telefone: c?.telefone ?? "",
    whatsapp: c?.whatsapp ?? "",
    email: c?.email ?? "",
    origem: c?.origem ?? "site",
    stage: c?.stage ?? "novo",
    company_id: c?.company_id ?? "",
    observacoes: c?.observacoes ?? "",
    custom: { ...(c?.custom_attributes ?? {}) },
  };
}

/** Remove chaves vazias para não poluir o jsonb com "" e null. */
function limparAtributos(custom: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(custom)) {
    if (v === undefined || v === null || v === "") continue;
    out[k] = v;
  }
  return out;
}

function ModalContato({
  contato,
  empresas,
  atributos,
  onFechar,
  onSalvo,
}: {
  contato: ContatoRow | null;
  empresas: EmpresaOpcao[];
  atributos: CustomAttributeDef[];
  onFechar: () => void;
  onSalvo: (c: ContatoRow) => void;
}) {
  const [form, setForm] = useState<FormContato>(() => paraForm(contato));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function set<K extends keyof FormContato>(campo: K, valor: FormContato[K]) {
    setForm((p) => ({ ...p, [campo]: valor }));
  }

  async function salvar() {
    // `leads.nome` é NOT NULL no banco — barramos antes de bater na API.
    if (!form.nome.trim()) {
      setErro("Informe o nome do contato.");
      return;
    }
    setSalvando(true);
    setErro(null);
    const dados: ContatoInput = {
      nome: form.nome.trim(),
      telefone: form.telefone,
      whatsapp: form.whatsapp,
      email: form.email,
      origem: form.origem,
      stage: form.stage,
      company_id: form.company_id || null,
      observacoes: form.observacoes,
      custom_attributes: limparAtributos(form.custom),
    };
    try {
      const r = await chamarApi<{ contato: ContatoRow }>(
        contato ? { acao: "atualizar", id: contato.id, dados } : { acao: "criar", dados },
      );
      onSalvo(r.contato);
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={contato ? "Editar contato" : "Novo contato"}
      descricao={contato ? contato.nome : "Cadastre uma pessoa na base de contatos."}
      largura="max-w-2xl"
      rodape={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          <Button type="button" variant="gold" size="sm" disabled={salvando} onClick={() => void salvar()}>
            {salvando ? <Spinner size={14} /> : "Salvar"}
          </Button>
        </>
      }
    >
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Nome" obrigatorio className="sm:col-span-2">
          <TextInput
            value={form.nome}
            onChange={(e) => set("nome", e.target.value)}
            placeholder="Nome completo"
            autoFocus
          />
        </Field>
        <Field label="Telefone">
          <TextInput
            value={form.telefone}
            onChange={(e) => set("telefone", e.target.value)}
            placeholder="(00) 0000-0000"
          />
        </Field>
        <Field label="WhatsApp">
          <TextInput
            value={form.whatsapp}
            onChange={(e) => set("whatsapp", e.target.value)}
            placeholder="(00) 00000-0000"
          />
        </Field>
        <Field label="E-mail" className="sm:col-span-2">
          <TextInput
            type="email"
            value={form.email}
            onChange={(e) => set("email", e.target.value)}
            placeholder="contato@exemplo.com"
          />
        </Field>
        <Field label="Origem">
          <SelectInput value={form.origem} onChange={(e) => set("origem", e.target.value)}>
            {LEAD_ORIGINS.map((o) => (
              <option key={o} value={o}>
                {rotuloOrigem(o)}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Etapa do funil">
          <SelectInput value={form.stage} onChange={(e) => set("stage", e.target.value)}>
            {LEAD_STAGES.map((s) => (
              <option key={s.key} value={s.key}>
                {s.label}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Empresa" className="sm:col-span-2">
          <SelectInput value={form.company_id} onChange={(e) => set("company_id", e.target.value)}>
            <option value="">Sem empresa</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <TextArea
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Anotações internas sobre o contato…"
          />
        </Field>
      </div>

      {atributos.length > 0 && (
        <div className="space-y-3 pt-1 border-t">
          <h3 className="text-xs font-semibold pt-3">Atributos personalizados</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            {atributos.map((def) => (
              <CampoAtributo
                key={def.id}
                def={def}
                valor={form.custom[def.chave]}
                onChange={(v) => setForm((p) => ({ ...p, custom: { ...p.custom, [def.chave]: v } }))}
              />
            ))}
          </div>
        </div>
      )}
    </Modal>
  );
}

/** Renderiza o campo conforme o `tipo` da definição do atributo. */
function CampoAtributo({
  def,
  valor,
  onChange,
}: {
  def: CustomAttributeDef;
  valor: unknown;
  onChange: (v: unknown) => void;
}) {
  const texto = valor === undefined || valor === null ? "" : String(valor);
  const dica = def.descricao ?? undefined;

  if (def.tipo === "booleano") {
    return (
      <div className="flex items-center pt-5">
        <Switch checked={valor === true} onChange={onChange} label={def.nome} dica={dica} />
      </div>
    );
  }

  return (
    <Field label={def.nome} dica={dica}>
      {def.tipo === "lista" ? (
        <SelectInput value={texto} onChange={(e) => onChange(e.target.value || undefined)}>
          <option value="">—</option>
          {def.opcoes.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </SelectInput>
      ) : def.tipo === "numero" ? (
        <TextInput
          type="number"
          value={texto}
          onChange={(e) => onChange(e.target.value === "" ? undefined : Number(e.target.value))}
        />
      ) : def.tipo === "data" ? (
        <TextInput type="date" value={texto} onChange={(e) => onChange(e.target.value || undefined)} />
      ) : def.tipo === "link" ? (
        <TextInput
          type="url"
          placeholder="https://…"
          value={texto}
          onChange={(e) => onChange(e.target.value || undefined)}
        />
      ) : (
        <TextInput value={texto} onChange={(e) => onChange(e.target.value || undefined)} />
      )}
    </Field>
  );
}

// =====================================================================
// Modal de importação de CSV
// =====================================================================

/** Palpite de mapeamento a partir do cabeçalho (sem acento, minúsculo). */
function adivinharMapa(cabecalho: string[]): (CampoCSV | "")[] {
  return cabecalho.map((h) => {
    const n = h
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    if (n.includes("whats")) return "whatsapp";
    if (n.includes("mail") || n === "e-mail") return "email";
    if (n.includes("tel") || n.includes("fone") || n.includes("celular")) return "telefone";
    if (n.includes("origem") || n.includes("fonte")) return "origem";
    if (n.includes("nome") || n.includes("contato") || n.includes("cliente")) return "nome";
    return "";
  });
}

function ModalCSV({ onFechar, onImportado }: { onFechar: () => void; onImportado: () => void }) {
  const [texto, setTexto] = useState("");
  const [linhas, setLinhas] = useState<string[][]>([]);
  const [temCabecalho, setTemCabecalho] = useState(true);
  const [mapa, setMapa] = useState<(CampoCSV | "")[]>([]);
  const [importando, setImportando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [resultado, setResultado] = useState<{
    importados: number;
    falhas: { linha: number; erro: string }[];
  } | null>(null);

  function processar(conteudo: string) {
    setTexto(conteudo);
    setResultado(null);
    setErro(null);
    const l = parseCSV(conteudo);
    setLinhas(l);
    setMapa(adivinharMapa(l[0] ?? []));
  }

  function lerArquivo(file: File | undefined) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => processar(String(reader.result ?? ""));
    reader.onerror = () => setErro("Não foi possível ler o arquivo.");
    reader.readAsText(file, "utf-8");
  }

  const cabecalho = linhas[0] ?? [];
  const corpo = temCabecalho ? linhas.slice(1) : linhas;
  const preview = corpo.slice(0, 5);
  const colunaNome = mapa.indexOf("nome");

  async function importar() {
    if (colunaNome < 0) {
      setErro("Mapeie alguma coluna para o campo Nome — ele é obrigatório.");
      return;
    }
    setImportando(true);
    setErro(null);

    const falhas: { linha: number; erro: string }[] = [];
    const prontos: { indice: number; dados: ContatoInput }[] = [];
    const deslocamento = temCabecalho ? 2 : 1; // nº da linha no arquivo original

    corpo.forEach((linha, i) => {
      const dados: ContatoInput = {};
      mapa.forEach((campo, col) => {
        if (!campo) return;
        const v = (linha[col] ?? "").trim();
        // Atribuição campo a campo: `nome` é string e os demais aceitam null.
        if (campo === "nome") dados.nome = v;
        else if (campo === "origem") dados.origem = v.toLowerCase() || "outros";
        else if (campo === "telefone") dados.telefone = v || null;
        else if (campo === "whatsapp") dados.whatsapp = v || null;
        else if (campo === "email") dados.email = v || null;
      });
      if (!dados.nome) {
        falhas.push({ linha: i + deslocamento, erro: "Nome vazio." });
        return;
      }
      prontos.push({ indice: i, dados });
    });

    let importados = 0;
    try {
      for (let i = 0; i < prontos.length; i += LOTE_IMPORT) {
        const lote = prontos.slice(i, i + LOTE_IMPORT);
        const r = await chamarApi<{
          importados: number;
          falhas: { linha: number; erro: string }[];
        }>({ acao: "importar", linhas: lote.map((x) => x.dados) });
        importados += r.importados;
        for (const f of r.falhas ?? []) {
          // A API devolve o índice dentro do lote; traduzimos para a linha do arquivo.
          falhas.push({ linha: (lote[f.linha]?.indice ?? f.linha) + deslocamento, erro: f.erro });
        }
      }
      setResultado({ importados, falhas });
      if (importados > 0) onImportado();
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setImportando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Importar contatos de CSV"
      descricao="Cole o conteúdo ou envie um arquivo. Reconhecemos vírgula, ponto e vírgula e tabulação."
      largura="max-w-3xl"
      rodape={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Fechar
          </Button>
          <Button
            type="button"
            variant="gold"
            size="sm"
            disabled={importando || corpo.length === 0}
            onClick={() => void importar()}
          >
            {importando ? <Spinner size={14} /> : `Importar ${corpo.length} linha(s)`}
          </Button>
        </>
      }
    >
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {resultado && (
        <Alerta tipo={resultado.falhas.length > 0 ? "atencao" : "sucesso"}>
          <p className="font-medium">
            {resultado.importados} importados, {resultado.falhas.length} falharam.
          </p>
          {resultado.falhas.length > 0 && (
            <ul className="mt-1 space-y-0.5 max-h-32 overflow-y-auto">
              {resultado.falhas.slice(0, 50).map((f, i) => (
                <li key={i}>
                  Linha {f.linha}: {f.erro}
                </li>
              ))}
            </ul>
          )}
        </Alerta>
      )}

      <div className="grid gap-3">
        <Field label="Arquivo CSV">
          <input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => lerArquivo(e.target.files?.[0])}
            className="block w-full text-xs text-muted-foreground file:mr-3 file:rounded-md file:border file:bg-muted file:px-3 file:py-1.5 file:text-xs file:text-foreground"
          />
        </Field>
        <Field label="Ou cole o CSV aqui">
          <TextArea
            value={texto}
            onChange={(e) => processar(e.target.value)}
            placeholder={"nome;telefone;email\nMaria Silva;(34) 99999-0000;maria@exemplo.com"}
            rows={4}
          />
        </Field>
      </div>

      {linhas.length > 0 && (
        <>
          <Switch
            checked={temCabecalho}
            onChange={setTemCabecalho}
            label="A primeira linha é o cabeçalho"
            dica="Desmarque se o arquivo já começa nos dados."
          />

          <div>
            <h3 className="text-xs font-semibold mb-2">Mapeamento das colunas</h3>
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full text-xs">
                <thead className="bg-muted/40">
                  <tr>
                    {cabecalho.map((h, i) => (
                      <th key={i} className="px-2 py-2 text-left align-top min-w-[140px]">
                        <div className="text-muted-foreground truncate mb-1">
                          {temCabecalho ? h || `Coluna ${i + 1}` : `Coluna ${i + 1}`}
                        </div>
                        <SelectInput
                          value={mapa[i] ?? ""}
                          onChange={(e) =>
                            setMapa((p) => {
                              const n = [...p];
                              n[i] = e.target.value as CampoCSV | "";
                              return n;
                            })
                          }
                          className="text-xs py-1"
                        >
                          <option value="">Ignorar</option>
                          {CAMPOS_CSV.map((c) => (
                            <option key={c.chave} value={c.chave}>
                              {c.label}
                            </option>
                          ))}
                        </SelectInput>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {preview.map((linha, i) => (
                    <tr key={i}>
                      {cabecalho.map((_, col) => (
                        <td key={col} className="px-2 py-1.5 text-muted-foreground truncate max-w-[200px]">
                          {linha[col] ?? ""}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Prévia das {preview.length} primeiras de {corpo.length} linha(s). A importação vai em
              lotes de {LOTE_IMPORT}.
            </p>
          </div>
        </>
      )}
    </Modal>
  );
}

// =====================================================================
// Modal de mesclagem
// =====================================================================

const CAMPOS_MESCLA = [
  { chave: "nome", label: "Nome" },
  { chave: "telefone", label: "Telefone" },
  { chave: "whatsapp", label: "WhatsApp" },
  { chave: "email", label: "E-mail" },
  { chave: "origem", label: "Origem" },
  { chave: "stage", label: "Etapa" },
  { chave: "company_id", label: "Empresa" },
  { chave: "observacoes", label: "Observações" },
] as const;

type CampoMescla = (typeof CAMPOS_MESCLA)[number]["chave"];

function exibirCampo(c: ContatoRow, campo: CampoMescla, empresas: EmpresaOpcao[]): string {
  switch (campo) {
    case "origem":
      return rotuloOrigem(c.origem);
    case "stage":
      return rotuloEtapa(c.stage);
    case "company_id":
      return empresas.find((e) => e.id === c.company_id)?.nome ?? "—";
    default:
      return c[campo] ?? "—";
  }
}

function ModalMesclar({
  a,
  b,
  empresas,
  onFechar,
  onMesclado,
}: {
  a: ContatoRow;
  b: ContatoRow;
  empresas: EmpresaOpcao[];
  onFechar: () => void;
  onMesclado: (destino: ContatoRow, origemId: string) => void;
}) {
  // Padrão: fica o valor de A, mas se A estiver vazio aproveitamos o de B.
  const [escolhas, setEscolhas] = useState<Record<CampoMescla, "a" | "b">>(() => {
    const inicial = {} as Record<CampoMescla, "a" | "b">;
    for (const campo of CAMPOS_MESCLA) {
      inicial[campo.chave] = a[campo.chave] ? "a" : b[campo.chave] ? "b" : "a";
    }
    return inicial;
  });
  const [manter, setManter] = useState<"a" | "b">("a");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function confirmar() {
    const destino = manter === "a" ? a : b;
    const origem = manter === "a" ? b : a;
    const pick = (campo: CampoMescla) => (escolhas[campo] === "a" ? a : b);

    const dados: ContatoInput = {
      nome: pick("nome").nome,
      telefone: pick("telefone").telefone,
      whatsapp: pick("whatsapp").whatsapp,
      email: pick("email").email,
      origem: pick("origem").origem,
      stage: pick("stage").stage,
      company_id: pick("company_id").company_id,
      observacoes: pick("observacoes").observacoes,
      // Atributos personalizados são somados; em conflito, o contato mantido vence.
      custom_attributes: { ...origem.custom_attributes, ...destino.custom_attributes },
    };

    setSalvando(true);
    setErro(null);
    try {
      const r = await chamarApi<{ contato: ContatoRow }>({
        acao: "mesclar",
        destinoId: destino.id,
        origemId: origem.id,
        dados,
      });
      onMesclado(r.contato, origem.id);
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo="Mesclar contatos"
      descricao="Escolha qual valor fica em cada campo. Conversas e notas do contato descartado passam para o contato mantido."
      largura="max-w-3xl"
      rodape={
        <>
          <Button type="button" variant="ghost" size="sm" onClick={onFechar}>
            Cancelar
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            disabled={salvando}
            onClick={() => void confirmar()}
          >
            {salvando ? <Spinner size={14} /> : "Mesclar e excluir o duplicado"}
          </Button>
        </>
      }
    >
      <Alerta tipo="atencao">
        Ação irreversível: o contato descartado é excluído em definitivo.
      </Alerta>
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Field label="Contato que permanece" dica="O outro registro será apagado depois da mesclagem.">
        <SelectInput value={manter} onChange={(e) => setManter(e.target.value as "a" | "b")}>
          <option value="a">{a.nome}</option>
          <option value="b">{b.nome}</option>
        </SelectInput>
      </Field>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Campo</th>
              <th className="px-3 py-2 text-left font-medium">{a.nome}</th>
              <th className="px-3 py-2 text-left font-medium">{b.nome}</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {CAMPOS_MESCLA.map((campo) => (
              <tr key={campo.chave}>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">{campo.label}</td>
                {(["a", "b"] as const).map((lado) => (
                  <td key={lado} className="px-3 py-2">
                    <label className="flex items-start gap-2 cursor-pointer">
                      <input
                        type="radio"
                        name={`mesclar-${campo.chave}`}
                        checked={escolhas[campo.chave] === lado}
                        onChange={() => setEscolhas((p) => ({ ...p, [campo.chave]: lado }))}
                        className="mt-0.5 shrink-0"
                      />
                      <span className="break-words">
                        {exibirCampo(lado === "a" ? a : b, campo.chave, empresas)}
                      </span>
                    </label>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Modal>
  );
}
