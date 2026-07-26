"use client";

import { useMemo, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageShell, PageHeader, Modal, Field, TextInput, TextArea, SelectInput,
  Switch, EmptyState, Card, Table, Alerta, Spinner,
} from "@/components/atendimento/ui";
import { formatDateTimeBR } from "@/lib/utils";
import { LEAD_ORIGINS, LEAD_STAGES, type LeadOrigin, type LeadStage } from "@/lib/types";
import {
  Megaphone, Plus, Pencil, Copy, Trash2, Ban, Users, Calculator,
  Send, MonitorSmartphone, Clock,
} from "lucide-react";
import {
  lerPublicoAoVivo, lerPublicoDisparo, PUBLICO_AO_VIVO_VAZIO, PUBLICO_DISPARO_VAZIO,
  type Campanha, type CampanhaAlvoResumo, type CampanhaStatus, type CampanhaTipo,
  type CaixaOpcao, type PublicoAoVivo, type PublicoDisparo,
} from "./tipos";

const STATUS_LABEL: Record<CampanhaStatus, string> = {
  rascunho: "Rascunho",
  agendada: "Agendada",
  enviando: "Enviando",
  concluida: "Concluída",
  cancelada: "Cancelada",
};

const STATUS_CLS: Record<CampanhaStatus, string> = {
  rascunho: "bg-muted text-muted-foreground border-border",
  agendada: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  enviando: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  concluida: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  cancelada: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
};

const ORIGEM_LABEL: Record<LeadOrigin, string> = {
  instagram: "Instagram", facebook: "Facebook", site: "Site", whatsapp: "WhatsApp",
  ligacao: "Ligação", indicacao: "Indicação", trafego_pago: "Tráfego pago",
  placa: "Placa", portal: "Portal", tiktok: "TikTok", messenger: "Messenger", outros: "Outros",
};

function BadgeStatus({ status }: { status: CampanhaStatus }) {
  return (
    <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] ${STATUS_CLS[status]}`}>
      {STATUS_LABEL[status]}
    </span>
  );
}

/** Converte timestamptz -> valor aceito por <input type="datetime-local">. */
function paraDatetimeLocal(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

type FormCampanha = {
  id: string | null;
  tipo: CampanhaTipo;
  nome: string;
  inbox: string;
  mensagem: string;
  agendado: string;
  disparo: PublicoDisparo;
  aoVivo: PublicoAoVivo;
};

type Previa = { total: number; nomes: string[]; ids: string[] } | null;

export function CampaignsManager({
  initialCampanhas, caixas, alvos, usuarioId,
}: {
  initialCampanhas: Campanha[];
  caixas: CaixaOpcao[];
  alvos: CampanhaAlvoResumo[];
  usuarioId: string;
}) {
  const supabase = createSupabaseBrowser();

  const [campanhas, setCampanhas] = useState(initialCampanhas);
  const [aba, setAba] = useState<CampanhaTipo>("disparo");
  const [form, setForm] = useState<FormCampanha | null>(null);
  const [previa, setPrevia] = useState<Previa>(null);
  const [calculando, setCalculando] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  // Contagem de alvos por campanha, calculada uma vez no servidor.
  const totalAlvos = useMemo(() => {
    const mapa: Record<string, number> = {};
    for (const a of alvos) mapa[a.campaign_id] = (mapa[a.campaign_id] ?? 0) + 1;
    return mapa;
  }, [alvos]);

  const lista = campanhas.filter((c) => c.tipo === aba);
  const nomeCaixa = (id: string | null) => caixas.find((c) => c.id === id)?.nome ?? "—";

  function abrirNova(tipo: CampanhaTipo) {
    setPrevia(null); setErro(null);
    setForm({
      id: null, tipo, nome: "", inbox: caixas[0]?.id ?? "", mensagem: "", agendado: "",
      disparo: { ...PUBLICO_DISPARO_VAZIO }, aoVivo: { ...PUBLICO_AO_VIVO_VAZIO },
    });
  }

  function abrirEdicao(c: Campanha) {
    setPrevia(null); setErro(null);
    setForm({
      id: c.id,
      tipo: c.tipo,
      nome: c.nome,
      inbox: c.inbox_id ?? "",
      mensagem: c.mensagem ?? "",
      agendado: paraDatetimeLocal(c.agendado_para),
      disparo: lerPublicoDisparo(c.publico),
      aoVivo: lerPublicoAoVivo(c.publico),
    });
  }

  /** Roda a consulta de audiência em `leads` com os filtros escolhidos. */
  async function calcularPublico() {
    if (!form) return;
    setCalculando(true); setErro(null);
    const f = form.disparo;

    let query = supabase
      .from("leads")
      .select("id, nome, telefone, whatsapp")
      .order("ultima_interacao_em", { ascending: false })
      .limit(5000);

    if (f.etapas.length) query = query.in("stage", f.etapas);
    if (f.origens.length) query = query.in("origem", f.origens);
    if (f.ignorarBloqueados) query = query.eq("bloqueado", false);

    // Filtro "tem conversa aberta": resolvemos em duas etapas porque o
    // PostgREST não faz EXISTS direto sem relacionamento embutido.
    if (f.somenteConversaAberta) {
      const { data: convs, error: convErro } = await supabase
        .from("conversations").select("lead_id").eq("status", "aberta").not("lead_id", "is", null);
      if (convErro) { setCalculando(false); setErro(convErro.message); return; }
      const ids = Array.from(new Set((convs ?? []).map((c) => c.lead_id as string)));
      if (ids.length === 0) {
        setCalculando(false);
        setPrevia({ total: 0, nomes: [], ids: [] });
        return;
      }
      query = query.in("id", ids);
    }

    const { data, error } = await query;
    setCalculando(false);
    if (error) { setErro(error.message); return; }

    // Sem telefone não há como disparar no WhatsApp — descartamos aqui
    // para o número exibido ser o número que realmente vai receber.
    const contatos = (data ?? []).filter((l) => l.telefone || l.whatsapp);
    setPrevia({
      total: contatos.length,
      nomes: contatos.slice(0, 10).map((l) => l.nome as string),
      ids: contatos.map((l) => l.id as string),
    });
  }

  async function salvar() {
    if (!form) return;
    const nome = form.nome.trim();
    if (!nome) { setErro("Dê um nome à campanha."); return; }
    if (!form.mensagem.trim()) { setErro("Escreva a mensagem da campanha."); return; }

    setSalvando(true); setErro(null);

    const publico =
      form.tipo === "disparo"
        ? { ...form.disparo, totalCalculado: previa?.total ?? form.disparo.totalCalculado }
        : form.aoVivo;

    const payload = {
      nome,
      tipo: form.tipo,
      inbox_id: form.inbox || null,
      mensagem: form.mensagem,
      publico,
      agendado_para: form.agendado ? new Date(form.agendado).toISOString() : null,
      // Com agendamento a campanha já nasce "agendada"; sem, fica rascunho
      // esperando o envio manual.
      status: (form.agendado ? "agendada" : "rascunho") as CampanhaStatus,
    };

    let campanhaId = form.id;
    if (form.id) {
      const { data, error } = await supabase
        .from("atendimento_campaigns").update(payload).eq("id", form.id).select("*").single();
      if (error) { setSalvando(false); setErro(error.message); return; }
      setCampanhas((p) => p.map((c) => (c.id === form.id ? (data as Campanha) : c)));
    } else {
      const { data, error } = await supabase
        .from("atendimento_campaigns")
        .insert({ ...payload, criado_por: usuarioId }).select("*").single();
      if (error) { setSalvando(false); setErro(error.message); return; }
      campanhaId = (data as Campanha).id;
      setCampanhas((p) => [data as Campanha, ...p]);
    }

    // Grava os alvos só quando o público foi recalculado nesta edição.
    if (form.tipo === "disparo" && previa && campanhaId) {
      await supabase.from("atendimento_campaign_targets").delete().eq("campaign_id", campanhaId);
      if (previa.ids.length) {
        const linhas = previa.ids.map((leadId) => ({ campaign_id: campanhaId!, lead_id: leadId }));
        // Em lotes de 500 para não estourar o limite de payload do PostgREST.
        for (let i = 0; i < linhas.length; i += 500) {
          const { error } = await supabase
            .from("atendimento_campaign_targets").insert(linhas.slice(i, i + 500));
          if (error) { setSalvando(false); setErro(error.message); return; }
        }
      }
    }

    setSalvando(false);
    setForm(null);
    setPrevia(null);
  }

  async function duplicar(c: Campanha) {
    const { data, error } = await supabase
      .from("atendimento_campaigns")
      .insert({
        nome: `${c.nome} (cópia)`,
        tipo: c.tipo,
        inbox_id: c.inbox_id,
        mensagem: c.mensagem,
        publico: c.publico ?? [],
        agendado_para: null,
        status: "rascunho",
        criado_por: usuarioId,
      })
      .select("*").single();
    if (error) { setErro(error.message); return; }
    setCampanhas((p) => [data as Campanha, ...p]);
  }

  async function cancelar(c: Campanha) {
    if (!confirm(`Cancelar a campanha "${c.nome}"?`)) return;
    const { data, error } = await supabase
      .from("atendimento_campaigns").update({ status: "cancelada" }).eq("id", c.id).select("*").single();
    if (error) { setErro(error.message); return; }
    setCampanhas((p) => p.map((x) => (x.id === c.id ? (data as Campanha) : x)));
  }

  async function excluir(c: Campanha) {
    if (!confirm(`Excluir a campanha "${c.nome}" e seus alvos?`)) return;
    const { error } = await supabase.from("atendimento_campaigns").delete().eq("id", c.id);
    if (error) { setErro(error.message); return; }
    setCampanhas((p) => p.filter((x) => x.id !== c.id));
  }

  function alternar<T extends string>(atuais: T[], valor: T): T[] {
    return atuais.includes(valor) ? atuais.filter((v) => v !== valor) : [...atuais, valor];
  }

  const contador = form?.mensagem.length ?? 0;

  return (
    <PageShell>
      <PageHeader
        titulo="Campanhas"
        descricao="Disparo de mensagens para contatos e campanhas ao vivo no widget do site."
        acoes={
          <Button size="sm" variant="gold" onClick={() => abrirNova(aba)}>
            <Plus size={15} /> Nova campanha
          </Button>
        }
      />

      {/* Abas por tipo */}
      <div className="flex items-center gap-1 border-b">
        {([
          { id: "disparo" as const, label: "Disparo (WhatsApp)", icon: Send },
          { id: "ao_vivo" as const, label: "Ao vivo (widget do site)", icon: MonitorSmartphone },
        ]).map((t) => {
          const Icon = t.icon;
          const ativa = aba === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setAba(t.id)}
              className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition-colors ${
                ativa
                  ? "border-arini text-arini dark:text-gold dark:border-gold font-medium"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={15} /> {t.label}
            </button>
          );
        })}
      </div>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {/* Aviso honesto: a tela salva e calcula, mas não dispara sozinha. */}
      {aba === "disparo" && (
        <Alerta tipo="atencao">
          <strong>O envio em massa ainda não dispara sozinho.</strong> Aqui a campanha fica salva e o
          público é calculado e gravado em <code>atendimento_campaign_targets</code>, mas falta o
          worker/cron que percorre esses alvos chamando <code>/api/atendimento/send</code>. Além disso,
          disparo em massa no WhatsApp exige <strong>template aprovado pela Meta</strong> — texto livre
          para quem não escreveu nas últimas 24h é bloqueado pela própria API.
        </Alerta>
      )}
      {aba === "ao_vivo" && (
        <Alerta tipo="atencao">
          A campanha ao vivo grava as condições de exibição (URL e tempo na página), mas o widget do
          site ainda não lê essas regras — falta o script do widget consultar as campanhas ativas.
        </Alerta>
      )}

      <Card>
        {lista.length === 0 ? (
          <EmptyState
            icone={<Megaphone size={34} />}
            titulo={aba === "disparo" ? "Nenhuma campanha de disparo" : "Nenhuma campanha ao vivo"}
            descricao={
              aba === "disparo"
                ? "Crie uma campanha, selecione o público a partir dos contatos e agende o envio."
                : "Crie uma mensagem proativa que aparece para quem está navegando no site."
            }
            acao={
              <Button size="sm" variant="gold" onClick={() => abrirNova(aba)}>
                <Plus size={15} /> Nova campanha
              </Button>
            }
          />
        ) : (
          <Table
            colunas={["Nome", "Tipo", "Status", "Público", "Agendamento", "Enviados / falhas", "Criada em", ""]}
          >
            {lista.map((c) => (
              <tr key={c.id} className="hover:bg-muted/30">
                <td className="px-3 py-2">
                  <button
                    type="button"
                    onClick={() => abrirEdicao(c)}
                    className="text-left font-medium hover:text-arini dark:hover:text-gold"
                  >
                    {c.nome}
                  </button>
                  <p className="text-[11px] text-muted-foreground">{nomeCaixa(c.inbox_id)}</p>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {c.tipo === "disparo" ? "Disparo" : "Ao vivo"}
                </td>
                <td className="px-3 py-2"><BadgeStatus status={c.status} /></td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  <span className="inline-flex items-center gap-1">
                    <Users size={13} /> {totalAlvos[c.id] ?? 0}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">
                  {c.agendado_para ? formatDateTimeBR(c.agendado_para) : "Manual"}
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                  {c.enviados} / <span className={c.falhas > 0 ? "text-red-600 dark:text-red-400" : ""}>{c.falhas}</span>
                </td>
                <td className="px-3 py-2 text-muted-foreground whitespace-nowrap text-xs">
                  {formatDateTimeBR(c.created_at)}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center justify-end gap-0.5">
                    <button
                      type="button" title="Editar" onClick={() => abrirEdicao(c)}
                      className="p-1 rounded text-muted-foreground hover:bg-muted"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button" title="Duplicar" onClick={() => void duplicar(c)}
                      className="p-1 rounded text-muted-foreground hover:bg-muted"
                    >
                      <Copy size={14} />
                    </button>
                    {c.status !== "cancelada" && c.status !== "concluida" && (
                      <button
                        type="button" title="Cancelar" onClick={() => void cancelar(c)}
                        className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-amber-600"
                      >
                        <Ban size={14} />
                      </button>
                    )}
                    <button
                      type="button" title="Excluir" onClick={() => void excluir(c)}
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

      {/* ================= MODAL DE CAMPANHA ================= */}
      <Modal
        aberto={form !== null}
        onFechar={() => { setForm(null); setPrevia(null); }}
        largura="max-w-3xl"
        titulo={
          form?.id
            ? "Editar campanha"
            : form?.tipo === "ao_vivo" ? "Nova campanha ao vivo" : "Nova campanha de disparo"
        }
        descricao={
          form?.tipo === "ao_vivo"
            ? "Mensagem proativa exibida no widget do site conforme as condições abaixo."
            : "Mensagem enviada para uma lista de contatos filtrada do CRM."
        }
        rodape={
          <>
            <Button size="sm" variant="ghost" onClick={() => { setForm(null); setPrevia(null); }}>
              Cancelar
            </Button>
            <Button size="sm" variant="gold" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Spinner /> : null} Salvar campanha
            </Button>
          </>
        }
      >
        {form && (
          <>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Nome da campanha" obrigatorio className="sm:col-span-2">
                <TextInput
                  value={form.nome}
                  onChange={(e) => setForm((f) => (f ? { ...f, nome: e.target.value } : f))}
                  placeholder={form.tipo === "ao_vivo" ? "Boas-vindas na página de imóveis" : "Reativação de leads frios"}
                />
              </Field>
              <Field label="Caixa de entrada" dica="Por onde a mensagem sai.">
                <SelectInput
                  value={form.inbox}
                  onChange={(e) => setForm((f) => (f ? { ...f, inbox: e.target.value } : f))}
                >
                  <option value="">Nenhuma</option>
                  {caixas.map((c) => (
                    <option key={c.id} value={c.id}>{c.nome}</option>
                  ))}
                </SelectInput>
              </Field>
              {form.tipo === "disparo" && (
                <Field
                  label="Agendamento"
                  dica="Deixe vazio para enviar manualmente depois."
                >
                  <TextInput
                    type="datetime-local"
                    value={form.agendado}
                    onChange={(e) => setForm((f) => (f ? { ...f, agendado: e.target.value } : f))}
                  />
                </Field>
              )}
            </div>

            <Field
              label="Mensagem"
              obrigatorio
              dica="Variáveis disponíveis: {{nome}} e {{telefone}} — são trocadas pelos dados do contato no momento do envio."
            >
              <TextArea
                value={form.mensagem}
                onChange={(e) => setForm((f) => (f ? { ...f, mensagem: e.target.value } : f))}
                className="min-h-[110px]"
                placeholder={"Olá {{nome}}! Temos novidades de imóveis na sua faixa de interesse."}
              />
            </Field>
            <p className="-mt-2 text-[11px] text-muted-foreground text-right">{contador} caractere(s)</p>

            {/* ---------- Público (disparo) ---------- */}
            {form.tipo === "disparo" && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <Users size={15} className="text-arini dark:text-gold" />
                  <h4 className="text-sm font-semibold">Seletor de público</h4>
                </div>

                <div>
                  <p className="text-xs font-medium mb-1.5">Etapa do funil</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_STAGES.map((s) => {
                      const on = form.disparo.etapas.includes(s.key);
                      return (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() =>
                            setForm((f) =>
                              f ? { ...f, disparo: { ...f.disparo, etapas: alternar<LeadStage>(f.disparo.etapas, s.key) } } : f,
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            on
                              ? "border-arini bg-arini/10 text-arini dark:text-gold dark:border-gold dark:bg-gold/15"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {s.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div>
                  <p className="text-xs font-medium mb-1.5">Origem</p>
                  <div className="flex flex-wrap gap-1.5">
                    {LEAD_ORIGINS.map((o) => {
                      const on = form.disparo.origens.includes(o);
                      return (
                        <button
                          key={o}
                          type="button"
                          onClick={() =>
                            setForm((f) =>
                              f ? { ...f, disparo: { ...f.disparo, origens: alternar<LeadOrigin>(f.disparo.origens, o) } } : f,
                            )
                          }
                          className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                            on
                              ? "border-arini bg-arini/10 text-arini dark:text-gold dark:border-gold dark:bg-gold/15"
                              : "text-muted-foreground hover:bg-muted"
                          }`}
                        >
                          {ORIGEM_LABEL[o]}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <p className="text-[11px] text-muted-foreground">
                  Nenhum filtro marcado = todos os contatos daquele critério.
                </p>

                <Switch
                  checked={form.disparo.somenteConversaAberta}
                  onChange={(v) =>
                    setForm((f) => (f ? { ...f, disparo: { ...f.disparo, somenteConversaAberta: v } } : f))
                  }
                  label="Somente contatos com conversa aberta"
                  dica="Dentro da janela de 24h do WhatsApp você pode mandar texto livre."
                />
                <Switch
                  checked={form.disparo.ignorarBloqueados}
                  onChange={(v) =>
                    setForm((f) => (f ? { ...f, disparo: { ...f.disparo, ignorarBloqueados: v } } : f))
                  }
                  label="Ignorar contatos bloqueados"
                />

                <div className="flex items-center gap-3 flex-wrap pt-1">
                  <Button size="sm" variant="outline" onClick={() => void calcularPublico()} disabled={calculando}>
                    {calculando ? <Spinner /> : <Calculator size={14} />} Calcular público
                  </Button>
                  {previa && (
                    <span className="text-sm">
                      <strong className="text-arini dark:text-gold">{previa.total}</strong> contato(s) selecionado(s)
                    </span>
                  )}
                </div>

                {previa && previa.nomes.length > 0 && (
                  <div className="rounded-md bg-muted/40 p-2.5">
                    <p className="text-[11px] text-muted-foreground mb-1">Primeiros contatos:</p>
                    <p className="text-xs">
                      {previa.nomes.join(", ")}
                      {previa.total > previa.nomes.length && ` … e mais ${previa.total - previa.nomes.length}`}
                    </p>
                  </div>
                )}
                {previa && previa.total === 0 && (
                  <Alerta tipo="atencao">
                    Nenhum contato bate com esses filtros (contatos sem telefone são descartados).
                  </Alerta>
                )}
                {!previa && (
                  <p className="text-[11px] text-muted-foreground">
                    Os alvos só são regravados se você clicar em “Calcular público” antes de salvar.
                  </p>
                )}
              </div>
            )}

            {/* ---------- Condições (ao vivo) ---------- */}
            {form.tipo === "ao_vivo" && (
              <div className="rounded-lg border p-3 space-y-3">
                <div className="flex items-center gap-2">
                  <MonitorSmartphone size={15} className="text-arini dark:text-gold" />
                  <h4 className="text-sm font-semibold">Condições de exibição</h4>
                </div>
                <Field label="URL contém" dica="Ex.: /imoveis — deixe vazio para exibir em todas as páginas.">
                  <TextInput
                    value={form.aoVivo.urlContem}
                    onChange={(e) =>
                      setForm((f) => (f ? { ...f, aoVivo: { ...f.aoVivo, urlContem: e.target.value } } : f))
                    }
                    placeholder="/imoveis"
                  />
                </Field>
                <Field label="Tempo na página (segundos)" dica="Espera antes de abrir a mensagem.">
                  <TextInput
                    type="number"
                    min={0}
                    value={form.aoVivo.tempoNaPaginaSeg}
                    onChange={(e) =>
                      setForm((f) =>
                        f ? { ...f, aoVivo: { ...f.aoVivo, tempoNaPaginaSeg: Number(e.target.value) || 0 } } : f,
                      )
                    }
                  />
                </Field>
                <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
                  <Clock size={12} /> A campanha aparece quando as duas condições forem verdadeiras.
                </p>
              </div>
            )}
          </>
        )}
      </Modal>
    </PageShell>
  );
}
