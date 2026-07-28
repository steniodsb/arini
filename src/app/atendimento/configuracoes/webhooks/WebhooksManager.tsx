"use client";

import { Fragment, useCallback, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageHeader, Modal, Field, TextInput, Switch,
  EmptyState, Card, Table, Alerta, Spinner,
} from "@/components/atendimento/ui";
import {
  WEBHOOK_EVENT_LABELS,
  type AtendimentoWebhook,
  type WebhookDelivery,
  type WebhookEvent,
} from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import {
  Plus, Pencil, Trash2, Webhook, Send, ChevronRight, ChevronDown, Copy, Check,
} from "lucide-react";

const EVENTOS = Object.keys(WEBHOOK_EVENT_LABELS) as WebhookEvent[];

/** Etiqueta pequena e neutra — funciona nos dois temas. */
function Badge({ children, tom = "neutro" }: { children: React.ReactNode; tom?: "neutro" | "ok" | "erro" | "alerta" }) {
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
  url: string;
  eventos: WebhookEvent[];
  ativo: boolean;
};

const VAZIO: Rascunho = {
  id: null,
  nome: "",
  url: "https://",
  eventos: ["conversa_criada", "mensagem_criada"],
  ativo: true,
};

type ResultadoTeste = { ok: boolean; status: number | null; duracao_ms: number; erro: string | null };

export function WebhooksManager({ initial }: { initial: AtendimentoWebhook[] }) {
  const [webhooks, setWebhooks] = useState(initial);
  const [rascunho, setRascunho] = useState<Rascunho | null>(null);
  const [excluindo, setExcluindo] = useState<AtendimentoWebhook | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);

  // Secret recém-criado: só aparece logo depois do cadastro, porque é a hora
  // em que a pessoa precisa levá-lo para o outro sistema.
  const [secretNovo, setSecretNovo] = useState<AtendimentoWebhook | null>(null);

  // Linha expandida + cache das entregas por webhook (não recarregar a cada
  // abre/fecha).
  const [expandido, setExpandido] = useState<string | null>(null);
  const [entregas, setEntregas] = useState<Record<string, WebhookDelivery[]>>({});
  const [carregandoEntregas, setCarregandoEntregas] = useState(false);

  const [testando, setTestando] = useState<string | null>(null);
  const [resultados, setResultados] = useState<Record<string, ResultadoTeste>>({});

  const supabase = () => createSupabaseBrowser();

  const urlValida = (u: string) => /^https:\/\/.+\..+/i.test(u.trim());

  function novo() { setRascunho({ ...VAZIO }); setErro(null); }
  function editar(w: AtendimentoWebhook) {
    setErro(null);
    setRascunho({ id: w.id, nome: w.nome, url: w.url, eventos: w.eventos ?? [], ativo: w.ativo });
  }

  async function salvar() {
    if (!rascunho) return;
    if (!rascunho.nome.trim()) return;
    if (!urlValida(rascunho.url)) {
      setErro("A URL precisa começar com https:// — não mandamos evento assinado por conexão sem TLS.");
      return;
    }
    if (rascunho.eventos.length === 0) {
      setErro("Escolha ao menos um evento, senão o webhook nunca dispara.");
      return;
    }

    setSalvando(true);
    setErro(null);
    const payload = {
      nome: rascunho.nome.trim(),
      url: rascunho.url.trim(),
      eventos: rascunho.eventos,
      ativo: rascunho.ativo,
    };

    const sb = supabase();
    const { data, error } = rascunho.id
      ? await sb.from("atendimento_webhooks").update(payload).eq("id", rascunho.id).select("*").single()
      : await sb.from("atendimento_webhooks").insert(payload).select("*").single();
    setSalvando(false);
    if (error) { setErro(error.message); return; }

    const salvo = data as AtendimentoWebhook;
    const eraNovo = !rascunho.id;
    setWebhooks((lista) =>
      eraNovo ? [salvo, ...lista] : lista.map((x) => (x.id === salvo.id ? salvo : x)),
    );
    setRascunho(null);
    if (eraNovo) setSecretNovo(salvo);
  }

  /** Liga/desliga na hora — pausar um webhook é urgente, não merece modal. */
  async function alternarAtivo(w: AtendimentoWebhook, ativo: boolean) {
    setWebhooks((lista) => lista.map((x) => (x.id === w.id ? { ...x, ativo } : x)));
    const { error } = await supabase().from("atendimento_webhooks").update({ ativo }).eq("id", w.id);
    if (error) {
      setErro(error.message);
      // Desfaz o otimismo se o banco recusou.
      setWebhooks((lista) => lista.map((x) => (x.id === w.id ? { ...x, ativo: !ativo } : x)));
    }
  }

  async function excluir() {
    if (!excluindo) return;
    const { error } = await supabase().from("atendimento_webhooks").delete().eq("id", excluindo.id);
    if (error) { setErro(error.message); setExcluindo(null); return; }
    setWebhooks((lista) => lista.filter((x) => x.id !== excluindo.id));
    setExcluindo(null);
  }

  const carregarEntregas = useCallback(async (id: string) => {
    setCarregandoEntregas(true);
    const { data } = await createSupabaseBrowser()
      .from("atendimento_webhook_deliveries")
      .select("*")
      .eq("webhook_id", id)
      .order("created_at", { ascending: false })
      .limit(10);
    setEntregas((e) => ({ ...e, [id]: (data ?? []) as WebhookDelivery[] }));
    setCarregandoEntregas(false);
  }, []);

  function alternarExpandido(w: AtendimentoWebhook) {
    if (expandido === w.id) { setExpandido(null); return; }
    setExpandido(w.id);
    void carregarEntregas(w.id);
  }

  async function testar(w: AtendimentoWebhook) {
    setTestando(w.id);
    setErro(null);
    try {
      const r = await fetch("/api/atendimento/webhooks/testar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id: w.id }),
      });
      const json = await r.json();
      if (!r.ok) { setErro(json.error ?? "falha ao testar"); return; }
      setResultados((m) => ({ ...m, [w.id]: json as ResultadoTeste }));
      // O teste também mexe no estado do webhook no banco; recarrega a linha
      // para o "último status" da tabela não ficar mentindo.
      const { data } = await supabase().from("atendimento_webhooks").select("*").eq("id", w.id).single();
      if (data) setWebhooks((lista) => lista.map((x) => (x.id === w.id ? (data as AtendimentoWebhook) : x)));
      if (expandido === w.id) void carregarEntregas(w.id);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao testar");
    } finally {
      setTestando(null);
    }
  }

  return (
    <div className="space-y-5">
      <PageHeader
        titulo="Webhooks"
        descricao="Envie os eventos do atendimento para uma URL externa, assinados com HMAC-SHA256."
        acoes={
          <Button type="button" variant="gold" size="sm" onClick={novo}>
            <Plus size={15} /> Novo webhook
          </Button>
        }
      />

      <Alerta tipo="info">
        Os endpoints já podem ser cadastrados e <strong>testados</strong> agora. O disparo automático
        nos eventos reais (conversa criada, mensagem, resolução) ainda não está ligado — entra na
        próxima onda. Por enquanto, só o botão &ldquo;Testar&rdquo; envia alguma coisa para fora.
      </Alerta>

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {webhooks.length === 0 ? (
        <EmptyState
          icone={<Webhook size={34} />}
          titulo="Nenhum webhook cadastrado"
          descricao="Cadastre uma URL para receber os eventos do atendimento em outro sistema."
          acao={
            <Button type="button" variant="gold" size="sm" onClick={novo}>
              <Plus size={15} /> Novo webhook
            </Button>
          }
        />
      ) : (
        <Card>
          <Table colunas={["", "Nome / URL", "Eventos", "Ativo", "Último status", "Último envio", "Falhas", ""]}>
            {webhooks.map((w) => {
              const aberto = expandido === w.id;
              const teste = resultados[w.id];
              return (
                // Fragment com key: a linha da tabela e o painel expandido são
                // dois <tr> irmãos, e o <tbody> não aceita um wrapper no meio.
                <Fragment key={w.id}>
                  <tr className="hover:bg-muted/30 align-top">
                    <td className="px-2 py-2">
                      <button
                        type="button"
                        onClick={() => alternarExpandido(w)}
                        className="p-1 rounded text-muted-foreground hover:bg-muted"
                        aria-label={aberto ? "Recolher entregas" : "Ver últimas entregas"}
                      >
                        {aberto ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                      </button>
                    </td>
                    <td className="px-3 py-2 max-w-[280px]">
                      <div className="font-medium">{w.nome}</div>
                      <div className="text-xs text-muted-foreground truncate" title={w.url}>{w.url}</div>
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
                      <div className="flex flex-wrap gap-1 max-w-[220px]">
                        {(w.eventos ?? []).map((e) => (
                          <Badge key={e}>{WEBHOOK_EVENT_LABELS[e] ?? e}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <Switch checked={w.ativo} onChange={(v) => void alternarAtivo(w, v)} />
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {w.ultimo_status == null ? (
                        <span className="text-xs text-muted-foreground">nunca enviado</span>
                      ) : (
                        <Badge tom={w.ultimo_status >= 200 && w.ultimo_status < 300 ? "ok" : "erro"}>
                          HTTP {w.ultimo_status}
                        </Badge>
                      )}
                      {w.ultimo_erro && (
                        <div
                          className="text-[11px] text-muted-foreground mt-0.5 max-w-[200px] truncate"
                          title={w.ultimo_erro}
                        >
                          {w.ultimo_erro}
                        </div>
                      )}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap text-xs text-muted-foreground">
                      {w.ultimo_envio_em ? formatDateTimeBR(w.ultimo_envio_em) : "—"}
                    </td>
                    <td className="px-3 py-2 whitespace-nowrap">
                      {w.falhas_seguidas > 0
                        ? <Badge tom="alerta">{w.falhas_seguidas}</Badge>
                        : <span className="text-xs text-muted-foreground">0</span>}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => void testar(w)}
                          disabled={testando === w.id}
                          className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50"
                          aria-label="Testar"
                          title="Enviar um evento de teste"
                        >
                          {testando === w.id ? <Spinner size={15} /> : <Send size={15} />}
                        </button>
                        <button
                          type="button"
                          onClick={() => editar(w)}
                          className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          aria-label="Editar"
                        >
                          <Pencil size={15} />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExcluindo(w)}
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
                        {carregandoEntregas && !entregas[w.id] ? (
                          <div className="text-xs text-muted-foreground flex items-center gap-2">
                            <Spinner size={13} /> carregando…
                          </div>
                        ) : (entregas[w.id] ?? []).length === 0 ? (
                          <div className="text-xs text-muted-foreground">
                            Nenhuma entrega registrada. Use o botão de teste para gerar a primeira.
                          </div>
                        ) : (
                          <div className="space-y-1">
                            {(entregas[w.id] ?? []).map((d) => (
                              <div
                                key={d.id}
                                className="flex items-start gap-3 text-xs border-b last:border-0 py-1.5"
                              >
                                <span className="w-32 shrink-0 text-muted-foreground">
                                  {formatDateTimeBR(d.created_at)}
                                </span>
                                <span className="w-40 shrink-0">{d.evento}</span>
                                <span className="w-24 shrink-0">
                                  <Badge tom={d.status != null && d.status >= 200 && d.status < 300 ? "ok" : "erro"}>
                                    {d.status ?? "sem resposta"}
                                  </Badge>
                                </span>
                                <span className="w-20 shrink-0 text-muted-foreground">
                                  {d.duracao_ms != null ? `${d.duracao_ms} ms` : "—"}
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

      {/* ---------- Modal criar / editar ---------- */}
      <Modal
        aberto={rascunho != null}
        onFechar={() => setRascunho(null)}
        titulo={rascunho?.id ? "Editar webhook" : "Novo webhook"}
        descricao="Cada evento marcado vira um POST assinado para esta URL."
        rodape={
          <>
            <Button type="button" variant="ghost" size="sm" onClick={() => setRascunho(null)}>Cancelar</Button>
            <Button
              type="button"
              variant="gold"
              size="sm"
              onClick={() => void salvar()}
              disabled={salvando || !rascunho?.nome.trim() || !rascunho || !urlValida(rascunho.url)}
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
                placeholder="Ex.: ERP — novas conversas"
                autoFocus
              />
            </Field>

            <Field
              label="URL de destino"
              obrigatorio
              dica={
                urlValida(rascunho.url)
                  ? "Recebe um POST com JSON no corpo."
                  : "Precisa ser https:// — o evento vai assinado, mas o conteúdo é sensível."
              }
            >
              <TextInput
                value={rascunho.url}
                onChange={(e) => setRascunho({ ...rascunho, url: e.target.value })}
                placeholder="https://seu-sistema.com.br/hooks/arini"
              />
            </Field>

            <div className="space-y-1.5">
              <span className="text-xs font-medium">Eventos</span>
              <div className="space-y-1.5">
                {EVENTOS.map((ev) => {
                  const marcado = rascunho.eventos.includes(ev);
                  return (
                    <label key={ev} className="flex items-center gap-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        checked={marcado}
                        onChange={() =>
                          setRascunho({
                            ...rascunho,
                            eventos: marcado
                              ? rascunho.eventos.filter((x) => x !== ev)
                              : [...rascunho.eventos, ev],
                          })
                        }
                        className="rounded border accent-arini"
                      />
                      <span>{WEBHOOK_EVENT_LABELS[ev]}</span>
                      <code className="text-[11px] text-muted-foreground">{ev}</code>
                    </label>
                  );
                })}
              </div>
            </div>

            <Switch
              checked={rascunho.ativo}
              onChange={(v) => setRascunho({ ...rascunho, ativo: v })}
              label="Ativo"
              dica="Desligado, o webhook fica cadastrado mas não recebe nada."
            />
          </>
        )}
      </Modal>

      {/* ---------- Secret recém-criado ---------- */}
      <Modal
        aberto={secretNovo != null}
        onFechar={() => setSecretNovo(null)}
        titulo="Webhook criado — guarde a chave de assinatura"
        largura="max-w-xl"
        rodape={
          <Button type="button" variant="gold" size="sm" onClick={() => setSecretNovo(null)}>
            Entendi
          </Button>
        }
      >
        {secretNovo && (
          <>
            <Alerta tipo="sucesso">
              <strong>{secretNovo.nome}</strong> está cadastrado. A chave abaixo continua visível nesta
              tela depois (é ela que assina o corpo), mas o ideal é copiá-la agora para o outro sistema.
            </Alerta>

            <div className="rounded-lg border bg-muted/40 p-3 space-y-2">
              <div className="text-[11px] text-muted-foreground">Chave de assinatura (secret)</div>
              <code className="block text-xs break-all font-mono">{secretNovo.secret}</code>
              <BotaoCopiar texto={secretNovo.secret} rotulo="Copiar chave" />
            </div>

            <div className="text-xs text-muted-foreground space-y-2">
              <p>
                Todo POST vai com o header <code className="text-foreground">X-Arini-Signature</code> no
                formato <code className="text-foreground">sha256=&lt;hex&gt;</code>: é o HMAC-SHA256 do{" "}
                <strong>corpo cru</strong> da requisição, usando essa chave. Vem também o{" "}
                <code className="text-foreground">X-Arini-Evento</code> com o nome do evento.
              </p>
              <p>Para conferir do outro lado (Node):</p>
              <pre className="rounded-lg border bg-muted/40 p-3 overflow-x-auto text-[11px] leading-relaxed text-foreground">
{`const esperado = "sha256=" + crypto
  .createHmac("sha256", SEU_SECRET)
  .update(corpoBruto)          // o texto CRU, antes do JSON.parse
  .digest("hex");

if (esperado !== req.headers["x-arini-signature"]) {
  return res.status(401).end();
}`}
              </pre>
              <p>
                Compare com <code className="text-foreground">crypto.timingSafeEqual</code> se puder — e
                responda 2xx rápido: esperamos no máximo 10 segundos.
              </p>
            </div>
          </>
        )}
      </Modal>

      {/* ---------- Confirmação de exclusão ---------- */}
      <Modal
        aberto={excluindo != null}
        onFechar={() => setExcluindo(null)}
        titulo="Excluir webhook"
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
          Excluir <strong>{excluindo?.nome}</strong>? O histórico de entregas dele também some.
          Se a ideia é só pausar, desligue o interruptor &ldquo;Ativo&rdquo; em vez de excluir.
        </p>
      </Modal>
    </div>
  );
}
