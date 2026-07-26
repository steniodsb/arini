"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Modal, Field, TextInput, TextArea, Switch,
  EmptyState, Card, Table, Alerta, Spinner,
} from "@/components/atendimento/ui";
import type { SlaPolicy } from "@/lib/types";
import { Plus, Pencil, Trash2, Timer } from "lucide-react";

/** "90" → "1 h 30 min". Ajuda quem digita minutos a enxergar o prazo real. */
function formatarMinutos(min: number | null): string {
  if (min == null || min <= 0) return "—";
  const dias = Math.floor(min / 1440);
  const horas = Math.floor((min % 1440) / 60);
  const restantes = min % 60;
  const partes: string[] = [];
  if (dias) partes.push(`${dias} d`);
  if (horas) partes.push(`${horas} h`);
  if (restantes) partes.push(`${restantes} min`);
  return partes.join(" ");
}

/** Campo de minutos com o prazo escrito por extenso logo abaixo. */
function CampoMinutos({
  label, dica, valor, onChange,
}: {
  label: string;
  dica: string;
  valor: string;
  onChange: (v: string) => void;
}) {
  const num = valor.trim() === "" ? null : Number(valor);
  const valido = num != null && Number.isFinite(num) && num > 0;
  return (
    <Field
      label={label}
      dica={valido ? `${num} min = ${formatarMinutos(num)}` : dica}
    >
      <TextInput
        type="number"
        min={0}
        value={valor}
        onChange={(e) => onChange(e.target.value)}
        placeholder="em minutos (vazio = não monitora)"
      />
    </Field>
  );
}

type Rascunho = {
  id: string | null;
  nome: string;
  descricao: string;
  primeira: string;
  proxima: string;
  resolucao: string;
  apenasComercial: boolean;
};

const VAZIO: Rascunho = {
  id: null, nome: "", descricao: "",
  primeira: "", proxima: "", resolucao: "", apenasComercial: true,
};

export function SlaManager({ initial }: { initial: SlaPolicy[] }) {
  const [politicas, setPoliticas] = useState(initial);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [excluindo, setExcluindo] = useState<SlaPolicy | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const supabase = () => createSupabaseBrowser();
  const paraNumero = (v: string) => (v.trim() === "" ? null : Math.max(0, Number(v) || 0) || null);

  function novo() { setRascunho({ ...VAZIO }); setErro(null); }
  function editar(p: SlaPolicy) {
    setErro(null);
    setRascunho({
      id: p.id,
      nome: p.nome,
      descricao: p.descricao ?? "",
      primeira: p.primeira_resposta_min?.toString() ?? "",
      proxima: p.proxima_resposta_min?.toString() ?? "",
      resolucao: p.resolucao_min?.toString() ?? "",
      apenasComercial: p.apenas_horario_comercial,
    });
  }

  async function salvar() {
    if (!rascunho || !rascunho.nome.trim()) return;
    setSalvando(true);
    setErro(null);
    const payload = {
      nome: rascunho.nome.trim(),
      descricao: rascunho.descricao.trim() || null,
      primeira_resposta_min: paraNumero(rascunho.primeira),
      proxima_resposta_min: paraNumero(rascunho.proxima),
      resolucao_min: paraNumero(rascunho.resolucao),
      apenas_horario_comercial: rascunho.apenasComercial,
    };

    const sb = supabase();
    const { data, error } = rascunho.id
      ? await sb.from("atendimento_sla_policies").update(payload).eq("id", rascunho.id).select("*").single()
      : await sb.from("atendimento_sla_policies").insert(payload).select("*").single();
    setSalvando(false);
    if (error) { setErro(error.message); return; }

    const salva = data as SlaPolicy;
    setPoliticas((p) =>
      (rascunho.id ? p.map((x) => (x.id === salva.id ? salva : x)) : [...p, salva])
        .sort((a, b) => a.nome.localeCompare(b.nome)),
    );
    setRascunho(null);
  }

  async function excluir() {
    if (!excluindo) return;
    const { error } = await supabase().from("atendimento_sla_policies").delete().eq("id", excluindo.id);
    if (error) { setErro(error.message); setExcluindo(null); return; }
    setPoliticas((p) => p.filter((x) => x.id !== excluindo.id));
    setExcluindo(null);
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Políticas de SLA"
        descricao="Prazos de resposta e resolução aplicados às conversas."
        acoes={
          <Button type="button" variant="gold" size="sm" onClick={novo}>
            <Plus size={15} /> Nova política
          </Button>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {politicas.length === 0 ? (
        <EmptyState
          icone={<Timer size={34} />}
          titulo="Nenhuma política de SLA"
          descricao="Crie uma política para acompanhar prazos de primeira resposta e de resolução."
          acao={
            <Button type="button" variant="gold" size="sm" onClick={novo}>
              <Plus size={15} /> Nova política
            </Button>
          }
        />
      ) : (
        <Card>
          <Table colunas={["Nome", "1ª resposta", "Próxima resposta", "Resolução", "Só horário comercial", ""]}>
            {politicas.map((p) => (
              <tr key={p.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <div className="font-medium">{p.nome}</div>
                  {p.descricao && <div className="text-xs text-muted-foreground">{p.descricao}</div>}
                </td>
                <td className="px-3 py-2 whitespace-nowrap">{formatarMinutos(p.primeira_resposta_min)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatarMinutos(p.proxima_resposta_min)}</td>
                <td className="px-3 py-2 whitespace-nowrap">{formatarMinutos(p.resolucao_min)}</td>
                <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                  {p.apenas_horario_comercial ? "Sim" : "Não"}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-1">
                    <button
                      type="button"
                      onClick={() => editar(p)}
                      className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                      aria-label="Editar"
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      onClick={() => setExcluindo(p)}
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
        titulo={rascunho?.id ? "Editar política" : "Nova política de SLA"}
        descricao="Deixe um prazo vazio para não monitorar aquele marco."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRascunho(null)}>Cancelar</Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => void salvar()}
              disabled={salvando || !rascunho?.nome.trim()}
            >
              {salvando && <Spinner />} Salvar
            </Button>
          </>
        }
      >
        {rascunho && (
          <>
            <Field label="Nome" obrigatorio>
              <TextInput
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                placeholder="Ex.: Prioritário"
                autoFocus
              />
            </Field>
            <Field label="Descrição">
              <TextArea
                value={rascunho.descricao}
                onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                placeholder="Quando esta política se aplica."
              />
            </Field>
            <CampoMinutos
              label="Primeira resposta"
              dica="Tempo máximo até a primeira resposta do agente."
              valor={rascunho.primeira}
              onChange={(v) => setRascunho({ ...rascunho, primeira: v })}
            />
            <CampoMinutos
              label="Próxima resposta"
              dica="Tempo máximo entre respostas ao longo da conversa."
              valor={rascunho.proxima}
              onChange={(v) => setRascunho({ ...rascunho, proxima: v })}
            />
            <CampoMinutos
              label="Resolução"
              dica="Tempo máximo até a conversa ser resolvida."
              valor={rascunho.resolucao}
              onChange={(v) => setRascunho({ ...rascunho, resolucao: v })}
            />
            <Switch
              checked={rascunho.apenasComercial}
              onChange={(v) => setRascunho({ ...rascunho, apenasComercial: v })}
              label="Contar apenas o horário comercial"
              dica="Com isso ligado, o relógio do SLA pausa fora do expediente da caixa."
            />
          </>
        )}
      </Modal>

      <Modal
        aberto={excluindo != null}
        onFechar={() => setExcluindo(null)}
        titulo="Excluir política"
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
          Excluir <strong>{excluindo?.nome}</strong>? As conversas que usam esta política ficam sem SLA.
        </p>
      </Modal>
    </div>
  );
}
