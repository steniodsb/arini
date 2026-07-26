"use client";

import { useMemo, useState } from "react";
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
  Table,
  TextArea,
  TextInput,
} from "@/components/atendimento/ui";
import type { AtendimentoCompany } from "@/lib/types";
import { errMessage, formatDateBR } from "@/lib/utils";
import { Building2, Plus, Search } from "lucide-react";
import { EmpresaDetalhe } from "./EmpresaDetalhe";

/** Contato (lead) já vinculado a alguma empresa. */
export interface ContatoVinculado {
  id: string;
  nome: string;
  telefone: string | null;
  email: string | null;
  company_id: string;
}

/** Faixas de porte usadas no cadastro (o banco guarda texto livre). */
export const TAMANHOS = ["1-10", "11-50", "51-200", "201-500", "500+"] as const;

interface FormEmpresa {
  nome: string;
  dominio: string;
  telefone: string;
  email: string;
  site: string;
  cidade: string;
  uf: string;
  setor: string;
  tamanho: string;
  observacoes: string;
}

function paraForm(e: AtendimentoCompany | null): FormEmpresa {
  return {
    nome: e?.nome ?? "",
    dominio: e?.dominio ?? "",
    telefone: e?.telefone ?? "",
    email: e?.email ?? "",
    site: e?.site ?? "",
    cidade: e?.cidade ?? "",
    uf: e?.uf ?? "",
    setor: e?.setor ?? "",
    tamanho: e?.tamanho ?? "",
    observacoes: e?.observacoes ?? "",
  };
}

/** Campos de texto vazios viram null — evita string vazia espalhada no banco. */
function nulo(v: string): string | null {
  const t = v.trim();
  return t === "" ? null : t;
}

export function EmpresasList({
  initial,
  contatos,
  usuarioId,
  erroInicial,
}: {
  initial: AtendimentoCompany[];
  contatos: ContatoVinculado[];
  usuarioId: string;
  erroInicial: string | null;
}) {
  const [empresas, setEmpresas] = useState<AtendimentoCompany[]>(initial);
  const [busca, setBusca] = useState("");
  const [erro, setErro] = useState<string | null>(erroInicial);
  const [formAberto, setFormAberto] = useState(false);
  const [editando, setEditando] = useState<AtendimentoCompany | null>(null);
  const [detalheId, setDetalheId] = useState<string | null>(null);

  // Contagem por empresa feita uma vez só, não por linha renderizada.
  const contagem = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of contatos) m.set(c.company_id, (m.get(c.company_id) ?? 0) + 1);
    return m;
  }, [contatos]);

  const filtradas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return empresas;
    return empresas.filter((e) =>
      `${e.nome} ${e.dominio ?? ""} ${e.cidade ?? ""} ${e.setor ?? ""}`.toLowerCase().includes(q),
    );
  }, [empresas, busca]);

  const detalhe = empresas.find((e) => e.id === detalheId) ?? null;

  async function excluir(empresa: AtendimentoCompany) {
    const vinculados = contagem.get(empresa.id) ?? 0;
    const aviso =
      vinculados > 0
        ? `Excluir "${empresa.nome}"? Os ${vinculados} contato(s) vinculados NÃO são apagados — apenas ficam sem empresa.`
        : `Excluir "${empresa.nome}"?`;
    if (!window.confirm(aviso)) return;
    setErro(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_companies").delete().eq("id", empresa.id);
    if (error) {
      setErro(error.message);
      return;
    }
    setEmpresas((p) => p.filter((e) => e.id !== empresa.id));
    setDetalheId(null);
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Empresas"
        descricao={`${empresas.length} empresa(s) cadastrada(s)`}
        acoes={
          <Button
            type="button"
            variant="gold"
            size="sm"
            onClick={() => {
              setEditando(null);
              setFormAberto(true);
            }}
          >
            <Plus size={15} /> Nova empresa
          </Button>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="relative max-w-sm">
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <input
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          placeholder="Buscar por nome, domínio, cidade ou setor…"
          className="w-full rounded-md border bg-background pl-8 pr-2.5 py-1.5 text-sm outline-none focus:ring-2 focus:ring-ring/40"
        />
      </div>

      <Card className="overflow-hidden">
        {filtradas.length === 0 ? (
          <EmptyState
            icone={<Building2 size={34} />}
            titulo="Nenhuma empresa"
            descricao="Cadastre empresas para agrupar contatos e ver o histórico por organização."
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
                <Plus size={15} /> Nova empresa
              </Button>
            }
          />
        ) : (
          <Table colunas={["Nome", "Domínio", "Cidade / UF", "Setor", "Contatos", "Criada em"]}>
            {filtradas.map((e) => (
              <tr
                key={e.id}
                onClick={() => setDetalheId(e.id)}
                className="cursor-pointer hover:bg-muted/40"
              >
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-2 min-w-0">
                    <span className="h-7 w-7 shrink-0 rounded-md bg-arini/10 text-arini dark:text-gold dark:bg-gold/15 flex items-center justify-center">
                      <Building2 size={14} />
                    </span>
                    <span className="truncate font-medium">{e.nome}</span>
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{e.dominio ?? "—"}</td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {[e.cidade, e.uf].filter(Boolean).join(" / ") || "—"}
                </td>
                <td className="px-3 py-2 text-muted-foreground">{e.setor ?? "—"}</td>
                <td className="px-3 py-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-xs">
                    {contagem.get(e.id) ?? 0}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {formatDateBR(e.created_at)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {formAberto && (
        <ModalEmpresa
          key={editando?.id ?? "nova"}
          empresa={editando}
          usuarioId={usuarioId}
          onFechar={() => setFormAberto(false)}
          onSalvo={(e) => {
            setEmpresas((p) => {
              const existe = p.some((x) => x.id === e.id);
              const lista = existe ? p.map((x) => (x.id === e.id ? e : x)) : [...p, e];
              return lista.sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR"));
            });
            setFormAberto(false);
          }}
        />
      )}

      {detalhe && (
        <EmpresaDetalhe
          empresa={detalhe}
          contatos={contatos.filter((c) => c.company_id === detalhe.id)}
          onFechar={() => setDetalheId(null)}
          onEditar={(e) => {
            setEditando(e);
            setFormAberto(true);
          }}
          onExcluir={(e) => void excluir(e)}
        />
      )}
    </PageShell>
  );
}

// =====================================================================
// Modal de criar / editar empresa
// =====================================================================

function ModalEmpresa({
  empresa,
  usuarioId,
  onFechar,
  onSalvo,
}: {
  empresa: AtendimentoCompany | null;
  usuarioId: string;
  onFechar: () => void;
  onSalvo: (e: AtendimentoCompany) => void;
}) {
  const [form, setForm] = useState<FormEmpresa>(() => paraForm(empresa));
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  function set<K extends keyof FormEmpresa>(campo: K, valor: FormEmpresa[K]) {
    setForm((p) => ({ ...p, [campo]: valor }));
  }

  async function salvar() {
    if (!form.nome.trim()) {
      setErro("Informe o nome da empresa.");
      return;
    }
    setSalvando(true);
    setErro(null);

    const dados = {
      nome: form.nome.trim(),
      dominio: nulo(form.dominio),
      telefone: nulo(form.telefone),
      email: nulo(form.email),
      site: nulo(form.site),
      cidade: nulo(form.cidade),
      uf: nulo(form.uf.toUpperCase()),
      setor: nulo(form.setor),
      tamanho: nulo(form.tamanho),
      observacoes: nulo(form.observacoes),
    };

    const supabase = createSupabaseBrowser();
    try {
      const query = empresa
        ? supabase.from("atendimento_companies").update(dados).eq("id", empresa.id)
        : supabase.from("atendimento_companies").insert({ ...dados, created_by: usuarioId });
      const { data, error } = await query.select("*").single();
      if (error) throw new Error(error.message);
      onSalvo(data as AtendimentoCompany);
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
      titulo={empresa ? "Editar empresa" : "Nova empresa"}
      descricao={empresa ? empresa.nome : "Cadastre uma organização para agrupar contatos."}
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
          <TextInput value={form.nome} onChange={(e) => set("nome", e.target.value)} autoFocus />
        </Field>
        <Field label="Domínio" dica="Ex.: arini.com.br">
          <TextInput
            value={form.dominio}
            onChange={(e) => set("dominio", e.target.value)}
            placeholder="empresa.com.br"
          />
        </Field>
        <Field label="Site">
          <TextInput
            type="url"
            value={form.site}
            onChange={(e) => set("site", e.target.value)}
            placeholder="https://…"
          />
        </Field>
        <Field label="Telefone">
          <TextInput value={form.telefone} onChange={(e) => set("telefone", e.target.value)} />
        </Field>
        <Field label="E-mail">
          <TextInput type="email" value={form.email} onChange={(e) => set("email", e.target.value)} />
        </Field>
        <Field label="Cidade">
          <TextInput value={form.cidade} onChange={(e) => set("cidade", e.target.value)} />
        </Field>
        <Field label="UF">
          <TextInput
            value={form.uf}
            maxLength={2}
            onChange={(e) => set("uf", e.target.value.toUpperCase())}
            placeholder="MG"
          />
        </Field>
        <Field label="Setor">
          <TextInput
            value={form.setor}
            onChange={(e) => set("setor", e.target.value)}
            placeholder="Construção, varejo…"
          />
        </Field>
        <Field label="Tamanho">
          <SelectInput value={form.tamanho} onChange={(e) => set("tamanho", e.target.value)}>
            <option value="">Não informado</option>
            {TAMANHOS.map((t) => (
              <option key={t} value={t}>
                {t} funcionários
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Observações" className="sm:col-span-2">
          <TextArea
            value={form.observacoes}
            onChange={(e) => set("observacoes", e.target.value)}
            placeholder="Anotações internas sobre a empresa…"
          />
        </Field>
      </div>
    </Modal>
  );
}
