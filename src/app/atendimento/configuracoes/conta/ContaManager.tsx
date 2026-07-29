"use client";

import { useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Card, Field, TextInput, TextArea, SelectInput, Switch,
  Modal, Table, Alerta, EmptyState,
} from "@/components/atendimento/ui";
import { errMessage } from "@/lib/utils";
import {
  PERMISSOES, INTEGRATION_LABELS,
  type AtendimentoSettings, type AtendimentoRole,
  type AtendimentoIntegration, type IntegrationType, type DashboardApp,
} from "@/lib/types";
import {
  Building2, Shield, Plug, LayoutGrid, Plus, Trash2, Pencil, Check, Lock,
} from "lucide-react";

type Aba = "conta" | "papeis" | "integracoes" | "apps";

const ABAS: { key: Aba; label: string; icon: typeof Building2 }[] = [
  { key: "conta", label: "Conta", icon: Building2 },
  { key: "papeis", label: "Papéis e permissões", icon: Shield },
  { key: "integracoes", label: "Integrações", icon: Plug },
  { key: "apps", label: "Apps do painel", icon: LayoutGrid },
];

const FUSOS = [
  "America/Sao_Paulo", "America/Manaus", "America/Cuiaba",
  "America/Belem", "America/Fortaleza", "America/Rio_Branco",
];

export function ContaManager({
  settings,
  rolesIniciais,
  integracoesIniciais,
  appsIniciais,
  ehDiretoria,
}: {
  settings: AtendimentoSettings | null;
  rolesIniciais: AtendimentoRole[];
  integracoesIniciais: AtendimentoIntegration[];
  appsIniciais: DashboardApp[];
  ehDiretoria: boolean;
}) {
  const [aba, setAba] = useState<Aba>("conta");

  return (
    <>
      <PageHeader
        titulo="Conta e plataforma"
        descricao="Dados da operação, papéis de acesso, integrações e apps do painel."
      />

      <div className="flex gap-1 border-b -mt-1">
        {ABAS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setAba(key)}
            className={`inline-flex items-center gap-1.5 px-3 py-2 text-sm border-b-2 -mb-px ${
              aba === key
                ? "border-arini text-arini dark:border-gold dark:text-gold font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {aba === "conta" && <AbaConta inicial={settings} />}
      {aba === "papeis" && <AbaPapeis inicial={rolesIniciais} />}
      {aba === "integracoes" && <AbaIntegracoes inicial={integracoesIniciais} ehDiretoria={ehDiretoria} />}
      {aba === "apps" && <AbaApps inicial={appsIniciais} />}
    </>
  );
}

// =====================================================================
// Aba 1 — dados da conta
// =====================================================================

function AbaConta({ inicial }: { inicial: AtendimentoSettings | null }) {
  const [form, setForm] = useState({
    nome_conta: inicial?.nome_conta ?? "Arini Negócios Imobiliários",
    idioma: inicial?.idioma ?? "pt-BR",
    fuso: inicial?.fuso ?? "America/Sao_Paulo",
    auto_resolver_dias: inicial?.auto_resolver_dias ?? 0,
    ocultar_nome_agente: inicial?.ocultar_nome_agente ?? false,
    recepcao_ve_atribuidas: inicial?.recepcao_ve_atribuidas ?? true,
    notificacao_som: inicial?.notificacao_som ?? true,
    logo_url: inicial?.logo_url ?? "",
  });
  const [salvando, setSalvando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    setSalvando(true); setErro(null); setAviso(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("atendimento_settings")
      .update({ ...form, logo_url: form.logo_url || null, updated_at: new Date().toISOString() })
      .eq("id", true);
    setSalvando(false);
    if (error) setErro(errMessage(error));
    else { setAviso("Salvo ✓"); setTimeout(() => setAviso(null), 2500); }
  }

  return (
    <Card titulo="Dados da operação" className="p-5 space-y-4">
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome da conta" dica="Aparece nos e-mails e no portal de ajuda.">
          <TextInput
            value={form.nome_conta}
            onChange={(e) => setForm({ ...form, nome_conta: e.target.value })}
          />
        </Field>
        <Field label="Logo (URL)" dica="Imagem quadrada, de preferência PNG com fundo transparente.">
          <TextInput
            value={form.logo_url}
            placeholder="https://…"
            onChange={(e) => setForm({ ...form, logo_url: e.target.value })}
          />
        </Field>
        <Field label="Idioma">
          <SelectInput value={form.idioma} onChange={(e) => setForm({ ...form, idioma: e.target.value })}>
            <option value="pt-BR">Português (Brasil)</option>
            <option value="en">English</option>
            <option value="es">Español</option>
          </SelectInput>
        </Field>
        <Field label="Fuso horário" dica="Usado no horário comercial, no SLA e nos relatórios.">
          <SelectInput value={form.fuso} onChange={(e) => setForm({ ...form, fuso: e.target.value })}>
            {FUSOS.map((f) => <option key={f} value={f}>{f}</option>)}
          </SelectInput>
        </Field>
      </div>

      <Field
        label="Resolver automaticamente após (dias sem resposta)"
        dica="0 desliga. Conta a partir da última mensagem do cliente numa conversa aberta."
      >
        <TextInput
          type="number"
          min={0}
          max={365}
          value={form.auto_resolver_dias}
          onChange={(e) => setForm({ ...form, auto_resolver_dias: Number(e.target.value) || 0 })}
          className="max-w-[120px]"
        />
      </Field>

      <div className="space-y-3 pt-1">
        <Switch
          checked={form.recepcao_ve_atribuidas}
          onChange={(v) => setForm({ ...form, recepcao_ve_atribuidas: v })}
          label="A recepção continua vendo a conversa depois de atribuir"
          dica="Ligado, ela acompanha o que encaminhou — um segundo par de olhos junto com o administrador. Desligado, ela só enxerga a caixa central e a conversa some da tela dela assim que é triada."
        />
        <Switch
          checked={form.ocultar_nome_agente}
          onChange={(v) => setForm({ ...form, ocultar_nome_agente: v })}
          label="Esconder o nome do agente do cliente"
          dica="A resposta sai em nome da empresa. Útil quando o time rodiza muito."
        />
        <Switch
          checked={form.notificacao_som}
          onChange={(v) => setForm({ ...form, notificacao_som: v })}
          label="Som de mensagem nova ligado por padrão"
          dica="Cada agente ainda pode silenciar no próprio navegador."
        />
      </div>

      {form.auto_resolver_dias > 0 && (
        <Alerta tipo="atencao">
          O fechamento automático depende do cron de <code>/api/atendimento/jobs</code>.
          Sem ele agendado, esta regra fica só guardada.
        </Alerta>
      )}

      <div className="flex items-center gap-3 pt-1">
        <Button size="sm" variant="gold" onClick={() => void salvar()} disabled={salvando}>
          {salvando ? "Salvando…" : "Salvar"}
        </Button>
        {aviso && <span className="text-xs text-emerald-600 dark:text-emerald-400">{aviso}</span>}
      </div>
    </Card>
  );
}

// =====================================================================
// Aba 2 — papéis e permissões
// =====================================================================

function AbaPapeis({ inicial }: { inicial: AtendimentoRole[] }) {
  const [roles, setRoles] = useState(inicial);
  const [editando, setEditando] = useState<AtendimentoRole | null>(null);
  const [criando, setCriando] = useState(false);
  const [excluindo, setExcluindo] = useState<AtendimentoRole | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const grupos = Array.from(new Set(PERMISSOES.map((p) => p.grupo)));

  async function excluir(r: AtendimentoRole) {
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_roles").delete().eq("id", r.id);
    if (error) { setErro(errMessage(error)); return; }
    setRoles((p) => p.filter((x) => x.id !== r.id));
    setExcluindo(null);
  }

  return (
    <div className="space-y-4">
      <Alerta tipo="atencao">
        Os papéis já ficam salvos e podem ser atribuídos ao agente, mas
        <strong> ainda não substituem as regras de acesso do banco</strong>. Quem
        manda hoje é a RLS do Supabase (setor + <code>atendimento_access</code>).
        Ligar as permissões de verdade exige reescrever as políticas — é a
        próxima onda.
      </Alerta>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <Card
        titulo="Papéis"
        descricao="Um conjunto de permissões que você aplica ao agente."
        acoes={
          <Button size="sm" variant="gold" onClick={() => setCriando(true)}>
            <Plus size={14} /> Novo papel
          </Button>
        }
      >
        <Table colunas={["Papel", "Descrição", "Permissões", ""]}>
          {roles.map((r) => (
            <tr key={r.id} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <span className="inline-flex items-center gap-1.5 font-medium">
                  {r.sistema && <Lock size={11} className="text-muted-foreground" />}
                  {r.nome}
                </span>
              </td>
              <td className="px-3 py-2 text-muted-foreground text-xs max-w-sm">{r.descricao ?? "—"}</td>
              <td className="px-3 py-2">
                <span className="text-xs rounded-full bg-muted px-2 py-0.5">
                  {r.permissoes.length} permissões
                </span>
              </td>
              <td className="px-3 py-2 text-right whitespace-nowrap">
                <button
                  type="button"
                  onClick={() => setEditando(r)}
                  className="p-1.5 rounded text-muted-foreground hover:bg-muted"
                  title={r.sistema ? "Ver permissões" : "Editar"}
                >
                  <Pencil size={13} />
                </button>
                {!r.sistema && (
                  <button
                    type="button"
                    onClick={() => setExcluindo(r)}
                    className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                    title="Excluir"
                  >
                    <Trash2 size={13} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      {(criando || editando) && (
        <ModalPapel
          role={editando}
          grupos={grupos}
          onFechar={() => { setCriando(false); setEditando(null); }}
          onSalvo={(r) => {
            setRoles((p) => {
              const existe = p.some((x) => x.id === r.id);
              return existe ? p.map((x) => (x.id === r.id ? r : x)) : [...p, r];
            });
            setCriando(false); setEditando(null);
          }}
        />
      )}

      <Modal
        aberto={Boolean(excluindo)}
        onFechar={() => setExcluindo(null)}
        titulo="Excluir papel"
        descricao="Os agentes que usam este papel ficam sem papel definido."
        rodape={
          <>
            <Button size="sm" variant="outline" onClick={() => setExcluindo(null)}>Cancelar</Button>
            <Button size="sm" variant="destructive" onClick={() => excluindo && void excluir(excluindo)}>
              Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Excluir <strong>{excluindo?.nome}</strong>?
        </p>
      </Modal>
    </div>
  );
}

function ModalPapel({
  role, grupos, onFechar, onSalvo,
}: {
  role: AtendimentoRole | null;
  grupos: string[];
  onFechar: () => void;
  onSalvo: (r: AtendimentoRole) => void;
}) {
  const [nome, setNome] = useState(role?.nome ?? "");
  const [descricao, setDescricao] = useState(role?.descricao ?? "");
  const [permissoes, setPermissoes] = useState<string[]>(role?.permissoes ?? []);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const bloqueado = role?.sistema === true;

  function alternar(chave: string) {
    setPermissoes((p) => (p.includes(chave) ? p.filter((x) => x !== chave) : [...p, chave]));
  }

  async function salvar() {
    if (!nome.trim()) { setErro("Dê um nome ao papel."); return; }
    if (permissoes.length === 0) { setErro("Marque pelo menos uma permissão."); return; }
    setSalvando(true); setErro(null);
    const supabase = createSupabaseBrowser();
    const payload = { nome: nome.trim(), descricao: descricao.trim() || null, permissoes };
    const { data, error } = role
      ? await supabase.from("atendimento_roles").update(payload).eq("id", role.id).select("*").single()
      : await supabase.from("atendimento_roles").insert(payload).select("*").single();
    setSalvando(false);
    if (error) { setErro(errMessage(error)); return; }
    onSalvo(data as AtendimentoRole);
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      largura="max-w-2xl"
      titulo={role ? (bloqueado ? `Permissões de "${role.nome}"` : `Editar "${role.nome}"`) : "Novo papel"}
      descricao={bloqueado ? "Papel de sistema — só leitura." : "Marque o que este papel pode fazer."}
      rodape={
        <>
          <Button size="sm" variant="outline" onClick={onFechar}>
            {bloqueado ? "Fechar" : "Cancelar"}
          </Button>
          {!bloqueado && (
            <Button size="sm" variant="gold" onClick={() => void salvar()} disabled={salvando}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          )}
        </>
      }
    >
      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nome" obrigatorio>
          <TextInput value={nome} disabled={bloqueado} onChange={(e) => setNome(e.target.value)} />
        </Field>
        <Field label="Descrição">
          <TextInput value={descricao} disabled={bloqueado} onChange={(e) => setDescricao(e.target.value)} />
        </Field>
      </div>

      <div className="space-y-3">
        {grupos.map((g) => (
          <div key={g}>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
              {g}
            </div>
            <div className="space-y-1">
              {PERMISSOES.filter((p) => p.grupo === g).map((p) => (
                <label
                  key={p.chave}
                  className={`flex items-center gap-2 text-sm rounded-md px-2 py-1 ${
                    bloqueado ? "opacity-70" : "hover:bg-muted cursor-pointer"
                  }`}
                >
                  <input
                    type="checkbox"
                    disabled={bloqueado}
                    checked={permissoes.includes(p.chave)}
                    onChange={() => alternar(p.chave)}
                    className="h-3.5 w-3.5"
                  />
                  <span className="flex-1">{p.label}</span>
                  <code className="text-[10px] text-muted-foreground">{p.chave}</code>
                </label>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Modal>
  );
}

// =====================================================================
// Aba 3 — integrações
// =====================================================================

const CAMPOS_INTEGRACAO: Record<IntegrationType, { chave: string; rotulo: string; dica?: string }[]> = {
  slack: [
    { chave: "webhook_url", rotulo: "Incoming Webhook URL", dica: "Slack › Apps › Incoming Webhooks" },
    { chave: "canal", rotulo: "Canal", dica: "Ex.: #atendimento" },
  ],
  dialogflow: [
    { chave: "project_id", rotulo: "ID do projeto" },
    { chave: "credenciais_json", rotulo: "JSON da conta de serviço" },
    { chave: "idioma", rotulo: "Idioma", dica: "Ex.: pt-BR" },
  ],
  webhook_app: [{ chave: "url", rotulo: "URL do aplicativo" }],
  dashboard_app: [{ chave: "url", rotulo: "URL do iframe" }],
  google_translate: [{ chave: "api_key", rotulo: "Chave da API" }],
};

function AbaIntegracoes({
  inicial, ehDiretoria,
}: {
  inicial: AtendimentoIntegration[];
  ehDiretoria: boolean;
}) {
  const [itens, setItens] = useState(inicial);
  const [editando, setEditando] = useState<AtendimentoIntegration | null>(null);
  const [novoTipo, setNovoTipo] = useState<IntegrationType | "">("");

  if (!ehDiretoria) {
    return (
      <Alerta tipo="atencao">
        As integrações guardam tokens de serviços externos, então só a diretoria
        pode vê-las e editá-las. Fale com quem tem esse acesso.
      </Alerta>
    );
  }

  async function alternarAtivo(i: AtendimentoIntegration) {
    const supabase = createSupabaseBrowser();
    setItens((p) => p.map((x) => (x.id === i.id ? { ...x, ativo: !x.ativo } : x)));
    const { error } = await supabase
      .from("atendimento_integrations").update({ ativo: !i.ativo }).eq("id", i.id);
    if (error) setItens((p) => p.map((x) => (x.id === i.id ? { ...x, ativo: i.ativo } : x)));
  }

  return (
    <div className="space-y-4">
      <Alerta tipo="atencao">
        As credenciais ficam guardadas e a tela funciona, mas <strong>nenhuma
        integração é chamada ainda</strong> — falta o disparo em cada evento.
        Não conte com o espelhamento no Slack antes disso.
      </Alerta>

      <Card
        titulo="Serviços conectados"
        acoes={
          <div className="flex items-center gap-2">
            <SelectInput
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value as IntegrationType | "")}
              className="max-w-[220px] text-xs"
            >
              <option value="">Adicionar…</option>
              {(Object.keys(INTEGRATION_LABELS) as IntegrationType[]).map((t) => (
                <option key={t} value={t}>{INTEGRATION_LABELS[t]}</option>
              ))}
            </SelectInput>
          </div>
        }
      >
        {itens.length === 0 ? (
          <EmptyState
            titulo="Nenhuma integração"
            descricao="Escolha um serviço no seletor acima para começar."
            icone={<Plug size={32} />}
          />
        ) : (
          <Table colunas={["Serviço", "Nome", "Ativo", "Último erro", ""]}>
            {itens.map((i) => (
              <tr key={i.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 text-xs">{INTEGRATION_LABELS[i.tipo]}</td>
                <td className="px-3 py-2 font-medium">{i.nome}</td>
                <td className="px-3 py-2">
                  <Switch checked={i.ativo} onChange={() => void alternarAtivo(i)} />
                </td>
                <td className="px-3 py-2 text-xs text-red-600 dark:text-red-400 max-w-xs truncate">
                  {i.ultimo_erro ?? "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => setEditando(i)}
                    className="p-1.5 rounded text-muted-foreground hover:bg-muted"
                  >
                    <Pencil size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {(editando || novoTipo) && (
        <ModalIntegracao
          integracao={editando}
          tipo={editando?.tipo ?? (novoTipo as IntegrationType)}
          onFechar={() => { setEditando(null); setNovoTipo(""); }}
          onSalvo={(i) => {
            setItens((p) => {
              const existe = p.some((x) => x.id === i.id);
              return existe ? p.map((x) => (x.id === i.id ? i : x)) : [...p, i];
            });
            setEditando(null); setNovoTipo("");
          }}
        />
      )}
    </div>
  );
}

function ModalIntegracao({
  integracao, tipo, onFechar, onSalvo,
}: {
  integracao: AtendimentoIntegration | null;
  tipo: IntegrationType;
  onFechar: () => void;
  onSalvo: (i: AtendimentoIntegration) => void;
}) {
  const campos = CAMPOS_INTEGRACAO[tipo];
  const [nome, setNome] = useState(integracao?.nome ?? INTEGRATION_LABELS[tipo].split(" — ")[0]);
  const [config, setConfig] = useState<Record<string, string>>(integracao?.config ?? {});
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!nome.trim()) { setErro("Dê um nome."); return; }
    const faltando = campos.filter((c) => !config[c.chave]?.trim());
    if (faltando.length) { setErro(`Preencha: ${faltando.map((c) => c.rotulo).join(", ")}.`); return; }
    setSalvando(true); setErro(null);
    const supabase = createSupabaseBrowser();
    const payload = { tipo, nome: nome.trim(), config };
    const { data, error } = integracao
      ? await supabase.from("atendimento_integrations").update(payload).eq("id", integracao.id).select("*").single()
      : await supabase.from("atendimento_integrations").insert(payload).select("*").single();
    setSalvando(false);
    if (error) { setErro(errMessage(error)); return; }
    onSalvo(data as AtendimentoIntegration);
  }

  return (
    <Modal
      aberto
      onFechar={onFechar}
      titulo={INTEGRATION_LABELS[tipo]}
      descricao="As credenciais ficam restritas à diretoria."
      rodape={
        <>
          <Button size="sm" variant="outline" onClick={onFechar}>Cancelar</Button>
          <Button size="sm" variant="gold" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar"}
          </Button>
        </>
      }
    >
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      <Field label="Nome" obrigatorio>
        <TextInput value={nome} onChange={(e) => setNome(e.target.value)} />
      </Field>
      {campos.map((c) => (
        <Field key={c.chave} label={c.rotulo} dica={c.dica} obrigatorio>
          {c.chave === "credenciais_json" ? (
            <TextArea
              value={config[c.chave] ?? ""}
              onChange={(e) => setConfig({ ...config, [c.chave]: e.target.value })}
              className="font-mono text-[11px] min-h-[120px]"
            />
          ) : (
            <TextInput
              value={config[c.chave] ?? ""}
              onChange={(e) => setConfig({ ...config, [c.chave]: e.target.value })}
            />
          )}
        </Field>
      ))}
    </Modal>
  );
}

// =====================================================================
// Aba 4 — apps do painel (iframe ao lado da conversa)
// =====================================================================

function AbaApps({ inicial }: { inicial: DashboardApp[] }) {
  const [apps, setApps] = useState(inicial);
  const [modal, setModal] = useState(false);
  const [nome, setNome] = useState("");
  const [url, setUrl] = useState("");
  const [erro, setErro] = useState<string | null>(null);

  async function criar() {
    if (!nome.trim() || !url.trim()) { setErro("Nome e URL são obrigatórios."); return; }
    if (!/^https:\/\//.test(url)) { setErro("A URL precisa começar com https://"); return; }
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("atendimento_dashboard_apps")
      .insert({ nome: nome.trim(), url: url.trim(), ordem: apps.length })
      .select("*").single();
    if (error) { setErro(errMessage(error)); return; }
    setApps((p) => [...p, data as DashboardApp]);
    setModal(false); setNome(""); setUrl(""); setErro(null);
  }

  async function excluir(id: string) {
    const supabase = createSupabaseBrowser();
    await supabase.from("atendimento_dashboard_apps").delete().eq("id", id);
    setApps((p) => p.filter((a) => a.id !== id));
  }

  return (
    <div className="space-y-4">
      <Alerta tipo="info">
        Um app do painel é uma página sua embutida ao lado da conversa. Ela
        recebe <code>?conversation_id=</code>, <code>&amp;contact_id=</code> e{" "}
        <code>&amp;agent_id=</code> na URL — dá para mostrar o histórico do
        cliente em outro sistema sem sair do atendimento.
      </Alerta>

      <Card
        titulo="Apps"
        acoes={
          <Button size="sm" variant="gold" onClick={() => setModal(true)}>
            <Plus size={14} /> Novo app
          </Button>
        }
      >
        {apps.length === 0 ? (
          <EmptyState
            titulo="Nenhum app do painel"
            descricao="Embuta uma página sua ao lado da conversa."
            icone={<LayoutGrid size={32} />}
          />
        ) : (
          <Table colunas={["Nome", "URL", "Ativo", ""]}>
            {apps.map((a) => (
              <tr key={a.id} className="hover:bg-muted/30">
                <td className="px-3 py-2 font-medium">{a.nome}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground max-w-md truncate">{a.url}</td>
                <td className="px-3 py-2">
                  {a.ativo ? <Check size={14} className="text-emerald-500" /> : "—"}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    onClick={() => void excluir(a.id)}
                    className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                  >
                    <Trash2 size={13} />
                  </button>
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <Modal
        aberto={modal}
        onFechar={() => { setModal(false); setErro(null); }}
        titulo="Novo app do painel"
        rodape={
          <>
            <Button size="sm" variant="outline" onClick={() => setModal(false)}>Cancelar</Button>
            <Button size="sm" variant="gold" onClick={() => void criar()}>Criar</Button>
          </>
        }
      >
        {erro && <Alerta tipo="erro">{erro}</Alerta>}
        <Field label="Nome" obrigatorio>
          <TextInput value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Histórico no ERP" />
        </Field>
        <Field label="URL" obrigatorio dica="Precisa ser https e permitir ser embutida em iframe.">
          <TextInput value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://…" />
        </Field>
      </Modal>
    </div>
  );
}
