"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Modal, Field, TextInput, TextArea, SelectInput, Switch,
  EmptyState, Card, Alerta, Spinner,
} from "@/components/atendimento/ui";
import type { AtendimentoInbox, InboxChannel, PreChatField, AgentOption } from "@/lib/types";
import {
  Inbox as InboxIcon, Plus, ArrowLeft, Trash2, Check, Settings2, Users,
  MessageSquareText, Shuffle, ClipboardList, Star,
} from "lucide-react";

// Rótulos amigáveis dos canais — o enum do banco é técnico demais para a tela.
const CANAL_LABELS: Record<InboxChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  telegram: "Telegram",
  email: "E-mail",
  sms: "SMS",
  site: "Site (widget)",
  api: "API",
};
const CANAIS = Object.keys(CANAL_LABELS) as InboxChannel[];

const TIPOS_PRE_CHAT: PreChatField["tipo"][] = ["texto", "email", "telefone", "lista"];
const TIPO_PRE_CHAT_LABELS: Record<PreChatField["tipo"], string> = {
  texto: "Texto",
  email: "E-mail",
  telefone: "Telefone",
  lista: "Lista",
};

type Membro = { inbox_id: string; profile_id: string };
type Aba = "geral" | "agentes" | "mensagens" | "atribuicao" | "prechat" | "csat";

const ABAS: { id: Aba; label: string; icon: typeof Settings2 }[] = [
  { id: "geral", label: "Geral", icon: Settings2 },
  { id: "agentes", label: "Agentes", icon: Users },
  { id: "mensagens", label: "Mensagens automáticas", icon: MessageSquareText },
  { id: "atribuicao", label: "Atribuição", icon: Shuffle },
  { id: "prechat", label: "Pré-chat", icon: ClipboardList },
  { id: "csat", label: "CSAT", icon: Star },
];

export function InboxesManager({
  initialInboxes, initialMembers, agents,
}: {
  initialInboxes: AtendimentoInbox[];
  initialMembers: Membro[];
  agents: AgentOption[];
}) {
  const [inboxes, setInboxes] = useState(initialInboxes);
  const [membros, setMembros] = useState<Membro[]>(initialMembers);
  const [selecionada, setSelecionada] = useState<string | null>(null);
  const [aba, setAba] = useState<Aba>("geral");
  // Rascunho: edições ficam locais até o "Salvar" (evita gravar a cada tecla).
  const [rascunho, setRascunho] = useState<AtendimentoInbox | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);

  const [modalNova, setModalNova] = useState(false);
  const [novoNome, setNovoNome] = useState("");
  const [novoCanal, setNovoCanal] = useState<InboxChannel>("whatsapp");
  const [novoAtivo, setNovoAtivo] = useState(true);
  const [criando, setCriando] = useState(false);
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  const supabase = () => createSupabaseBrowser();

  function abrir(cx: AtendimentoInbox) {
    setSelecionada(cx.id);
    setRascunho({ ...cx, pre_chat_campos: [...(cx.pre_chat_campos ?? [])] });
    setAba("geral");
    setErro(null);
    setSalvo(false);
  }

  function voltar() {
    setSelecionada(null);
    setRascunho(null);
    setErro(null);
  }

  function set<K extends keyof AtendimentoInbox>(campo: K, valor: AtendimentoInbox[K]) {
    setRascunho((p) => (p ? { ...p, [campo]: valor } : p));
    setSalvo(false);
  }

  async function criar() {
    if (!novoNome.trim()) return;
    setCriando(true);
    setErro(null);
    const { data, error } = await supabase()
      .from("atendimento_inboxes")
      .insert({ nome: novoNome.trim(), canal: novoCanal, ativo: novoAtivo })
      .select("*")
      .single();
    setCriando(false);
    if (error) { setErro(error.message); return; }
    const nova = data as AtendimentoInbox;
    setInboxes((p) => [...p, nova].sort((a, b) => a.nome.localeCompare(b.nome)));
    setModalNova(false);
    setNovoNome("");
    setNovoCanal("whatsapp");
    setNovoAtivo(true);
    abrir(nova);
  }

  async function salvar() {
    if (!rascunho) return;
    setSalvando(true);
    setErro(null);
    const { error } = await supabase()
      .from("atendimento_inboxes")
      .update({
        nome: rascunho.nome.trim(),
        canal: rascunho.canal,
        ativo: rascunho.ativo,
        permite_responder_apos_resolver: rascunho.permite_responder_apos_resolver,
        bloquear_conversa_encerrada: rascunho.bloquear_conversa_encerrada,
        saudacao_ativa: rascunho.saudacao_ativa,
        saudacao_texto: rascunho.saudacao_texto,
        mensagem_ausencia: rascunho.mensagem_ausencia,
        auto_atribuicao: rascunho.auto_atribuicao,
        auto_atribuicao_limite: rascunho.auto_atribuicao_limite,
        pre_chat_ativo: rascunho.pre_chat_ativo,
        pre_chat_campos: rascunho.pre_chat_campos,
        csat_ativo: rascunho.csat_ativo,
        csat_mensagem: rascunho.csat_mensagem,
      })
      .eq("id", rascunho.id);
    setSalvando(false);
    if (error) { setErro(error.message); return; }
    setInboxes((p) => p.map((c) => (c.id === rascunho.id ? rascunho : c)));
    setSalvo(true);
    // O "Salvo ✓" some sozinho para não virar ruído permanente na tela.
    setTimeout(() => setSalvo(false), 2500);
  }

  async function excluir() {
    if (!rascunho) return;
    const id = rascunho.id;
    const { error } = await supabase().from("atendimento_inboxes").delete().eq("id", id);
    if (error) { setErro(error.message); setConfirmarExclusao(false); return; }
    setInboxes((p) => p.filter((c) => c.id !== id));
    setMembros((p) => p.filter((m) => m.inbox_id !== id));
    setConfirmarExclusao(false);
    voltar();
  }

  async function alternarAgente(inboxId: string, profileId: string, ligar: boolean) {
    setErro(null);
    if (ligar) {
      const { error } = await supabase()
        .from("atendimento_inbox_members")
        .insert({ inbox_id: inboxId, profile_id: profileId });
      if (error) { setErro(error.message); return; }
      setMembros((p) => [...p, { inbox_id: inboxId, profile_id: profileId }]);
    } else {
      const { error } = await supabase()
        .from("atendimento_inbox_members")
        .delete()
        .eq("inbox_id", inboxId)
        .eq("profile_id", profileId);
      if (error) { setErro(error.message); return; }
      setMembros((p) => p.filter((m) => !(m.inbox_id === inboxId && m.profile_id === profileId)));
    }
  }

  // ---------- edição dos campos do pré-chat ----------
  function addCampoPreChat() {
    const campos = [...(rascunho?.pre_chat_campos ?? [])];
    campos.push({ chave: "", rotulo: "", tipo: "texto", obrigatorio: false });
    set("pre_chat_campos", campos);
  }
  function setCampoPreChat(i: number, patch: Partial<PreChatField>) {
    const campos = [...(rascunho?.pre_chat_campos ?? [])];
    campos[i] = { ...campos[i], ...patch };
    set("pre_chat_campos", campos);
  }
  function removeCampoPreChat(i: number) {
    const campos = [...(rascunho?.pre_chat_campos ?? [])];
    campos.splice(i, 1);
    set("pre_chat_campos", campos);
  }

  const qtdAgentes = (id: string) => membros.filter((m) => m.inbox_id === id).length;

  // ===================== LISTA =====================
  if (!selecionada || !rascunho) {
    return (
      <div className="space-y-5">
        <PageHeader
          titulo="Caixas de entrada"
          descricao="Cada canal de atendimento vira uma caixa com regras próprias."
          acoes={
            <Button type="button" variant="gold" size="sm" onClick={() => setModalNova(true)}>
              <Plus size={15} /> Nova caixa de entrada
            </Button>
          }
        />
        {erro && <Alerta tipo="erro">{erro}</Alerta>}

        {inboxes.length === 0 ? (
          <EmptyState
            titulo="Nenhuma caixa de entrada"
            descricao="Crie uma caixa para agrupar as conversas de um canal (WhatsApp, site, e-mail…)."
            acao={
              <Button type="button" variant="gold" size="sm" onClick={() => setModalNova(true)}>
                <Plus size={15} /> Nova caixa de entrada
              </Button>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {inboxes.map((cx) => (
              <button
                key={cx.id}
                type="button"
                onClick={() => abrir(cx)}
                className="text-left rounded-xl border bg-card p-4 hover:border-arini dark:hover:border-gold transition-colors"
              >
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 shrink-0 rounded-lg bg-muted p-2 text-arini dark:text-gold">
                    <InboxIcon size={16} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{cx.nome}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{CANAL_LABELS[cx.canal]}</div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      cx.ativo
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                        : "bg-muted text-muted-foreground"
                    }`}
                  >
                    {cx.ativo ? "Ativa" : "Inativa"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users size={13} />
                  {qtdAgentes(cx.id)} {qtdAgentes(cx.id) === 1 ? "agente" : "agentes"}
                </div>
              </button>
            ))}
          </div>
        )}

        <Modal
          aberto={modalNova}
          onFechar={() => setModalNova(false)}
          titulo="Nova caixa de entrada"
          descricao="Você configura mensagens, agentes e CSAT depois de criar."
          rodape={
            <>
              <Button type="button" variant="ghost" size="sm" onClick={() => setModalNova(false)}>Cancelar</Button>
              <Button type="button" variant="gold" size="sm" onClick={() => void criar()} disabled={!novoNome.trim() || criando}>
                {criando ? <Spinner /> : <Plus size={15} />} Criar
              </Button>
            </>
          }
        >
          <Field label="Nome" obrigatorio>
            <TextInput
              value={novoNome}
              onChange={(e) => setNovoNome(e.target.value)}
              placeholder="Ex.: WhatsApp — Comercial"
              autoFocus
            />
          </Field>
          <Field label="Canal">
            <SelectInput value={novoCanal} onChange={(e) => setNovoCanal(e.target.value as InboxChannel)}>
              {CANAIS.map((c) => (
                <option key={c} value={c}>{CANAL_LABELS[c]}</option>
              ))}
            </SelectInput>
          </Field>
          <Switch checked={novoAtivo} onChange={setNovoAtivo} label="Ativa" dica="Caixas inativas não recebem novas conversas." />
        </Modal>
      </div>
    );
  }

  // ===================== DETALHE =====================
  const agentesDaCaixa = (pid: string) => membros.some((m) => m.inbox_id === rascunho.id && m.profile_id === pid);

  return (
    <div className="space-y-5">
      <PageHeader
        titulo={rascunho.nome || "Caixa de entrada"}
        descricao={CANAL_LABELS[rascunho.canal]}
        acoes={
          <>
            {salvo && (
              <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
                <Check size={14} /> Salvo
              </span>
            )}
            <Button type="button" variant="ghost" size="sm" onClick={voltar}>
              <ArrowLeft size={15} /> Voltar
            </Button>
            <Button type="button" variant="gold" size="sm" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? <Spinner /> : <Check size={15} />} Salvar
            </Button>
          </>
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="flex flex-wrap gap-1 border-b">
        {ABAS.map((a) => {
          const Icon = a.icon;
          const ativa = aba === a.id;
          return (
            <button
              key={a.id}
              type="button"
              onClick={() => setAba(a.id)}
              className={`inline-flex items-center gap-1.5 px-3 py-2 text-[13px] border-b-2 -mb-px ${
                ativa
                  ? "border-arini text-arini dark:text-gold font-medium dark:border-gold"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Icon size={14} /> {a.label}
            </button>
          );
        })}
      </div>

      <div className="max-w-2xl space-y-4">
        {aba === "geral" && (
          <Card className="p-4 space-y-4">
            <Field label="Nome" obrigatorio>
              <TextInput value={rascunho.nome} onChange={(e) => set("nome", e.target.value)} />
            </Field>
            <Field label="Canal">
              <SelectInput value={rascunho.canal} onChange={(e) => set("canal", e.target.value as InboxChannel)}>
                {CANAIS.map((c) => (
                  <option key={c} value={c}>{CANAL_LABELS[c]}</option>
                ))}
              </SelectInput>
            </Field>
            <Switch checked={rascunho.ativo} onChange={(v) => set("ativo", v)} label="Caixa ativa" dica="Caixas inativas não recebem novas conversas." />
            <Switch
              checked={rascunho.permite_responder_apos_resolver}
              onChange={(v) => set("permite_responder_apos_resolver", v)}
              label="Permitir responder após resolver"
              dica="O agente pode enviar mensagens mesmo com a conversa marcada como resolvida."
            />
            <Switch
              checked={rascunho.bloquear_conversa_encerrada}
              onChange={(v) => set("bloquear_conversa_encerrada", v)}
              label="Bloquear conversa encerrada"
              dica="Uma nova mensagem do cliente abre outra conversa em vez de reabrir a antiga."
            />
            <div className="pt-2 border-t">
              <Button type="button" variant="destructive" size="sm" onClick={() => setConfirmarExclusao(true)}>
                <Trash2 size={15} /> Excluir caixa
              </Button>
            </div>
          </Card>
        )}

        {aba === "agentes" && (
          <Card titulo="Agentes desta caixa" descricao="Só quem está marcado recebe conversas desta caixa. Salva na hora.">
            {agents.length === 0 ? (
              <div className="p-4">
                <Alerta tipo="atencao">Nenhum agente com acesso ao atendimento foi encontrado.</Alerta>
              </div>
            ) : (
              <div className="p-4 space-y-1.5">
                {agents.map((a) => (
                  <label key={a.id} className="flex items-center gap-2 text-sm cursor-pointer py-0.5">
                    <input
                      type="checkbox"
                      checked={agentesDaCaixa(a.id)}
                      onChange={(e) => void alternarAgente(rascunho.id, a.id, e.target.checked)}
                    />
                    {a.nome}
                  </label>
                ))}
              </div>
            )}
          </Card>
        )}

        {aba === "mensagens" && (
          <Card className="p-4 space-y-4">
            <Switch
              checked={rascunho.saudacao_ativa}
              onChange={(v) => set("saudacao_ativa", v)}
              label="Enviar saudação automática"
              dica="Disparada na primeira mensagem do cliente."
            />
            <Field label="Texto da saudação">
              <TextArea
                value={rascunho.saudacao_texto ?? ""}
                onChange={(e) => set("saudacao_texto", e.target.value)}
                disabled={!rascunho.saudacao_ativa}
                placeholder="Olá! Como podemos ajudar?"
              />
            </Field>
            <Field label="Mensagem fora do horário" dica="Usada quando o horário comercial está ativo e a caixa está fechada.">
              <TextArea
                value={rascunho.mensagem_ausencia ?? ""}
                onChange={(e) => set("mensagem_ausencia", e.target.value)}
                placeholder="Nosso atendimento é de segunda a sexta, das 8h às 18h."
              />
            </Field>
          </Card>
        )}

        {aba === "atribuicao" && (
          <Card className="p-4 space-y-4">
            <Switch
              checked={rascunho.auto_atribuicao}
              onChange={(v) => set("auto_atribuicao", v)}
              label="Atribuição automática (round-robin)"
              dica="Distribui cada conversa nova para o próximo agente disponível da caixa, em rodízio."
            />
            <Field
              label="Limite de conversas simultâneas por agente"
              dica="0 = sem limite. Ao atingir o limite, o agente é pulado no rodízio."
            >
              <TextInput
                type="number"
                min={0}
                value={rascunho.auto_atribuicao_limite}
                onChange={(e) => set("auto_atribuicao_limite", Math.max(0, Number(e.target.value) || 0))}
                disabled={!rascunho.auto_atribuicao}
                className="max-w-[140px]"
              />
            </Field>
            {!rascunho.auto_atribuicao && (
              <Alerta tipo="info">Com a atribuição automática desligada, as conversas ficam sem responsável até alguém assumir.</Alerta>
            )}
          </Card>
        )}

        {aba === "prechat" && (
          <Card className="p-4 space-y-4">
            <Switch
              checked={rascunho.pre_chat_ativo}
              onChange={(v) => set("pre_chat_ativo", v)}
              label="Formulário de pré-chat"
              dica="Pede dados ao visitante antes de iniciar a conversa."
            />
            <div className="space-y-2">
              {(rascunho.pre_chat_campos ?? []).length === 0 && (
                <p className="text-xs text-muted-foreground">Nenhum campo. Adicione ao menos um.</p>
              )}
              {(rascunho.pre_chat_campos ?? []).map((campo, i) => (
                <div key={i} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto_auto_auto] gap-2 items-center rounded-lg border p-2">
                  <TextInput
                    value={campo.chave}
                    onChange={(e) => setCampoPreChat(i, { chave: e.target.value })}
                    placeholder="chave (ex.: email)"
                  />
                  <TextInput
                    value={campo.rotulo}
                    onChange={(e) => setCampoPreChat(i, { rotulo: e.target.value })}
                    placeholder="Rótulo (ex.: Seu e-mail)"
                  />
                  <SelectInput
                    value={campo.tipo}
                    onChange={(e) => setCampoPreChat(i, { tipo: e.target.value as PreChatField["tipo"] })}
                    className="sm:w-auto"
                  >
                    {TIPOS_PRE_CHAT.map((t) => (
                      <option key={t} value={t}>{TIPO_PRE_CHAT_LABELS[t]}</option>
                    ))}
                  </SelectInput>
                  <label className="flex items-center gap-1.5 text-xs whitespace-nowrap cursor-pointer">
                    <input
                      type="checkbox"
                      checked={campo.obrigatorio}
                      onChange={(e) => setCampoPreChat(i, { obrigatorio: e.target.checked })}
                    />
                    Obrigatório
                  </label>
                  <button
                    type="button"
                    onClick={() => removeCampoPreChat(i)}
                    className="justify-self-end p-1.5 rounded text-muted-foreground hover:text-red-600"
                    aria-label="Remover campo"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" onClick={addCampoPreChat}>
                <Plus size={15} /> Adicionar campo
              </Button>
            </div>
          </Card>
        )}

        {aba === "csat" && (
          <Card className="p-4 space-y-4">
            <Switch
              checked={rascunho.csat_ativo}
              onChange={(v) => set("csat_ativo", v)}
              label="Pesquisa de satisfação (CSAT)"
              dica="Envia a pesquisa ao cliente quando a conversa é resolvida."
            />
            <Field label="Mensagem da pesquisa">
              <TextArea
                value={rascunho.csat_mensagem ?? ""}
                onChange={(e) => set("csat_mensagem", e.target.value)}
                disabled={!rascunho.csat_ativo}
                placeholder="Como você avalia nosso atendimento?"
              />
            </Field>
            <Alerta tipo="info">Os resultados aparecem em Configurações → Satisfação (CSAT).</Alerta>
          </Card>
        )}
      </div>

      <Modal
        aberto={confirmarExclusao}
        onFechar={() => setConfirmarExclusao(false)}
        titulo="Excluir caixa de entrada"
        descricao="Esta ação não pode ser desfeita."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmarExclusao(false)}>Cancelar</Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void excluir()}>
              <Trash2 size={15} /> Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Excluir <strong>{rascunho.nome}</strong>? As conversas ligadas a ela ficam sem caixa, e o horário
          comercial e os agentes desta caixa são removidos.
        </p>
      </Modal>
    </div>
  );
}
