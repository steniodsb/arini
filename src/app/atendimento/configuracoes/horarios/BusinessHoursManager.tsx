"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  Field, TextArea, SelectInput, Switch, Card, Alerta, Spinner, inputCls,
} from "@/components/atendimento/ui";
import { WEEKDAY_LABELS, type AtendimentoInbox, type BusinessHour } from "@/lib/types";
import { Check, CalendarClock } from "lucide-react";

// Fusos usados no Brasil — lista curta e explícita evita depender de
// Intl.supportedValuesOf (ausente em navegadores mais antigos).
const FUSOS: { valor: string; label: string }[] = [
  { valor: "America/Sao_Paulo", label: "Brasília (America/Sao_Paulo)" },
  { valor: "America/Manaus", label: "Manaus (America/Manaus)" },
  { valor: "America/Cuiaba", label: "Cuiabá (America/Cuiaba)" },
  { valor: "America/Belem", label: "Belém (America/Belem)" },
  { valor: "America/Fortaleza", label: "Fortaleza (America/Fortaleza)" },
];

type Dia = { dia_semana: number; aberto: boolean; abre: string; fecha: string };

/** O Postgres devolve `time` como "08:00:00"; o input[type=time] quer "08:00". */
function hhmm(t: string | null | undefined): string {
  return (t ?? "08:00").slice(0, 5);
}

/** Monta os 7 dias da caixa, completando os que ainda não existem no banco. */
function montarDias(todos: BusinessHour[], inboxId: string): Dia[] {
  return WEEKDAY_LABELS.map((_, i) => {
    const linha = todos.find((h) => h.inbox_id === inboxId && h.dia_semana === i);
    return {
      dia_semana: i,
      aberto: linha?.aberto ?? (i >= 1 && i <= 5),
      abre: hhmm(linha?.abre),
      fecha: hhmm(linha?.fecha ?? "18:00"),
    };
  });
}

export function BusinessHoursManager({
  inboxes, initialHorarios,
}: {
  inboxes: AtendimentoInbox[];
  initialHorarios: BusinessHour[];
}) {
  const [caixas, setCaixas] = useState(inboxes);
  const [horarios, setHorarios] = useState(initialHorarios);
  const [inboxId, setInboxId] = useState(inboxes[0]?.id ?? "");
  const [dias, setDias] = useState<Dia[]>(() => montarDias(initialHorarios, inboxes[0]?.id ?? ""));
  const [ativo, setAtivo] = useState(inboxes[0]?.horario_comercial_ativo ?? false);
  const [fuso, setFuso] = useState(inboxes[0]?.fuso ?? "America/Sao_Paulo");
  const [ausencia, setAusencia] = useState(inboxes[0]?.mensagem_ausencia ?? "");
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  // Trocar de caixa recarrega o formulário inteiro a partir do estado local.
  useEffect(() => {
    const cx = caixas.find((c) => c.id === inboxId);
    setDias(montarDias(horarios, inboxId));
    setAtivo(cx?.horario_comercial_ativo ?? false);
    setFuso(cx?.fuso ?? "America/Sao_Paulo");
    setAusencia(cx?.mensagem_ausencia ?? "");
    setSalvo(false);
    setErro(null);
    // `horarios`/`caixas` mudam só depois de salvar, quando o form já está certo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inboxId]);

  function setDia(i: number, patch: Partial<Dia>) {
    setDias((p) => p.map((d) => (d.dia_semana === i ? { ...d, ...patch } : d)));
    setSalvo(false);
  }

  function aplicarPadraoComercial() {
    setDias((p) =>
      p.map((d) =>
        d.dia_semana >= 1 && d.dia_semana <= 5
          ? { ...d, aberto: true, abre: "08:00", fecha: "18:00" }
          : { ...d, aberto: false },
      ),
    );
    setSalvo(false);
  }

  async function salvar() {
    if (!inboxId) return;
    setSalvando(true);
    setErro(null);
    const supabase = createSupabaseBrowser();

    // Upsert por (inbox_id, dia_semana): cria as 7 linhas na primeira gravação
    // e atualiza nas seguintes, sem precisar saber os ids.
    const { data: linhas, error: erroHorarios } = await supabase
      .from("atendimento_business_hours")
      .upsert(
        dias.map((d) => ({
          inbox_id: inboxId,
          dia_semana: d.dia_semana,
          aberto: d.aberto,
          abre: d.abre,
          fecha: d.fecha,
        })),
        { onConflict: "inbox_id,dia_semana" },
      )
      .select("*");

    if (erroHorarios) { setSalvando(false); setErro(erroHorarios.message); return; }

    const { error: erroCaixa } = await supabase
      .from("atendimento_inboxes")
      .update({ horario_comercial_ativo: ativo, fuso, mensagem_ausencia: ausencia })
      .eq("id", inboxId);

    setSalvando(false);
    if (erroCaixa) { setErro(erroCaixa.message); return; }

    setHorarios((p) => [
      ...p.filter((h) => h.inbox_id !== inboxId),
      ...((linhas ?? []) as BusinessHour[]),
    ]);
    setCaixas((p) =>
      p.map((c) =>
        c.id === inboxId
          ? { ...c, horario_comercial_ativo: ativo, fuso, mensagem_ausencia: ausencia }
          : c,
      ),
    );
    setSalvo(true);
    setTimeout(() => setSalvo(false), 2500);
  }

  return (
    <div className="max-w-2xl space-y-4">
      <div className="flex items-end gap-3 flex-wrap">
        <Field label="Caixa de entrada" className="min-w-[240px] flex-1">
          <SelectInput value={inboxId} onChange={(e) => setInboxId(e.target.value)}>
            {caixas.map((c) => (
              <option key={c.id} value={c.id}>{c.nome}</option>
            ))}
          </SelectInput>
        </Field>
        <div className="flex items-center gap-2 pb-0.5">
          {salvo && (
            <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
              <Check size={14} /> Salvo
            </span>
          )}
          <Button type="button" variant="gold" size="sm" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? <Spinner /> : <Check size={15} />} Salvar
          </Button>
        </div>
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Card className="p-4 space-y-4">
        <Switch
          checked={ativo}
          onChange={(v) => { setAtivo(v); setSalvo(false); }}
          label="Respeitar horário comercial nesta caixa"
          dica="Fora do horário, o cliente recebe a mensagem de ausência e o SLA pausa."
        />
        <Field label="Fuso horário">
          <SelectInput value={fuso} onChange={(e) => { setFuso(e.target.value); setSalvo(false); }}>
            {FUSOS.map((f) => (
              <option key={f.valor} value={f.valor}>{f.label}</option>
            ))}
          </SelectInput>
        </Field>
      </Card>

      <Card
        titulo="Dias da semana"
        acoes={
          <Button type="button" variant="outline" size="sm" onClick={aplicarPadraoComercial}>
            <CalendarClock size={15} /> Aplicar seg–sex 08:00–18:00 a todos
          </Button>
        }
      >
        <div className="divide-y">
          {dias.map((d) => (
            <div key={d.dia_semana} className="flex items-center gap-3 px-4 py-2.5 flex-wrap">
              <div className="w-28 shrink-0">
                <Switch checked={d.aberto} onChange={(v) => setDia(d.dia_semana, { aberto: v })} />
              </div>
              <span className={`w-20 text-sm ${d.aberto ? "" : "text-muted-foreground"}`}>
                {WEEKDAY_LABELS[d.dia_semana]}
              </span>
              {d.aberto ? (
                <div className="flex items-center gap-2">
                  <input
                    type="time"
                    value={d.abre}
                    onChange={(e) => setDia(d.dia_semana, { abre: e.target.value })}
                    className={`${inputCls} w-[110px]`}
                  />
                  <span className="text-xs text-muted-foreground">até</span>
                  <input
                    type="time"
                    value={d.fecha}
                    onChange={(e) => setDia(d.dia_semana, { fecha: e.target.value })}
                    className={`${inputCls} w-[110px]`}
                  />
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">Fechado</span>
              )}
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-4">
        <Field label="Mensagem fora do horário" dica="Enviada automaticamente quando a caixa está fechada.">
          <TextArea
            value={ausencia}
            onChange={(e) => { setAusencia(e.target.value); setSalvo(false); }}
            placeholder="Nosso atendimento é de segunda a sexta, das 8h às 18h. Deixe sua mensagem que respondemos assim que abrirmos."
          />
        </Field>
      </Card>
    </div>
  );
}
