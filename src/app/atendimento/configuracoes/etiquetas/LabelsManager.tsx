"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Alerta, Card, Field, Modal, TextInput } from "@/components/atendimento/ui";
import { EtiquetaChip } from "@/components/atendimento/Chips";
import { errMessage } from "@/lib/utils";
import { type AtendimentoLabel } from "@/lib/types";
import { Check, Loader2, Pencil, Plus, Tag, Trash2 } from "lucide-react";

// =====================================================================
// Etiquetas — o catálogo de cores da operação.
//
// A cor aqui não é enfeite: é ela que faz o atendente achar "quente" no
// meio de trinta linhas sem ler nenhuma. Por isso a tela mostra o CHIP
// de verdade (o mesmo componente da caixa de entrada) em vez de um
// quadradinho de cor — o que se escolhe é como aquilo vai aparecer lá.
//
// Duas armadilhas tratadas:
//   · a etiqueta vive em DOIS lugares — no catálogo e dentro de
//     `conversations.tags` (texto). Excluir do catálogo não limpa as
//     conversas: o chip continua lá, cinza. A tela avisa e oferece
//     limpar junto.
//   · renomear seguiria a mesma lógica: o nome antigo continuaria nas
//     conversas. Por isso renomear também reescreve as tags.
// =====================================================================

/** Paleta base — tons que se distinguem no claro e no escuro. */
const CORES = [
  "#ef4444", "#f97316", "#f59e0b", "#eab308",
  "#84cc16", "#10b981", "#14b8a6", "#06b6d4",
  "#3b82f6", "#6366f1", "#8b5cf6", "#a855f7",
  "#ec4899", "#f43f5e", "#64748b", "#0f766e",
];

type Form = { id: string | null; nome: string; cor: string; nomeOriginal: string };

export function LabelsManager({
  initial,
  usoPorEtiqueta = {},
}: {
  initial: AtendimentoLabel[];
  /** nome da etiqueta -> em quantas conversas ela está. */
  usoPorEtiqueta?: Record<string, number>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [form, setForm] = useState<Form | null>(null);
  const [excluindo, setExcluindo] = useState<AtendimentoLabel | null>(null);
  const [limparDasConversas, setLimparDasConversas] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const supabase = () => createSupabaseBrowser();

  /** Etiquetas usadas em conversa mas fora do catálogo (órfãs). */
  const orfas = useMemo(
    () =>
      Object.keys(usoPorEtiqueta).filter(
        (nome) => !items.some((i) => i.nome === nome),
      ),
    [usoPorEtiqueta, items],
  );

  async function salvar() {
    if (!form || !form.nome.trim()) return;
    const nome = form.nome.trim().toLowerCase();
    setOcupado(true);
    setErro(null);

    if (form.id) {
      const { error } = await supabase()
        .from("atendimento_labels")
        .update({ nome, cor: form.cor })
        .eq("id", form.id);
      if (error) { setOcupado(false); setErro(errMessage(error)); return; }

      // Renomear no catálogo sem renomear nas conversas deixaria o nome
      // antigo pendurado nelas, sem cor e sem dono.
      if (nome !== form.nomeOriginal) {
        const { error: e2 } = await supabase().rpc("fn_renomear_etiqueta", {
          p_antigo: form.nomeOriginal,
          p_novo: nome,
        });
        // A função pode não existir num banco desatualizado: o cadastro já
        // foi salvo, então avisa em vez de fingir que deu tudo certo.
        if (e2) {
          setErro(
            `Etiqueta renomeada no catálogo, mas as conversas seguem com "${form.nomeOriginal}". ` +
            `Aplique a migração 0047 e renomeie de novo. (${e2.message})`,
          );
        }
      }
      setItems((p) =>
        p.map((l) => (l.id === form.id ? { ...l, nome, cor: form.cor } : l))
          .sort((a, b) => a.nome.localeCompare(b.nome)),
      );
    } else {
      const { data, error } = await supabase()
        .from("atendimento_labels")
        .insert({ nome, cor: form.cor })
        .select("*")
        .single();
      if (error) { setOcupado(false); setErro(errMessage(error)); return; }
      setItems((p) =>
        [...p, data as AtendimentoLabel].sort((a, b) => a.nome.localeCompare(b.nome)),
      );
    }

    setOcupado(false);
    setForm(null);
    router.refresh();
  }

  async function excluir() {
    if (!excluindo) return;
    setOcupado(true);
    setErro(null);

    if (limparDasConversas && (usoPorEtiqueta[excluindo.nome] ?? 0) > 0) {
      const { error } = await supabase().rpc("fn_remover_etiqueta_das_conversas", {
        p_nome: excluindo.nome,
      });
      if (error) {
        setOcupado(false);
        setErro(
          `Não foi possível limpar as conversas (${error.message}). ` +
          "A etiqueta NÃO foi excluída — assim ela não vira um chip cinza sem nome.",
        );
        return;
      }
    }

    const { error } = await supabase().from("atendimento_labels").delete().eq("id", excluindo.id);
    setOcupado(false);
    if (error) { setErro(errMessage(error)); return; }
    setItems((p) => p.filter((x) => x.id !== excluindo.id));
    setExcluindo(null);
    router.refresh();
  }

  return (
    <>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="font-display text-xl text-arini dark:text-gold flex items-center gap-2">
            <Tag size={18} /> Etiquetas
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            A cor é o que faz a etiqueta ser encontrada sem leitura, no meio da lista.
          </p>
        </div>
        <Button
          type="button"
          size="sm"
          onClick={() => {
            setErro(null);
            setForm({ id: null, nome: "", cor: CORES[0], nomeOriginal: "" });
          }}
        >
          <Plus size={15} /> Nova etiqueta
        </Button>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {orfas.length > 0 && (
        <Alerta tipo="atencao">
          <strong>Fora do catálogo:</strong> {orfas.join(", ")}. Estão em conversas mas não existem
          aqui — aparecem em cinza. Crie com o mesmo nome para dar cor a elas.
        </Alerta>
      )}

      <Card titulo="Catálogo" descricao="Clique para editar nome e cor.">
        <div className="divide-y">
          {items.length === 0 && (
            <p className="p-4 text-sm text-muted-foreground">
              Nenhuma etiqueta cadastrada.
            </p>
          )}
          {items.map((l) => {
            const uso = usoPorEtiqueta[l.nome] ?? 0;
            return (
              <div key={l.id} className="flex items-center justify-between gap-3 p-3">
                <div className="flex items-center gap-2 min-w-0">
                  <EtiquetaChip nome={l.nome} cor={l.cor} />
                  <span className="text-[11px] text-muted-foreground truncate">
                    {uso === 0 ? "sem uso" : `em ${uso} conversa${uso === 1 ? "" : "s"}`}
                  </span>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    title="Editar"
                    onClick={() => {
                      setErro(null);
                      setForm({ id: l.id, nome: l.nome, cor: l.cor, nomeOriginal: l.nome });
                    }}
                    className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    title="Excluir"
                    onClick={() => {
                      setErro(null);
                      setLimparDasConversas(true);
                      setExcluindo(l);
                    }}
                    className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      {/* ---------------------------- Criar / editar ---------------------------- */}
      <Modal
        aberto={form !== null}
        onFechar={() => setForm(null)}
        titulo={form?.id ? "Editar etiqueta" : "Nova etiqueta"}
        descricao="O nome é gravado em minúsculas — é assim que ele casa com o que já está nas conversas."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setForm(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void salvar()}
              disabled={ocupado || !form?.nome.trim()}
            >
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Salvar
            </Button>
          </>
        }
      >
        <Field label="Nome" obrigatorio>
          <TextInput
            value={form?.nome ?? ""}
            onChange={(e) => setForm((f) => (f ? { ...f, nome: e.target.value } : f))}
            placeholder="quente"
            autoFocus
          />
        </Field>

        <Field label="Cor">
          <div className="flex flex-wrap gap-1.5">
            {CORES.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setForm((f) => (f ? { ...f, cor: c } : f))}
                style={{ background: c }}
                aria-label={`Cor ${c}`}
                aria-pressed={form?.cor === c}
                className={`h-7 w-7 rounded-full transition-transform ${
                  form?.cor === c ? "ring-2 ring-offset-2 ring-offset-card ring-acao scale-110" : "hover:scale-105"
                }`}
              />
            ))}
          </div>
        </Field>

        <div className="rounded-lg border bg-muted/40 p-3 space-y-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Como vai aparecer
          </div>
          <div className="flex items-center gap-2">
            <EtiquetaChip nome={form?.nome.trim().toLowerCase() || "etiqueta"} cor={form?.cor} />
            <span className="text-[11px] text-muted-foreground">na lista e na conversa</span>
          </div>
        </div>
      </Modal>

      {/* ------------------------------- Excluir ------------------------------- */}
      <Modal
        aberto={excluindo !== null}
        onFechar={() => setExcluindo(null)}
        titulo={`Excluir a etiqueta ${excluindo?.nome ?? ""}?`}
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => void excluir()}
              disabled={ocupado}
            >
              {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              Excluir
            </Button>
          </>
        }
      >
        {excluindo && (usoPorEtiqueta[excluindo.nome] ?? 0) > 0 ? (
          <>
            <Alerta tipo="atencao">
              Está em <strong>{usoPorEtiqueta[excluindo.nome]} conversa(s)</strong>. Excluir só do
              catálogo deixa o nome pendurado nelas, sem cor.
            </Alerta>
            <label className="flex items-start gap-2 text-sm cursor-pointer">
              <input
                type="checkbox"
                checked={limparDasConversas}
                onChange={(e) => setLimparDasConversas(e.target.checked)}
                className="mt-0.5"
              />
              <span>Remover a etiqueta dessas conversas também (recomendado).</span>
            </label>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">
            Não está em nenhuma conversa. Pode excluir com segurança.
          </p>
        )}
      </Modal>
    </>
  );
}
