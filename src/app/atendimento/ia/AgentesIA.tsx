"use client";

import { useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import {
  PageShell, PageHeader, Card, Switch, Alerta, Spinner, Table, EmptyState,
  Field, TextArea, SelectInput,
} from "@/components/atendimento/ui";
import {
  Bot, Sparkles, Route, BookOpen, KeyRound, Inbox, FileText, Check,
  FlaskConical, BarChart3,
} from "lucide-react";

// =====================================================================
// Recursos de IA do Atendimento.
//
// O que é real aqui: a chave do ambiente (booleano vindo do servidor), a
// configuração por caixa (grava no banco), o playground (chama a rota de
// verdade), os números da base de conhecimento e o log de uso.
//
// O que NÃO é real: triagem e auto-resposta ainda não rodam sozinhas —
// falta o gancho no webhook de entrada. Os interruptores só gravam a
// preferência. Está escrito na tela, sem enfeite.
// =====================================================================

/** Caixa de entrada com os campos de IA (0034). Só o que esta tela usa. */
export type CaixaIa = {
  id: string;
  nome: string;
  canal: string;
  ativo: boolean;
  ia_copiloto: boolean;
  ia_triagem: boolean;
  ia_auto_resposta: boolean;
  ia_modelo: string | null;
  ia_instrucoes: string | null;
};

export type LinhaUso = {
  id: string;
  conversation_id: string;
  tipo: "resposta" | "resumo" | "intencao";
  modelo: string | null;
  usada: boolean;
  created_at: string;
  contato_nome?: string | null;
};

export type ConversaRecente = {
  id: string;
  contato_nome: string | null;
  canal: string;
  last_message_at: string;
  ia_intencao: string | null;
};

/** Modelos oferecidos. Trade-off explicado na própria tela. */
const MODELOS = [
  {
    id: "claude-haiku-4-5-20251001",
    nome: "Claude Haiku 4.5 — rápido e barato (padrão)",
    dica: "Resposta em poucos segundos e custo baixo. Suficiente para triagem, resumo e respostas simples.",
  },
  {
    id: "claude-sonnet-5",
    nome: "Claude Sonnet 5 — mais caro, escreve melhor",
    dica: "Texto mais bem escrito e melhor raciocínio em conversa complicada. Custa vários múltiplos do Haiku e demora mais.",
  },
];

const TIPO_LABELS: Record<LinhaUso["tipo"], string> = {
  resposta: "Sugestão de resposta",
  resumo: "Resumo",
  intencao: "Intenção",
};

const INTENCAO_LABELS: Record<string, string> = {
  comprar: "Quer comprar",
  alugar: "Quer alugar",
  vender: "Quer vender",
  avaliar: "Quer avaliação",
  visita: "Quer agendar visita",
  financiamento: "Dúvida de financiamento",
  suporte: "Suporte / pós-venda",
  outro: "Outro",
};

type AcaoPlayground = "sugerir" | "resumir" | "classificar";

function dataCurta(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

export function AgentesIA({
  chaveConfigurada,
  artigosPublicados,
  artigosTotal,
  caixas: caixasIniciais,
  uso,
  conversas,
}: {
  chaveConfigurada: boolean;
  artigosPublicados: number;
  artigosTotal: number;
  caixas: CaixaIa[];
  uso: LinhaUso[];
  conversas: ConversaRecente[];
}) {
  const [caixas, setCaixas] = useState<CaixaIa[]>(caixasIniciais);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [salvo, setSalvo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  // Playground
  const [conversaSel, setConversaSel] = useState<string>(conversas[0]?.id ?? "");
  const [rodando, setRodando] = useState<AcaoPlayground | null>(null);
  const [saida, setSaida] = useState<{ acao: AcaoPlayground; texto: string; cacheada: boolean; modelo: string | null } | null>(null);
  const [erroPlay, setErroPlay] = useState<string | null>(null);
  const [faltaChavePlay, setFaltaChavePlay] = useState(false);

  /** Altera o rascunho local — só grava no "Salvar" da caixa. */
  function editar(id: string, patch: Partial<CaixaIa>) {
    setCaixas((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    setSalvo(null);
  }

  async function salvar(caixa: CaixaIa) {
    setSalvando(caixa.id);
    setErro(null);
    setSalvo(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("atendimento_inboxes")
      .update({
        ia_copiloto: caixa.ia_copiloto,
        ia_triagem: caixa.ia_triagem,
        ia_auto_resposta: caixa.ia_auto_resposta,
        ia_modelo: caixa.ia_modelo || MODELOS[0].id,
        ia_instrucoes: caixa.ia_instrucoes?.trim() || null,
      })
      .eq("id", caixa.id);
    setSalvando(null);
    if (error) setErro(error.message);
    else setSalvo(caixa.id);
  }

  async function rodarPlayground(acao: AcaoPlayground, forcar = false) {
    if (!conversaSel) return;
    setRodando(acao);
    setErroPlay(null);
    setFaltaChavePlay(false);
    try {
      const resp = await fetch("/api/atendimento/ia", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ conversationId: conversaSel, acao, forcar }),
      });
      const json = (await resp.json().catch(() => null)) as
        | { ok?: boolean; conteudo?: string; cacheada?: boolean; modelo?: string; erro?: string }
        | null;
      if (resp.status === 503) {
        setFaltaChavePlay(true);
        setErroPlay(json?.erro ?? "IA não configurada.");
        setSaida(null);
        return;
      }
      if (!resp.ok || !json?.ok || !json.conteudo) {
        setErroPlay(json?.erro ?? `Falha na requisição (HTTP ${resp.status}).`);
        setSaida(null);
        return;
      }
      setSaida({
        acao,
        texto: acao === "classificar" ? (INTENCAO_LABELS[json.conteudo] ?? json.conteudo) : json.conteudo,
        cacheada: Boolean(json.cacheada),
        modelo: json.modelo ?? null,
      });
    } catch (e) {
      setErroPlay(e instanceof Error ? e.message : "Não foi possível falar com o servidor.");
      setSaida(null);
    } finally {
      setRodando(null);
    }
  }

  return (
    <PageShell>
      <PageHeader
        titulo="Recursos de IA"
        descricao="Copiloto do atendente, triagem e auto-resposta — configurados caixa a caixa."
      />

      {/* ---------- Status da chave ---------- */}
      {chaveConfigurada ? (
        <Alerta tipo="sucesso">
          <span className="inline-flex items-center gap-1.5">
            <KeyRound size={12} /> <strong>ANTHROPIC_API_KEY</strong> está presente no servidor. O
            copiloto e o playground abaixo funcionam.
          </span>
        </Alerta>
      ) : (
        <Alerta tipo="atencao">
          <p className="font-medium mb-1">A IA está desligada: falta a chave da API</p>
          <p>
            Defina a variável de ambiente <code>ANTHROPIC_API_KEY</code> no servidor com a chave da
            sua conta em <code>console.anthropic.com</code> e reinicie a aplicação. Ela é secreta:{" "}
            <strong>não</strong> use o prefixo <code>NEXT_PUBLIC_</code> — isso a expõe no navegador.
            Enquanto ela não existir, todas as ações de IA respondem <code>503</code>.
          </p>
        </Alerta>
      )}

      {/* ---------- Honestidade sobre o que roda sozinho ---------- */}
      <Alerta tipo="info">
        <p className="font-medium mb-1">O que já roda e o que ainda não roda</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            <strong>Copiloto: funciona.</strong> O atendente aperta o botão dentro da conversa e
            recebe a sugestão na hora.
          </li>
          <li>
            <strong>Triagem automática: ainda NÃO roda sozinha.</strong> Falta o gancho no webhook de
            mensagem recebida (é a próxima onda). Hoje a intenção só é detectada quando alguém pede.
          </li>
          <li>
            <strong>Auto-resposta: ainda NÃO roda sozinha.</strong> Mesmo motivo — nenhuma mensagem é
            enviada ao cliente sem um humano apertar enviar.
          </li>
          <li>
            Os interruptores abaixo <strong>gravam a preferência</strong> da caixa. Eles deixam tudo
            pronto para quando o gancho existir; hoje não disparam nada por conta própria.
          </li>
        </ul>
      </Alerta>

      {/* ---------- Configuração por caixa ---------- */}
      <Card
        titulo="Configuração por caixa de entrada"
        descricao="Cada caixa tem seu tom de voz, seu modelo e seus limites."
      >
        {caixas.length === 0 ? (
          <EmptyState
            titulo="Nenhuma caixa de entrada cadastrada"
            descricao="Crie uma caixa em Configurações › Caixas de entrada para poder ligar a IA nela."
            icone={<Inbox size={34} />}
          />
        ) : (
          <div className="divide-y">
            {caixas.map((c) => (
              <div key={c.id} className="p-4 space-y-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <Inbox size={14} className="text-muted-foreground shrink-0" />
                  <span className="text-sm font-semibold">{c.nome}</span>
                  <span className="text-[11px] text-muted-foreground">{c.canal}</span>
                  {!c.ativo && (
                    <span className="rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                      inativa
                    </span>
                  )}
                </div>

                <div className="grid gap-3 sm:grid-cols-3">
                  <Switch
                    checked={c.ia_copiloto}
                    onChange={(v) => editar(c.id, { ia_copiloto: v })}
                    label="Copiloto do atendente"
                    dica="Mostra o painel de sugestão dentro da conversa."
                  />
                  <Switch
                    checked={c.ia_triagem}
                    onChange={(v) => editar(c.id, { ia_triagem: v })}
                    label="Triagem automática"
                    dica="Preferência gravada — ainda não dispara sozinha."
                  />
                  <Switch
                    checked={c.ia_auto_resposta}
                    onChange={(v) => editar(c.id, { ia_auto_resposta: v })}
                    label="Auto-resposta"
                    dica="Preferência gravada — nada é enviado sem humano."
                  />
                </div>

                <div className="grid gap-3 md:grid-cols-2">
                  <Field
                    label="Modelo"
                    dica={MODELOS.find((m) => m.id === (c.ia_modelo || MODELOS[0].id))?.dica}
                  >
                    <SelectInput
                      value={c.ia_modelo || MODELOS[0].id}
                      onChange={(e) => editar(c.id, { ia_modelo: e.target.value })}
                    >
                      {MODELOS.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.nome}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>

                  <Field
                    label="Instruções da caixa"
                    dica="Tom de voz, o que a IA nunca deve dizer e quando passar para um humano."
                  >
                    <TextArea
                      rows={4}
                      value={c.ia_instrucoes ?? ""}
                      onChange={(e) => editar(c.id, { ia_instrucoes: e.target.value })}
                      placeholder={
                        "Ex.: Trate o cliente por você. Nunca cite valor de aluguel ou condomínio — " +
                        "encaminhe ao corretor. Se pedirem desconto, diga que só o corretor pode negociar."
                      }
                    />
                  </Field>
                </div>

                <div className="flex items-center gap-2">
                  <Button size="sm" onClick={() => salvar(c)} disabled={salvando === c.id}>
                    {salvando === c.id ? <Spinner size={14} /> : <Check size={14} />} Salvar caixa
                  </Button>
                  {salvo === c.id && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400">Salvo.</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {erro && (
          <div className="px-4 pb-4">
            <Alerta tipo="erro">{erro}</Alerta>
          </div>
        )}
      </Card>

      {/* ---------- Playground ---------- */}
      <Card
        titulo="Playground"
        descricao="Rode as três ações numa conversa real antes de liberar para o time."
      >
        <div className="p-4 space-y-3">
          {conversas.length === 0 ? (
            <EmptyState
              titulo="Nenhuma conversa para testar"
              descricao="Assim que chegar a primeira mensagem, você poderá testar a qualidade da IA aqui."
              icone={<FlaskConical size={34} />}
            />
          ) : (
            <>
              <Field label="Conversa" dica="As 25 conversas mais recentes que você tem acesso.">
                <SelectInput value={conversaSel} onChange={(e) => setConversaSel(e.target.value)}>
                  {conversas.map((c) => (
                    <option key={c.id} value={c.id}>
                      {(c.contato_nome || "Sem nome") + " · " + c.canal + " · " + dataCurta(c.last_message_at)}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rodando !== null || !conversaSel}
                  onClick={() => rodarPlayground("sugerir")}
                >
                  {rodando === "sugerir" ? <Spinner size={14} /> : <Sparkles size={14} />} Sugerir resposta
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rodando !== null || !conversaSel}
                  onClick={() => rodarPlayground("resumir")}
                >
                  {rodando === "resumir" ? <Spinner size={14} /> : <FileText size={14} />} Resumir conversa
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={rodando !== null || !conversaSel}
                  onClick={() => rodarPlayground("classificar")}
                >
                  {rodando === "classificar" ? <Spinner size={14} /> : <Route size={14} />} Detectar intenção
                </Button>
              </div>

              {faltaChavePlay && (
                <Alerta tipo="atencao">
                  Sem <code>ANTHROPIC_API_KEY</code> no servidor não há o que testar. Configure a
                  variável de ambiente e reinicie a aplicação.
                </Alerta>
              )}
              {erroPlay && !faltaChavePlay && <Alerta tipo="erro">{erroPlay}</Alerta>}

              {saida && (
                <div className="rounded-lg border bg-muted/30 p-3 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                      Sugestão de IA — revise antes de usar
                    </span>
                    {saida.cacheada && (
                      <span className="text-[10px] text-muted-foreground">reaproveitada do cache</span>
                    )}
                    {saida.modelo && (
                      <span className="text-[10px] text-muted-foreground">{saida.modelo}</span>
                    )}
                  </div>
                  <p className="text-sm whitespace-pre-wrap leading-relaxed">{saida.texto}</p>
                </div>
              )}
            </>
          )}
        </div>
      </Card>

      {/* ---------- Base de conhecimento ---------- */}
      <Card
        titulo="Base de conhecimento"
        descricao="São os artigos publicados da Central de Ajuda que entram no prompt como fonte de fatos."
        acoes={
          <Link href="/atendimento/ajuda">
            <Button size="sm" variant="outline">
              <BookOpen size={14} /> Abrir Central de Ajuda
            </Button>
          </Link>
        }
      >
        <div className="p-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText size={13} /> Artigos publicados (usados pela IA)
            </p>
            <p className="text-2xl font-display text-arini dark:text-gold mt-1">{artigosPublicados}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText size={13} /> Artigos no total
            </p>
            <p className="text-2xl font-display mt-1">{artigosTotal}</p>
          </div>
        </div>
        <div className="px-4 pb-4">
          {artigosPublicados === 0 ? (
            <Alerta tipo="atencao">
              Nenhum artigo publicado. Sem base de conhecimento a IA só tem o histórico da conversa —
              e foi instruída a não inventar nada, então vai encaminhar quase tudo para um corretor.
              Comece publicando as dúvidas que mais chegam no WhatsApp.
            </Alerta>
          ) : (
            <p className="text-[11px] text-muted-foreground">
              A IA lê os 12 artigos publicados mais recentes (até ~1.200 caracteres cada). Rascunhos e
              arquivados ficam de fora.
            </p>
          )}
        </div>
      </Card>

      {/* ---------- Uso ---------- */}
      <Card
        titulo="Uso recente"
        descricao="Últimas 20 gerações. A coluna &quot;usada&quot; mostra se o atendente aproveitou o texto."
      >
        {uso.length === 0 ? (
          <EmptyState
            titulo="Nenhuma geração ainda"
            descricao="Assim que alguém usar o copiloto ou o playground, o histórico aparece aqui."
            icone={<BarChart3 size={34} />}
          />
        ) : (
          <Table colunas={["Conversa", "Tipo", "Modelo", "Usada", "Quando"]}>
            {uso.map((l) => (
              <tr key={l.id}>
                <td className="px-3 py-2">
                  <Link
                    href={`/atendimento/inbox?conversa=${l.conversation_id}`}
                    className="text-arini dark:text-gold underline underline-offset-2"
                  >
                    {l.contato_nome || l.conversation_id.slice(0, 8)}
                  </Link>
                </td>
                <td className="px-3 py-2">{TIPO_LABELS[l.tipo] ?? l.tipo}</td>
                <td className="px-3 py-2 text-xs text-muted-foreground">{l.modelo ?? "—"}</td>
                <td className="px-3 py-2">
                  {l.usada ? (
                    <span className="text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-1">
                      <Check size={13} /> sim
                    </span>
                  ) : (
                    <span className="text-muted-foreground">não</span>
                  )}
                </td>
                <td className="px-3 py-2 text-xs text-muted-foreground whitespace-nowrap">
                  {dataCurta(l.created_at)}
                </td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
        <Bot size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          A IA nunca envia mensagem sozinha. Ela é instruída a não inventar preço, endereço ou
          disponibilidade e a sugerir encaminhamento a um corretor humano quando não sabe. O que ela
          lê: histórico da conversa (sem notas internas), respostas rápidas, artigos publicados e as
          instruções da caixa. Para reduzir trabalho manual sem IA, continuam valendo as{" "}
          <Link href="/atendimento/macros" className="text-arini dark:text-gold underline underline-offset-2">
            macros
          </Link>{" "}
          e as{" "}
          <Link href="/atendimento/respostas" className="text-arini dark:text-gold underline underline-offset-2">
            respostas prontas
          </Link>
          .
        </p>
      </div>
    </PageShell>
  );
}
