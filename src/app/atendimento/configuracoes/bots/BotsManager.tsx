"use client";

import { Fragment, useCallback, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Modal, Field, TextInput, TextArea, SelectInput, Switch,
  EmptyState, Card, Table, Alerta, Spinner,
} from "@/components/atendimento/ui";
import type { AgentBot, AtendimentoInbox, BotDelivery } from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Bot, Send, ChevronRight, ChevronDown, Copy, Check,
} from "lucide-react";

// =====================================================================
// Tela de Agent Bots.
//
// Segue o desenho da tela de Webhooks de propósito: quem já configurou um
// webhook aqui dentro reconhece a tabela, o switch, o botão de testar e a
// linha que expande com as últimas entregas. Bot é "webhook + API de
// volta", e a tela conta essa história.
//
// A CRIAÇÃO passa por /api/atendimento/bots porque o TOKEN é gerado no
// servidor e aparece uma única vez. Edição, liga/desliga e exclusão vão
// direto no Supabase pelo navegador (a RLS restringe à diretoria), igual
// à tela de Webhooks.
// =====================================================================

type Vinculo = { inbox_id: string; bot_id: string };

/** Etiqueta pequena e neutra — funciona nos dois temas. */
function Badge({
  children,
  tom = "neutro",
}: {
  children: React.ReactNode;
  tom?: "neutro" | "ok" | "erro" | "alerta";
}) {
  const cls = {
    neutro: "bg-muted text-muted-foreground",
    ok: "bg-emerald-500/12 text-emerald-700 dark:text-emerald-300",
    erro: "bg-red-500/12 text-red-700 dark:text-red-300",
    alerta: "bg-amber-500/12 text-amber-800 dark:text-amber-300",
  }[tom];
  return (
    <span className={`inline-block rounded px-1.5 py-0.5 text-[11px] leading-tight ${cls}`}>
      {children}
    </span>
  );
}

/** Botão de copiar que confirma visualmente por 2 s. */
function BotaoCopiar({ texto, rotulo = "Copiar" }: { texto: string; rotulo?: string }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => {
        void navigator.clipboard.writeText(texto).then(() => {
          setCopiado(true);
          setTimeout(() => setCopiado(false), 2000);
        });
      }}
    >
      {copiado ? <Check size={14} /> : <Copy size={14} />} {copiado ? "Copiado" : rotulo}
    </Button>
  );
}

type Rascunho = {
  id: string | null;
  nome: string;
  descricao: string;
  outgoingUrl: string;
  inboxId: string;
  ativo: boolean;
};

const VAZIO: Rascunho = {
  id: null,
  nome: "",
  descricao: "",
  outgoingUrl: "https://",
  inboxId: "",
  ativo: true,
};

/** O que a tela mostra UMA vez depois de criar o bot. */
type Credenciais = { bot: AgentBot; token: string };

type ResultadoTeste = { ok: boolean; status: number | null; duracao_ms: number; erro: string | null };

export function BotsManager({
  initial,
  initialVinculos,
  caixas,
}: {
  initial: AgentBot[];
  initialVinculos: Vinculo[];
  caixas: AtendimentoInbox[];
}) {
  const [bots, setBots] = useState(initial);
  const [vinculos, setVinculos] = useState(initialVinculos);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [excluindo, setExcluindo] = useState<AgentBot | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  const [credenciais, setCredenciais] = useState<Credenciais | null>(null);

  const [expandido, setExpandido] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Record<string, BotDelivery[]>>({});
  const [carregandoEntregas, setCarregandoEntregas] = useState(false);

  const [testando, setTestando] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, ResultadoTeste>>({});

  const supabase = () => createSupabaseBrowser();

  const urlValida = (u: string) => /^https:\/\/.+\..+/i.test(u.trim());

  /** Caixas atendidas por um bot (na prática 0 ou 1, mas o vínculo é por caixa). */
  const caixasDoBot = useCallback(
    (botId: string) =>
      vinculos
        .filter((v) => v.bot_id === botId)
        .map((v) => caixas.find((c) => c.id === v.inbox_id)?.nome ?? "caixa removida"),
    [vinculos, caixas],
  );

  /** Qual bot já ocupa esta caixa? Uma caixa só aceita um. */
  const botDaCaixa = (inboxId: string) => vinculos.find((v) => v.inbox_id === inboxId)?.bot_id ?? null;

  function novo() {
    setRascunho({ ...VAZIO });
    setErro(null);
  }

  function editar(b: AgentBot) {
    setErro(null);
    setRascunho({
      id: b.id,
      nome: b.nome,
      descricao: b.descricao ?? "",
      outgoingUrl: b.outgoing_url,
      inboxId: vinculos.find((v) => v.bot_id === b.id)?.inbox_id ?? "",
      ativo: b.ativo,
    });
  }

  async function salvar() {
    if (!rascunho) return;
    if (!rascunho.nome.trim()) return;
    if (!urlValida(rascunho.outgoingUrl)) {
      setErro("A URL precisa começar com https:// — o corpo leva a conversa do cliente.");
      return;
    }
    // Uma caixa, um bot: dois bots respondendo o mesmo cliente ao mesmo
    // tempo é o pior defeito possível deste recurso. Barramos na tela e o
    // banco reforça (inbox_id é chave primária do vínculo).
    const ocupante = rascunho.inboxId ? botDaCaixa(rascunho.inboxId) : null;
    if (ocupante && ocupante !== rascunho.id) {
      const nomeOcupante = bots.find((b) => b.id === ocupante)?.nome ?? "outro bot";
      setErro(`Essa caixa já é atendida por "${nomeOcupante}". Uma caixa só pode ter um bot.`);
      return;
    }

    setSalvando(true);
    setErro(null);

    try {
      if (rascunho.id) {
        // ---- Edição: direto no Supabase (RLS = diretoria) ----
        const { data, error } = await supabase()
          .from("atendimento_agent_bots")
          .update({
            nome: rascunho.nome.trim(),
            descricao: rascunho.descricao.trim() || null,
            outgoing_url: rascunho.outgoingUrl.trim(),
            ativo: rascunho.ativo,
          })
          .eq("id", rascunho.id)
          .select("*")
          .single();
        if (error) { setErro(error.message); return; }

        await sincronizarCaixa(rascunho.id, rascunho.inboxId);
        const salvo = data as AgentBot;
        setBots((lista) => lista.map((x) => (x.id === salvo.id ? salvo : x)));
        setRascunho(null);
        return;
      }

      // ---- Criação: pelo servidor, porque o token nasce lá ----
      const r = await fetch("/api/atendimento/bots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nome: rascunho.nome.trim(),
          descricao: rascunho.descricao.trim() || null,
          outgoingUrl: rascunho.outgoingUrl.trim(),
          inboxId: rascunho.inboxId || null,
        }),
      });
      const json = (await r.json()) as {
        error?: string;
        token?: string;
        registro?: AgentBot;
        inboxId?: string | null;
      };
      if (!r.ok || !json.registro || !json.token) {
        setErro(json.error ?? "falha ao criar o bot");
        return;
      }

      const criado = json.registro as AgentBot;
      setBots((lista) => [criado, ...lista]);
      // O servidor confirma o vínculo (ele pode ter falhado sem derrubar a
      // criação do bot), então usamos o que VOLTOU e não o que enviamos.
      const inboxVinculado = json.inboxId;
      if (inboxVinculado) {
        setVinculos((v) => [
          ...v.filter((x) => x.inbox_id !== inboxVinculado),
          { inbox_id: inboxVinculado, bot_id: criado.id },
        ]);
      }
      setRascunho(null);
      // O token só existe em claro AQUI. Depois disto, nem nós recuperamos.
      setCredenciais({ bot: json.registro, token: json.token });
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  /** Aplica a troca de caixa do bot em `atendimento_inbox_bots`. */
  async function sincronizarCaixa(botId: string, inboxId: string) {
    const sb = supabase();
    const atual = vinculos.find((v) => v.bot_id === botId)?.inbox_id ?? "";
    if (atual === inboxId) return;

    if (atual) {
      await sb.from("atendimento_inbox_bots").delete().eq("inbox_id", atual);
    }
    if (inboxId) {
      // `inbox_id` é a PK: upsert cobre o caso de a caixa ter um vínculo
      // órfão que a tela não conhecia.
      await sb
        .from("atendimento_inbox_bots")
        .upsert({ inbox_id: inboxId, bot_id: botId }, { onConflict: "inbox_id" });
    }
    setVinculos((v) => {
      const sem = v.filter((x) => x.bot_id !== botId && x.inbox_id !== inboxId);
      return inboxId ? [...sem, { inbox_id: inboxId, bot_id: botId }] : sem;
    });
  }

  /** Liga/desliga na hora — pausar um bot é urgente, não merece modal. */
  async function alternarAtivo(b: AgentBot, ativo: boolean) {
    setBots((lista) => lista.map((x) => (x.id === b.id ? { ...x, ativo } : x)));
    const { error } = await supabase()
      .from("atendimento_agent_bots")
      .update({
        ativo,
        // Religar zera o contador: senão um bot desligado por 10 falhas
        // voltaria com 10 no placar e cairia de novo na primeira falha.
        ...(ativo ? { falhas_seguidas: 0, ultimo_erro: null } : {}),
      })
      .eq("id", b.id);
    if (error) {
      setErro(error.message);
      setBots((lista) => lista.map((x) => (x.id === b.id ? { ...x, ativo: !ativo } : x)));
    }
  }

  async function excluir() {
    if (!excluindo) return;
    const { error } = await supabase()
      .from("atendimento_agent_bots")
      .delete()
      .eq("id", excluindo.id);
    if (error) { setErro(error.message); setExcluindo(null); return; }
    setBots((lista) => lista.filter((x) => x.id !== excluindo.id));
    setVinculos((v) => v.filter((x) => x.bot_id !== excluindo.id));
    setExcluindo(null);
  }

  const carregarEntregas = useCallback(async (id: string) => {
    setCarregandoEntregas(true);
    const { data } = await createSupabaseBrowser()
      .from("atendimento_bot_deliveries")
      .select("*")
      .eq("bot_id", id)
      .order("created_at", { ascending: false })
      .limit(10);
    setEntregas((e) => ({ ...e, [id]: (data ?? []) as BotDelivery[] }));
    setCarregandoEntregas(false);
  }, []);

  function alternarExpandido(b: AgentBot) {
    if (expandido === b.id) { setExpandido(null); return; }
    setExpandido(b.id);
    void carregarEntregas(b.id);
  }

  async function testar(b: AgentBot) {
    setTestando(b.id);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/bots/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: b.id }),
      });
      const json = await r.json();
      if (!r.ok) { setErro(json.error ?? "falha ao testar"); return; }
      setResultados((m) => ({ ...m, [b.id]: json as ResultadoTeste }));
      // O teste também mexe no estado do bot no banco; recarrega a linha
      // para o "último status" da tabela não ficar mentindo.
      const { data } = await supabase()
        .from("atendimento_agent_bots").select("*").eq("id", b.id).single();
      if (data) setBots((lista) => lista.map((x) => (x.id === b.id ? (data as AgentBot) : x)));
      if (expandido === b.id) void carregarEntregas(b.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao testar");
    } finally {
      setTestando(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Agent Bots"
        descricao="Um sistema externo (n8n, Dialogflow, script próprio) atende uma caixa como se fosse um agente."
        acoes={
          <Button type="button" variant="gold" size="sm" onClick={novo}>
            <Plus size={15} /> Novo bot
          </Button>
        }
      />

      <Alerta tipo="info">
        Toda mensagem que o cliente mandar na caixa do bot é enviada por <strong>POST assinado</strong>{" "}
        para a URL dele. O bot responde chamando a nossa API de volta — e pode{" "}
        <strong>transferir para um humano</strong> a qualquer momento. Depois da transferência ele
        para de receber as mensagens daquela conversa.
      </Alerta>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {bots.length === 0 ? (
        <EmptyState
          icone={<Bot size={34} />}
          titulo="Nenhum bot cadastrado"
          descricao="Cadastre um bot para ele atender uma caixa de entrada automaticamente."
          acao={
            <Button type="button" variant="gold" size="sm" onClick={novo}>
              <Plus size={15} /> Novo bot
            </Button>
          }
        />
      ) : (
        <Card>
          <Table
            colunas={["", "Nome / URL", "Caixa atendida", "Ativo", "Último status", "Último envio", "Falhas", ""]}
          >
            {bots.map((b) => {
              const aberto = expandido === b.id;
              const teste = resultados[b.id];
              const atendidas = caixasDoBot(b.id);
              return (
                // Fragment com key: a linha e o painel expandido são dois
                // <tr> irmãos, e o <tbody> não aceita wrapper no meio.
                <Fragment key={b.id}>
                  <tr className="hover:bg-muted/30 align-top">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => alternarExpandido(b)}
                        className="p-1 rounded text-muted-foreground hover:bg-muted"
                        aria-label={aberto ? "Recolher entregas" : "Ver últimas entregas"}
                      >
                        {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 max-w-[280px]">
                      <div className="font-medium">{b.nome}</div>
                      <div className="text-xs text-muted-foreground truncate" title={b.outgoing_url}>
                        {b.outgoing_url}
                      </div>
                      {b.descricao && (
                        <div className="text-[11px] text-muted-foreground/80 mt-0.5 truncate" title={b.descricao}>
                          {b.descricao}
                        </div>
                      )}
                      {teste && (
                        <div className="mt-1">
                          <Badge tom={teste.ok ? "ok" : "erro"}>
                            teste: {teste.status ?? "sem resposta"} · {teste.duracao_ms} ms
                          </Badge>
                          {teste.erro && (
                            <div className="text-[11px] text-red-600 dark:text-red-400 mt-0.5 break-all">
                              {teste.erro}
                            </div>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      {atendidas.length === 0 ? (
                        // Bot sem caixa é bot que nunca recebe nada — o aviso
                        // evita o "cadastrei e não funciona".
                        <Badge tom="alerta">sem caixa</Badge>
                      ) : (
                        <div className="flex flex-wrap gap-1 max-w-[200px]">
                          {atendidas.map((n) => <Badge key={n}>{n}</Badge>)}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={b.ativo} onChange={(v) => void alternarAtivo(b, v)} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.ultimo_status == null ? (
                        <span className="text-xs text-muted-foreground">nunca enviado</span>
                      ) : (
                        <Badge tom={b.ultimo_status >= 200 && b.ultimo_status < 300 ? "ok" : "erro"}>
                          HTTP {b.ultimo_status}
                        </Badge>
                      )}
                      {b.ultimo_erro && (
                        <div
                          className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] truncate"
                          title={b.ultimo_erro}
                        >
                          {b.ultimo_erro}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {b.ultimo_envio_em ? formatDateTimeBR(b.ultimo_envio_em) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {b.falhas_seguidas > 0
                        ? <Badge tom="alerta">{b.falhas_seguidas}</Badge>
                        : <span className="text-xs text-muted-foreground">0</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void testar(b)}
                          disabled={testando === b.id}
                          className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          aria-label="Testar"
                          title="Enviar um payload de exemplo"
                        >
                          {testando === b.id ? <Spinner size={15} /> : <Send size={15} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => editar(b)}
                          className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcluindo(b)}
                          className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                          aria-label="Excluir"
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {aberto && (
                    <tr className="bg-muted/20">
                      <td colSpan={8} className="px-4 py-3">
                        <div className="text-xs font-medium mb-2">Últimas 10 entregas</div>
                        {carregandoEntregas && !entregas[b.id] ? (
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Spinner size={13} /> carregando…
                          </div>
                        ) : (entregas[b.id] ?? []).length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Nenhuma entrega registrada. Use o botão de teste para gerar a primeira.
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {(entregas[b.id] ?? []).map((d) => (
                              <div
                                key={d.id}
                                className="flex items-start gap-3 text-xs border-b last:border-0 py-1.5"
                              >
                                <span className="w-32 shrink-0 text-muted-foreground">
                                  {formatDateTimeBR(d.created_at)}
                                </span>
                                <span className="w-24 shrink-0">
                                  <Badge tom={d.status != null && d.status >= 200 && d.status < 300 ? "ok" : "erro"}>
                                    {d.status ?? "sem resposta"}
                                  </Badge>
                                </span>
                                <span className="w-20 shrink-0 text-muted-foreground">
                                  {d.duracao_ms != null ? `${d.duracao_ms} ms` : "—"}
                                </span>
                                <span className="w-56 shrink-0 text-muted-foreground truncate" title={d.conversation_id ?? ""}>
                                  {d.conversation_id ? `conversa ${d.conversation_id.slice(0, 8)}…` : "teste"}
                                </span>
                                <span className="min-w-0 flex-1 text-red-600 dark:text-red-400 break-all">
                                  {d.erro ?? ""}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </Table>
        </Card>
      )}

      <DocumentacaoApi />

      {/* ---------- Modal criar / editar ---------- */}
      <Modal
        aberto={rascunho != null}
        onFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? "Editar bot" : "Novo bot"}
        descricao="Cada mensagem recebida na caixa escolhida vira um POST assinado para esta URL."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRascunho(null)}>
              Cancelar
            </Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => void salvar()}
              disabled={salvando || !rascunho?.nome.trim() || !rascunho || !urlValida(rascunho.outgoingUrl)}
            >
              {salvando && <Spinner />} Salvar
            </Button>
          </>
        }
      >
        {rascunho && (
          <>
            <Field label="Nome" obrigatorio dica="Só para você identificar na lista.">
              <TextInput
                value={rascunho.nome}
                onChange={(e) => setRascunho({ ...rascunho, nome: e.target.value })}
                placeholder="Ex.: Triagem do WhatsApp"
                autoFocus
              />
            </Field>

            <Field label="Descrição" dica="O que este bot faz? Ajuda quem for mexer depois.">
              <TextArea
                rows={2}
                value={rascunho.descricao}
                onChange={(e) => setRascunho({ ...rascunho, descricao: e.target.value })}
                placeholder="Ex.: pergunta o CPF, consulta o ERP e transfere para o financeiro."
              />
            </Field>

            <Field
              label="URL do bot"
              obrigatorio
              dica={
                urlValida(rascunho.outgoingUrl)
                  ? "Recebe um POST com JSON no corpo, assinado com HMAC-SHA256."
                  : "Precisa ser https:// — o corpo leva a conversa do cliente."
              }
            >
              <TextInput
                value={rascunho.outgoingUrl}
                onChange={(e) => setRascunho({ ...rascunho, outgoingUrl: e.target.value })}
                placeholder="https://seu-bot.com.br/arini"
              />
            </Field>

            <Field
              label="Caixa de entrada atendida"
              dica="Uma caixa só pode ter um bot. Sem caixa, o bot fica cadastrado mas nunca recebe nada."
            >
              <SelectInput
                value={rascunho.inboxId}
                onChange={(e) => setRascunho({ ...rascunho, inboxId: e.target.value })}
              >
                <option value="">— nenhuma —</option>
                {caixas.map((c) => {
                  const ocupante = botDaCaixa(c.id);
                  const ocupada = ocupante != null && ocupante !== rascunho.id;
                  return (
                    <option key={c.id} value={c.id} disabled={ocupada}>
                      {c.nome} ({c.canal})
                      {ocupada ? ` — já tem bot` : ""}
                    </option>
                  );
                })}
              </SelectInput>
            </Field>

            {rascunho.id && (
              <Switch
                checked={rascunho.ativo}
                onChange={(v) => setRascunho({ ...rascunho, ativo: v })}
                label="Ativo"
                dica="Desligado, o bot não recebe mensagem nem consegue usar a API."
              />
            )}
          </>
        )}
      </Modal>

      {/* ---------- Credenciais recém-criadas (aparecem UMA vez) ---------- */}
      <Modal
        aberto={credenciais != null}
        onFechar={() => setCredenciais(null)}
        titulo="Bot criado — copie o token agora"
        largura="max-w-xl"
        rodape={
          <Button type="button" variant="gold" size="sm" onClick={() => setCredenciais(null)}>
            Entendi
          </Button>
        }
      >
        {credenciais && (
          <>
            <Alerta tipo="atencao">
              <strong>{credenciais.bot.nome}</strong> está cadastrado. Guardamos apenas o hash do
              token: <strong>ele não aparece de novo em lugar nenhum</strong>. Se perder, é preciso
              criar outro bot.
            </Alerta>

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="text-[11px] text-muted-foreground">
                Token do bot — é a <strong>credencial de escrita</strong>. Mande no header{" "}
                <code className="text-foreground">Authorization: Bearer …</code> em toda chamada que
                o bot fizer para a nossa API.
              </div>
              <code className="block text-xs break-all font-mono">{credenciais.token}</code>
              <BotaoCopiar texto={credenciais.token} rotulo="Copiar token" />
            </div>

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="text-[11px] text-muted-foreground">
                Chave de assinatura (secret) — serve para o bot <strong>conferir</strong> que o POST
                que ele recebeu veio mesmo daqui. Não dá acesso a nada; esta continua visível na
                tela depois.
              </div>
              <code className="block text-xs break-all font-mono">{credenciais.bot.secret}</code>
              <BotaoCopiar texto={credenciais.bot.secret} rotulo="Copiar chave" />
            </div>

            <p className="text-xs text-muted-foreground">
              Em resumo: o <strong>secret</strong> prova que a mensagem veio da Arini; o{" "}
              <strong>token</strong> prova para a Arini que é o bot falando. São coisas diferentes e
              não se substituem.
            </p>
          </>
        )}
      </Modal>

      {/* ---------- Confirmação de exclusão ---------- */}
      <Modal
        aberto={excluindo != null}
        onFechar={() => setExcluindo(null)}
        titulo="Excluir bot"
        descricao="Esta ação não pode ser desfeita."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setExcluindo(null)}>
              Cancelar
            </Button>
            <Button type="button" variant="destructive" size="sm" onClick={() => void excluir()}>
              <Trash2 size={15} /> Excluir
            </Button>
          </>
        }
      >
        <p className="text-sm">
          Excluir <strong>{excluindo?.nome}</strong>? O token dele para de funcionar na hora, o
          vínculo com a caixa some e o histórico de entregas também. As conversas que ele conduzia
          continuam existindo, mas ficam sem bot. Se a ideia é só pausar, desligue o interruptor
          &ldquo;Ativo&rdquo;.
        </p>
      </Modal>
    </div>
  );
}

// =====================================================================
// Documentação da API — é isto que o integrador vai ler.
//
// Fica na própria tela de propósito: quem configura o bot é quem precisa
// da referência, e mandá-lo procurar num README separado é o jeito mais
// rápido de a integração sair errada.
// =====================================================================

function Bloco({ children }: { children: string }) {
  return (
    <pre className="rounded-lg border bg-muted/40 p-3 overflow-x-auto text-[11px] leading-relaxed text-foreground">
      {children}
    </pre>
  );
}

function DocumentacaoApi() {
  return (
    <Card
      titulo="API do bot — referência para o integrador"
      descricao="O que o bot recebe, como ele responde e como autenticar."
    >
      <div className="p-4 space-y-5 text-xs text-muted-foreground">
        {/* ---- 1. O que o bot RECEBE ---- */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">1. O que o bot recebe</h4>
          <p>
            A cada mensagem do cliente numa caixa atendida pelo bot, fazemos um{" "}
            <code className="text-foreground">POST</code> na URL cadastrada, com estes headers:
          </p>
          <Bloco>{`Content-Type:      application/json
X-Arini-Signature: sha256=<hmac hex do corpo cru, com o SECRET do bot>
X-Arini-Bot:       <id do bot>
X-Arini-Evento:    mensagem`}</Bloco>
          <p>E este corpo:</p>
          <Bloco>{`{
  "evento": "mensagem",
  "enviado_em": "2026-01-31T14:02:11.930Z",
  "conversa": {
    "id": "…", "canal": "whatsapp", "status": "aberta",
    "prioridade": null, "etiquetas": [], "inbox_id": "…",
    "bot_status": "ativo", "criada_em": "…", "atributos": {}
  },
  "contato": { "id": "…", "nome": "…", "telefone": "…", "email": "…" },
  "mensagem": {
    "id": "…", "direcao": "in", "remetente": "cliente",
    "tipo": "texto", "texto": "…",
    "media_url": null, "media_nome": null, "media_mime": null,
    "criada_em": "…"
  }
}`}</Bloco>
          <p>
            Confira a assinatura antes de confiar no corpo — o HMAC é sobre o{" "}
            <strong>texto cru</strong> da requisição, antes do <code className="text-foreground">JSON.parse</code>:
          </p>
          <Bloco>{`const esperado = "sha256=" + crypto
  .createHmac("sha256", SECRET_DO_BOT)
  .update(corpoBruto)
  .digest("hex");

if (esperado !== req.headers["x-arini-signature"]) return res.status(401).end();`}</Bloco>
          <p>
            Responda <strong>2xx rápido</strong>: esperamos no máximo 10 segundos, e depois de{" "}
            <strong>10 falhas seguidas</strong> o bot é desativado sozinho. Nota interna da equipe{" "}
            <strong>nunca</strong> é enviada ao bot.
          </p>
        </section>

        {/* ---- 2. Autenticação ---- */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">2. Como o bot responde (autenticação)</h4>
          <p>
            Toda chamada do bot para a nossa API leva o token dele — aquele que apareceu uma única
            vez no cadastro:
          </p>
          <Bloco>{`Authorization: Bearer arini_xxxxxxxxxxxxxxxxxxxxxxxx`}</Bloco>
          <p>
            Token inválido, ausente ou de um bot desativado devolve{" "}
            <code className="text-foreground">401</code>. Conversa que não pertence a uma caixa
            daquele bot devolve <code className="text-foreground">404</code> — um bot não enxerga
            conversa de outra caixa.
          </p>
        </section>

        {/* ---- 3. Os 4 endpoints ---- */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">3. Endpoints</h4>
          <Bloco>{`POST /api/bot/v1/mensagens
  { "conversationId": "…", "texto": "…",
    "mediaUrl": null, "mediaTipo": "imagem|audio|video|documento",
    "privada": false }
  → grava a mensagem como remetente "bot" e ENVIA ao cliente pelo canal
    da conversa. Com "privada": true vira NOTA INTERNA e não sai.
  ← { ok, mensagemId, entregue, via, motivo }

POST /api/bot/v1/transferir
  { "conversationId": "…", "motivo": "…",
    "equipeId": null, "agenteId": null }
  → passa a conversa para um humano. O bot PARA de receber as mensagens
    dela. Fica registrada uma nota interna com o motivo.
  ← { ok, conversationId, botStatus: "transferida", equipeId, agenteId, avisos }

POST /api/bot/v1/etiquetas
  { "conversationId": "…", "adicionar": ["financeiro"], "remover": ["novo"] }
  → classifica a conversa. Etiqueta nova entra no catálogo automaticamente.
  ← { ok, etiquetas: [...] }

GET  /api/bot/v1/conversas/<id>
  → a conversa e as últimas 30 mensagens NÃO internas, em ordem
    cronológica. O bot não lê nota da equipe.
  ← { ok, conversa, contato, mensagens: [...] }`}</Bloco>
        </section>

        {/* ---- 4. Exemplo ---- */}
        <section className="space-y-2">
          <h4 className="text-xs font-semibold text-foreground">4. Exemplo com curl</h4>
          <Bloco>{`# Responder o cliente
curl -X POST https://atendimento.SEU-DOMINIO.com.br/api/bot/v1/mensagens \\
  -H "Authorization: Bearer $ARINI_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"conversationId":"<id>","texto":"Oi! Sou o assistente. Me diz seu CPF?"}'

# Deixar um recado só para a equipe (não vai para o cliente)
curl -X POST https://atendimento.SEU-DOMINIO.com.br/api/bot/v1/mensagens \\
  -H "Authorization: Bearer $ARINI_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"conversationId":"<id>","texto":"CPF confere. Cliente adimplente.","privada":true}'

# Desistir e chamar gente
curl -X POST https://atendimento.SEU-DOMINIO.com.br/api/bot/v1/transferir \\
  -H "Authorization: Bearer $ARINI_BOT_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '{"conversationId":"<id>","motivo":"Não entendi o pedido depois de 3 tentativas."}'

# Ler o histórico
curl https://atendimento.SEU-DOMINIO.com.br/api/bot/v1/conversas/<id> \\
  -H "Authorization: Bearer $ARINI_BOT_TOKEN"`}</Bloco>
        </section>
      </div>
    </Card>
  );
}
