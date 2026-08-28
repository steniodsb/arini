"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pencil, Plus, X } from "lucide-react";
import {
  SECTOR_LABELS, ESCALAS, DIAS_SEMANA_LABELS,
  type Colaborador, type Sector,
} from "@/lib/types";
import { fmtCarga } from "@/lib/ponto";

const SETORES = Object.keys(SECTOR_LABELS) as Sector[];

/** "123.456.789-01" enquanto digita. Só formatação — a validação é a de baixo. */
function mascaraCpf(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 11);
  return d
    .replace(/^(\d{3})(\d)/, "$1.$2")
    .replace(/^(\d{3})\.(\d{3})(\d)/, "$1.$2.$3")
    .replace(/\.(\d{3})(\d{1,2})$/, ".$1-$2");
}

/**
 * Dígitos verificadores do CPF.
 *
 * Não é rigor burocrático: CPF é a chave `unique` da tabela e vai para o
 * relatório de ponto, que é documento trabalhista. Um dígito trocado só
 * apareceria meses depois, num relatório que não bate com a folha — e aí
 * já não dá para saber qual dos dois está errado.
 */
function cpfValido(v: string): boolean {
  const d = v.replace(/\D/g, "");
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const dv = (base: string, peso: number) => {
    const soma = [...base].reduce((s, n, i) => s + Number(n) * (peso - i), 0);
    const r = (soma * 10) % 11;
    return r === 10 ? 0 : r;
  };
  return dv(d.slice(0, 9), 10) === Number(d[9]) && dv(d.slice(0, 10), 11) === Number(d[10]);
}

const VAZIO = {
  nome: "", cpf: "", setor: "" as Sector | "", cargo: "", codigo: "",
  carga_horas: "8", carga_min: "0",
  almoco_inicio: "12:00", almoco_min: "60",
  pausa_inicio: "", pausa_min: "15",
  dias_semana: [1, 2, 3, 4, 5] as number[],
  ativo: true,
};

export function ColaboradoresManager({ initial }: { initial: Colaborador[] }) {
  const router = useRouter();
  const [lista, setLista] = useState(initial);
  const [form, setForm] = useState<typeof VAZIO | null>(null);
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  function abrirNovo() {
    setEditandoId(null);
    setErro(null);
    setForm({ ...VAZIO });
  }

  function abrirEdicao(c: Colaborador) {
    setEditandoId(c.id);
    setErro(null);
    setForm({
      nome: c.nome,
      cpf: c.cpf ? mascaraCpf(c.cpf) : "",
      setor: c.setor ?? "",
      cargo: c.cargo ?? "",
      codigo: c.codigo ?? "",
      carga_horas: String(Math.floor(c.carga_horaria_min / 60)),
      carga_min: String(c.carga_horaria_min % 60),
      almoco_inicio: c.almoco_inicio?.slice(0, 5) ?? "",
      almoco_min: String(c.almoco_min),
      pausa_inicio: c.pausa_inicio?.slice(0, 5) ?? "",
      pausa_min: String(c.pausa_min),
      dias_semana: c.dias_semana,
      ativo: c.ativo,
    });
  }

  async function salvar() {
    if (!form) return;
    setErro(null);

    if (!form.nome.trim()) return setErro("O nome é obrigatório.");
    if (form.cpf.trim() && !cpfValido(form.cpf)) return setErro("CPF inválido — confira os dígitos.");
    if (form.dias_semana.length === 0) return setErro("Escolha ao menos um dia de trabalho.");

    const carga = Number(form.carga_horas) * 60 + Number(form.carga_min);
    if (!Number.isFinite(carga) || carga <= 0 || carga > 24 * 60) {
      return setErro("Carga horária inválida.");
    }

    const payload = {
      nome: form.nome.trim(),
      // Guarda só dígitos: a máscara é da tela, e comparar CPF formatado
      // com não formatado é como duplicata entra numa coluna `unique`.
      cpf: form.cpf.trim() ? form.cpf.replace(/\D/g, "") : null,
      setor: form.setor || null,
      cargo: form.cargo.trim() || null,
      codigo: form.codigo.trim() || null,
      carga_horaria_min: carga,
      almoco_inicio: form.almoco_inicio || null,
      almoco_min: Number(form.almoco_min) || 0,
      pausa_inicio: form.pausa_inicio || null,
      pausa_min: Number(form.pausa_min) || 0,
      dias_semana: form.dias_semana,
      ativo: form.ativo,
    };

    setSalvando(true);
    const supabase = createSupabaseBrowser();
    const { data, error } = editandoId
      ? await supabase.from("colaboradores").update(payload).eq("id", editandoId).select("*").single()
      : await supabase.from("colaboradores").insert(payload).select("*").single();
    setSalvando(false);

    if (error) {
      // 23505 = unique. Dizer "já existe" é útil; dizer o texto cru do
      // Postgres não é.
      setErro(
        error.code === "23505"
          ? "Já existe colaborador com esse CPF ou código."
          : `Não foi possível salvar: ${error.message}`,
      );
      return;
    }

    const salvo = data as Colaborador;
    setLista((l) =>
      editandoId ? l.map((c) => (c.id === salvo.id ? salvo : c)) : [...l, salvo].sort((a, b) => a.nome.localeCompare(b.nome)),
    );
    setForm(null);
    setEditandoId(null);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {!form && (
        <Button variant="gold" onClick={abrirNovo}>
          <Plus size={16} /> Novo colaborador
        </Button>
      )}

      {form && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>{editandoId ? "Editar colaborador" : "Novo colaborador"}</CardTitle>
            <button type="button" onClick={() => { setForm(null); setEditandoId(null); }} aria-label="Fechar">
              <X size={16} />
            </button>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <Label htmlFor="c-nome">Nome *</Label>
                <Input id="c-nome" value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="c-cpf">CPF</Label>
                <Input
                  id="c-cpf"
                  value={form.cpf}
                  inputMode="numeric"
                  placeholder="000.000.000-00"
                  onChange={(e) => setForm({ ...form, cpf: mascaraCpf(e.target.value) })}
                />
              </div>
              <div>
                <Label htmlFor="c-setor">Setor</Label>
                <select
                  id="c-setor"
                  value={form.setor}
                  onChange={(e) => setForm({ ...form, setor: e.target.value as Sector })}
                  className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                >
                  <option value="">—</option>
                  {SETORES.map((s) => <option key={s} value={s}>{SECTOR_LABELS[s]}</option>)}
                </select>
              </div>
              <div>
                <Label htmlFor="c-cargo">Cargo</Label>
                <Input id="c-cargo" value={form.cargo} onChange={(e) => setForm({ ...form, cargo: e.target.value })} />
              </div>
              <div>
                <Label htmlFor="c-codigo">Código no terminal</Label>
                <Input
                  id="c-codigo"
                  value={form.codigo}
                  placeholder="ex.: 101"
                  onChange={(e) => setForm({ ...form, codigo: e.target.value })}
                />
                <p className="text-[11px] text-muted-foreground mt-1">
                  Para bater ponto sem digitar CPF na frente da fila.
                </p>
              </div>
            </div>

            <div className="border-t pt-3 space-y-3">
              <p className="text-sm font-medium text-arini">Jornada</p>

              <div className="grid sm:grid-cols-3 gap-3">
                <div>
                  <Label>Carga horária por dia</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      type="number" min={0} max={24} value={form.carga_horas}
                      onChange={(e) => setForm({ ...form, carga_horas: e.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">h</span>
                    <Input
                      type="number" min={0} max={59} value={form.carga_min}
                      onChange={(e) => setForm({ ...form, carga_min: e.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="c-almoco">Almoço</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="c-almoco" type="time" value={form.almoco_inicio}
                      onChange={(e) => setForm({ ...form, almoco_inicio: e.target.value })}
                    />
                    <Input
                      type="number" min={0} value={form.almoco_min}
                      onChange={(e) => setForm({ ...form, almoco_min: e.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>
                <div>
                  <Label htmlFor="c-pausa">Pausa (café)</Label>
                  <div className="flex items-center gap-1">
                    <Input
                      id="c-pausa" type="time" value={form.pausa_inicio}
                      onChange={(e) => setForm({ ...form, pausa_inicio: e.target.value })}
                    />
                    <Input
                      type="number" min={0} value={form.pausa_min}
                      onChange={(e) => setForm({ ...form, pausa_min: e.target.value })}
                    />
                    <span className="text-sm text-muted-foreground">min</span>
                  </div>
                </div>
              </div>

              <div>
                <Label>Escala</Label>
                <div className="flex flex-wrap gap-2 mt-1">
                  {ESCALAS.map((e) => (
                    <button
                      key={e.key}
                      type="button"
                      onClick={() => setForm({ ...form, dias_semana: e.dias })}
                      className={`px-3 py-1 rounded-md text-xs border ${
                        form.dias_semana.join() === e.dias.join()
                          ? "bg-arini text-white border-arini"
                          : "hover:bg-muted"
                      }`}
                    >
                      {e.label}
                    </button>
                  ))}
                </div>
                {/* Escala fora das prontas existe (folga na quarta, meio período
                    no sábado). Os botões acima são atalho, não a única forma. */}
                <div className="flex gap-1 mt-2">
                  {DIAS_SEMANA_LABELS.map((lbl, i) => {
                    const on = form.dias_semana.includes(i);
                    return (
                      <button
                        key={lbl}
                        type="button"
                        aria-pressed={on}
                        onClick={() =>
                          setForm({
                            ...form,
                            dias_semana: on
                              ? form.dias_semana.filter((d) => d !== i)
                              : [...form.dias_semana, i].sort(),
                          })
                        }
                        className={`w-11 py-1 rounded-md text-xs border ${
                          on ? "bg-gold/20 border-gold text-arini" : "text-muted-foreground hover:bg-muted"
                        }`}
                      >
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>

              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.ativo}
                  onChange={(e) => setForm({ ...form, ativo: e.target.checked })}
                />
                Ativo — aparece no terminal de ponto
              </label>
            </div>

            {erro && <p className="text-sm text-red-600">{erro}</p>}

            <div className="flex gap-2">
              <Button variant="gold" onClick={salvar} disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
              <Button variant="outline" onClick={() => { setForm(null); setEditandoId(null); }}>
                Cancelar
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader><CardTitle>Colaboradores ({lista.length})</CardTitle></CardHeader>
        <CardContent className="overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="text-left text-xs uppercase text-muted-foreground">
              <tr>
                <th className="py-2">Nome</th><th>Código</th><th>Setor</th>
                <th>Jornada</th><th>Escala</th><th>Status</th><th />
              </tr>
            </thead>
            <tbody>
              {lista.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="py-2">
                    <div className="font-medium">{c.nome}</div>
                    {c.cargo && <div className="text-xs text-muted-foreground">{c.cargo}</div>}
                  </td>
                  <td className="text-muted-foreground">{c.codigo ?? "—"}</td>
                  <td>{c.setor ? <Badge variant="outline">{SECTOR_LABELS[c.setor]}</Badge> : "—"}</td>
                  <td>{fmtCarga(c.carga_horaria_min)}</td>
                  <td className="text-xs text-muted-foreground">
                    {c.dias_semana.map((d) => DIAS_SEMANA_LABELS[d]).join(", ")}
                  </td>
                  <td><Badge variant={c.ativo ? "success" : "muted"}>{c.ativo ? "Ativo" : "Inativo"}</Badge></td>
                  <td className="text-right">
                    <Button variant="outline" size="sm" onClick={() => abrirEdicao(c)}>
                      <Pencil size={13} /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
              {lista.length === 0 && (
                <tr><td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Nenhum colaborador cadastrado. É este cadastro que faz o ponto valer por
                  pessoa em vez de por login do setor.
                </td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
