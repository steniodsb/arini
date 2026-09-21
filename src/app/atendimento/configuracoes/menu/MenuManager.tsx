"use client";

import { useMemo, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Field, TextInput, TextArea, SelectInput, Switch, Card, Alerta, Spinner,
} from "@/components/atendimento/ui";
import { VARIAVEIS, aplicarVariaveis, variaveisDesconhecidas } from "@/lib/atendimento/variaveis";
import { montarTextoMenu, interpretarResposta } from "@/lib/atendimento/menu-resposta";
import {
  Check, ListOrdered, Plus, Trash2, ArrowUp, ArrowDown, MessageSquare,
  ChevronDown, ChevronRight, UserX, FlaskConical, CornerDownRight,
} from "lucide-react";
import type { AtendimentoTeam, AgentOption } from "@/lib/types";

export type MenuRow = {
  id: string;
  nome: string;
  ativo: boolean;
  saudacao: string;
  cabecalho: string;
  confirmacao: string;
  nao_entendi: string;
  max_tentativas: number;
  fila_escape: string | null;
  expira_minutos: number;
};

export type OpcaoRow = {
  id?: string | null;
  chave: string;
  rotulo: string;
  team_id: string | null;
  responsavel_id: string | null;
  etiqueta: string | null;
  confirmacao: string | null;
  ativo: boolean;
};

/** Nomes de exemplo da prévia: com nome salvo e sem nome salvo. */
const EXEMPLO_NOME = "Gabriel Castro";

/** Campos de texto que aceitam variável — usado pela inserção no cursor. */
type CampoTexto = "saudacao" | "cabecalho" | "confirmacao" | "nao_entendi";

export function MenuManager({
  menu: menuInicial,
  opcoes: opcoesIniciais,
  equipes,
  agentes,
  saudacaoDaCaixa,
  nomeDaCaixa,
  membrosPorFila,
  podeEditar,
}: {
  menu: MenuRow;
  opcoes: OpcaoRow[];
  equipes: AtendimentoTeam[];
  agentes: AgentOption[];
  saudacaoDaCaixa: string | null;
  nomeDaCaixa: string;
  /** Quantos atendentes cada fila tem. Mapa inteiro: o destino muda na tela. */
  membrosPorFila: Record<string, number>;
  podeEditar: boolean;
}) {
  const [menu, setMenu] = useState<MenuRow>(menuInicial);
  const [opcoes, setOpcoes] = useState<OpcaoRow[]>(opcoesIniciais);
  const [abertas, setAbertas] = useState<Set<number>>(new Set());
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [salvo, setSalvo] = useState(false);
  const [confirmarLigar, setConfirmarLigar] = useState(false);
  const [teste, setTeste] = useState("");

  // Qual campo de texto recebeu o foco por último — é onde o clique numa
  // variável insere. Sem isso os chips seriam decoração.
  const focado = useRef<CampoTexto | null>(null);
  const refs = {
    saudacao: useRef<HTMLTextAreaElement>(null),
    cabecalho: useRef<HTMLInputElement>(null),
    confirmacao: useRef<HTMLTextAreaElement>(null),
    nao_entendi: useRef<HTMLInputElement>(null),
  };

  const nomeDaFila = (id: string | null) => equipes.find((t) => t.id === id)?.nome ?? null;
  const vaziaA = (id: string | null) => Boolean(id) && (membrosPorFila[id as string] ?? 0) === 0;

  const campo = <K extends keyof MenuRow>(k: K, v: MenuRow[K]) => {
    setMenu((m) => ({ ...m, [k]: v }));
    setSalvo(false);
    setConfirmarLigar(false);
  };

  const mexerOpcao = (i: number, patch: Partial<OpcaoRow>) => {
    setOpcoes((os) => os.map((o, j) => (j === i ? { ...o, ...patch } : o)));
    setSalvo(false);
  };

  const mover = (i: number, d: -1 | 1) => {
    setOpcoes((os) => {
      const j = i + d;
      if (j < 0 || j >= os.length) return os;
      const c = os.slice();
      [c[i], c[j]] = [c[j], c[i]];
      return c;
    });
    setSalvo(false);
  };

  /** Insere `{{variavel}}` na posição do cursor do último campo focado. */
  function inserirVariavel(chave: string) {
    const alvo = focado.current ?? "saudacao";
    const el = refs[alvo].current;
    const marcador = `{{${chave}}}`;
    const atual = menu[alvo];
    if (!el) {
      campo(alvo, (atual + marcador) as MenuRow[CampoTexto]);
      return;
    }
    const ini = el.selectionStart ?? atual.length;
    const fim = el.selectionEnd ?? ini;
    const novo = atual.slice(0, ini) + marcador + atual.slice(fim);
    campo(alvo, novo as MenuRow[CampoTexto]);
    // Devolve o cursor para depois do que foi inserido, senão o próximo
    // clique joga a variável para o começo do campo.
    requestAnimationFrame(() => {
      el.focus();
      const p = ini + marcador.length;
      el.setSelectionRange(p, p);
    });
  }

  const ativas = opcoes.filter((o) => o.ativo && o.chave.trim() && o.rotulo.trim());

  // ---- Prévia -------------------------------------------------------
  // Usa `aplicarVariaveis` DE VERDADE, a mesma função do envio. A versão
  // anterior desta tela reimplementava a substituição à mão, e prévia que
  // pode divergir do que sai é pior do que não ter prévia nenhuma.
  const previa = useMemo(() => {
    const bruto = montarTextoMenu(
      { saudacao: menu.saudacao, cabecalho: menu.cabecalho },
      saudacaoDaCaixa,
      ativas.map((o, i) => ({ id: String(i), chave: o.chave, rotulo: o.rotulo })),
    );
    const ctx = (nome: string | null) => ({
      contatoNome: nome,
      contatoTelefone: "5534997451400",
      canal: "WhatsApp",
      fila: nomeDaFila(ativas[0]?.team_id ?? null),
    });
    return {
      com: aplicarVariaveis(bruto, ctx(EXEMPLO_NOME)),
      sem: aplicarVariaveis(bruto, ctx(null)),
      confirmacao: aplicarVariaveis(menu.confirmacao, ctx(EXEMPLO_NOME)),
      repeticao: aplicarVariaveis(
        [
          menu.nao_entendi.trim(),
          montarTextoMenu(
            { saudacao: "", cabecalho: menu.cabecalho },
            null,
            ativas.map((o, i) => ({ id: String(i), chave: o.chave, rotulo: o.rotulo })),
          ),
        ].filter(Boolean).join("\n\n"),
        ctx(EXEMPLO_NOME),
      ),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [menu.saudacao, menu.cabecalho, menu.confirmacao, menu.nao_entendi, opcoes, saudacaoDaCaixa, equipes]);

  // ---- Simulador ----------------------------------------------------
  // Roda `interpretarResposta`, a MESMA função do motor. Serve para ver,
  // antes de ligar, que "2 quartos" não vira ramal 2 — e para conferir
  // que o rótulo que você escreveu é reconhecido quando o cliente o cita.
  const resultadoTeste = useMemo(() => {
    if (!teste.trim()) return null;
    const achou = interpretarResposta(
      teste,
      ativas.map((o) => ({ id: o.chave, chave: o.chave, rotulo: o.rotulo })),
    );
    if (!achou) return { ok: false as const };
    const op = ativas.find((o) => o.chave === achou.chave)!;
    return { ok: true as const, rotulo: op.rotulo, fila: nomeDaFila(op.team_id), teamId: op.team_id };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [teste, opcoes, equipes]);

  // ---- Problemas que impedem (ou desaconselham) ligar ----------------
  const semDestino = ativas.filter((o) => !o.team_id && !o.responsavel_id);
  const comFilaVazia = ativas.filter((o) => vaziaA(o.team_id));
  const textosRuins = [...new Set(
    [menu.saudacao, menu.cabecalho, menu.confirmacao, menu.nao_entendi, ...opcoes.map((o) => o.confirmacao ?? "")]
      .filter(Boolean)
      .flatMap((t) => variaveisDesconhecidas(t)),
  )];

  async function salvar(forcar = false) {
    // Ligar o menu com fila vazia é a única armadilha silenciosa daqui: o
    // cliente recebe "em breve você será atendido" e ninguém aparece.
    if (menu.ativo && comFilaVazia.length > 0 && !forcar) {
      setConfirmarLigar(true);
      return;
    }
    setSalvando(true);
    setErro(null);
    setConfirmarLigar(false);
    try {
      const r = await fetch("/api/atendimento/menu", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...menu, opcoes }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? "falha ao salvar");
      setOpcoes((j.opcoes as OpcaoRow[]).map((o) => ({ ...o, ativo: o.ativo !== false })));
      setSalvo(true);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "falha ao salvar");
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="flex items-center gap-2 text-lg font-semibold">
            <ListOrdered size={18} /> Menu de ramais
          </h1>
          <p className="text-sm text-muted-foreground">
            O cliente escreve no {nomeDaCaixa}, recebe as opções e escolhe o setor pelo número.
            A conversa vai direto para a fila escolhida, já triada.
          </p>
        </div>
        <Button onClick={() => salvar()} disabled={!podeEditar || salvando}>
          {salvando ? <Spinner /> : salvo ? <Check size={15} /> : null}
          {salvo ? "Salvo" : "Salvar"}
        </Button>
      </div>

      {!podeEditar && (
        <Alerta tipo="atencao">
          Só a administração edita o menu. Você pode ver como está configurado.
        </Alerta>
      )}
      {erro && <Alerta tipo="erro">{erro}</Alerta>}
      {textosRuins.length > 0 && (
        <Alerta tipo="erro">
          Variável que não existe: {textosRuins.map((v) => `{{${v}}}`).join(", ")}. Ela sairia como
          texto na mensagem do cliente.
        </Alerta>
      )}

      {confirmarLigar && (
        <Alerta tipo="erro">
          <div className="space-y-2">
            <div>
              <strong>
                {comFilaVazia.length === 1
                  ? "1 ramal aponta para uma fila sem ninguém"
                  : `${comFilaVazia.length} ramais apontam para filas sem ninguém`}
              </strong>{" "}
              ({comFilaVazia.map((o) => `${o.chave} — ${nomeDaFila(o.team_id)}`).join("; ")}).
              Quem escolher essas opções recebe a confirmação e fica esperando alguém que não existe.
            </div>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={() => salvar(true)}>
                Ligar mesmo assim
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setConfirmarLigar(false)}>
                Cancelar
              </Button>
            </div>
          </div>
        </Alerta>
      )}

      <Card titulo="Ligar o menu" descricao="Enquanto estiver desligado, nada muda no WhatsApp.">
        <Switch
          checked={menu.ativo}
          onChange={(v) => campo("ativo", v)}
          disabled={!podeEditar}
          label={menu.ativo ? "Ativo — todo cliente novo recebe o menu" : "Desligado"}
          dica="A partir do momento em que ligar, quem escrever pela primeira vez recebe a saudação e as opções, e a resposta roteia a conversa."
        />
      </Card>

      <Card titulo="As mensagens">
        <div className="space-y-3">
          <Field
            label="Saudação"
            dica={
              saudacaoDaCaixa
                ? `Deixe vazio para usar a saudação da caixa: "${saudacaoDaCaixa}"`
                : "Primeira frase que o cliente recebe."
            }
          >
            <TextArea
              ref={refs.saudacao}
              value={menu.saudacao}
              onFocus={() => (focado.current = "saudacao")}
              onChange={(e) => campo("saudacao", e.target.value)}
              disabled={!podeEditar}
              rows={3}
            />
          </Field>

          <Field label="Chamada das opções" dica="A linha que vem logo antes da lista.">
            <TextInput
              ref={refs.cabecalho}
              value={menu.cabecalho}
              onFocus={() => (focado.current = "cabecalho")}
              onChange={(e) => campo("cabecalho", e.target.value)}
              disabled={!podeEditar}
            />
          </Field>

          <Field label="Confirmação" dica="Enviada depois que o cliente escolhe um ramal.">
            <TextArea
              ref={refs.confirmacao}
              value={menu.confirmacao}
              onFocus={() => (focado.current = "confirmacao")}
              onChange={(e) => campo("confirmacao", e.target.value)}
              disabled={!podeEditar}
              rows={2}
            />
          </Field>

          <Field
            label="Quando não entender"
            dica="Enviada junto com a lista de novo, sem repetir a saudação."
          >
            <TextInput
              ref={refs.nao_entendi}
              value={menu.nao_entendi}
              onFocus={() => (focado.current = "nao_entendi")}
              onChange={(e) => campo("nao_entendi", e.target.value)}
              disabled={!podeEditar}
            />
          </Field>

          <div className="rounded-md border bg-muted/40 p-3">
            <p className="mb-1.5 text-xs font-medium">
              Clique para inserir onde está o cursor
            </p>
            <div className="flex flex-wrap gap-1.5">
              {VARIAVEIS.map((v) => (
                <button
                  key={v.chave}
                  type="button"
                  disabled={!podeEditar}
                  onClick={() => inserirVariavel(v.chave)}
                  title={`${v.descricao} — ex.: ${v.exemplo}`}
                  className="rounded border bg-background px-1.5 py-0.5 font-mono text-[11px] hover:bg-acao hover:text-white disabled:opacity-50"
                >
                  {`{{${v.chave}}}`}
                </button>
              ))}
            </div>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              <code>{"{{saudacao_nome}}"}</code> já inclui a vírgula e o nome — e some sozinha
              quando o contato não tem nome salvo, em vez de mandar &quot;Olá, !&quot;.
            </p>
          </div>
        </div>
      </Card>

      <Card
        titulo="Os ramais"
        descricao="A ordem aqui é a ordem em que aparecem para o cliente."
        acoes={
          podeEditar ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setOpcoes((os) => [
                  ...os,
                  {
                    chave: String(os.length + 1), rotulo: "", team_id: null,
                    responsavel_id: null, etiqueta: null, confirmacao: null, ativo: true,
                  },
                ]);
                setSalvo(false);
              }}
            >
              <Plus size={14} /> Adicionar
            </Button>
          ) : null
        }
      >
        <div className="space-y-2">
          {opcoes.map((o, i) => {
            const aberta = abertas.has(i);
            const filaVazia = vaziaA(o.team_id);
            return (
              <div key={o.id ?? `novo-${i}`} className="rounded-md border p-2.5">
                <div className="flex flex-wrap items-end gap-2">
                  <Field label="Digita" className="w-16">
                    <TextInput
                      value={o.chave}
                      onChange={(e) => mexerOpcao(i, { chave: e.target.value })}
                      disabled={!podeEditar}
                    />
                  </Field>
                  <Field label="Nome do ramal" className="min-w-[170px] flex-1">
                    <TextInput
                      value={o.rotulo}
                      onChange={(e) => mexerOpcao(i, { rotulo: e.target.value })}
                      disabled={!podeEditar}
                    />
                  </Field>
                  <Field label="Vai para a fila" className="min-w-[155px]">
                    <SelectInput
                      value={o.team_id ?? ""}
                      onChange={(e) => mexerOpcao(i, { team_id: e.target.value || null })}
                      disabled={!podeEditar}
                    >
                      <option value="">— caixa central —</option>
                      {equipes.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.nome}
                          {(membrosPorFila[t.id] ?? 0) === 0 ? " (vazia)" : ` (${membrosPorFila[t.id]})`}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label="Direto para" className="min-w-[145px]">
                    <SelectInput
                      value={o.responsavel_id ?? ""}
                      onChange={(e) => mexerOpcao(i, { responsavel_id: e.target.value || null })}
                      disabled={!podeEditar}
                    >
                      <option value="">— quem pegar —</option>
                      {agentes.map((a) => (
                        <option key={a.id} value={a.id}>{a.nome}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <div className="flex gap-0.5 pb-0.5">
                    <Button variant="ghost" size="icon" disabled={!podeEditar || i === 0}
                      onClick={() => mover(i, -1)} title="Subir">
                      <ArrowUp size={14} />
                    </Button>
                    <Button variant="ghost" size="icon" disabled={!podeEditar || i === opcoes.length - 1}
                      onClick={() => mover(i, 1)} title="Descer">
                      <ArrowDown size={14} />
                    </Button>
                    <Button
                      variant="ghost" size="icon" disabled={!podeEditar}
                      onClick={() => {
                        setOpcoes((os) => os.filter((_, j) => j !== i));
                        setSalvo(false);
                      }}
                      title="Remover"
                    >
                      <Trash2 size={14} />
                    </Button>
                  </div>
                </div>

                {/* Aviso NA LINHA do ramal — é aqui que a decisão é tomada. */}
                {filaVazia && (
                  // `items-start` + ícone `shrink-0`: com `items-center` o
                  // ícone centraliza na altura do parágrafo inteiro e o
                  // texto quebra em volta dele.
                  <p className="mt-1.5 flex items-start gap-1 text-[11px] text-red-600 dark:text-red-300">
                    <UserX size={12} className="mt-0.5 shrink-0" />
                    <span>
                      A fila <strong>{nomeDaFila(o.team_id)}</strong> não tem nenhum atendente —
                      quem escolher este ramal fica esperando sem dono.
                    </span>
                  </p>
                )}
                {!o.team_id && !o.responsavel_id && (
                  <p className="mt-1.5 text-[11px] text-muted-foreground">
                    Sem destino: a conversa continua na caixa central para a recepção encaminhar.
                  </p>
                )}

                <button
                  type="button"
                  onClick={() =>
                    setAbertas((s) => {
                      const n = new Set(s);
                      if (n.has(i)) n.delete(i); else n.add(i);
                      return n;
                    })
                  }
                  className="mt-1.5 flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"
                >
                  {aberta ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                  Etiqueta e confirmação própria
                  {(o.etiqueta || o.confirmacao) && !aberta ? " · preenchidas" : ""}
                </button>

                {aberta && (
                  <div className="mt-2 grid gap-2 border-t pt-2 sm:grid-cols-2">
                    <Field
                      label="Etiqueta aplicada"
                      dica="Marca a conversa. É o que faz o relatório “quantos procuraram Locação”."
                    >
                      <TextInput
                        value={o.etiqueta ?? ""}
                        onChange={(e) => mexerOpcao(i, { etiqueta: e.target.value || null })}
                        disabled={!podeEditar}
                      />
                    </Field>
                    <Field
                      label="Confirmação só deste ramal"
                      dica="Vazio = usa a confirmação geral acima."
                    >
                      <TextInput
                        value={o.confirmacao ?? ""}
                        onChange={(e) => mexerOpcao(i, { confirmacao: e.target.value || null })}
                        disabled={!podeEditar}
                        placeholder="Ex.: Envie a matrícula do imóvel, por favor."
                      />
                    </Field>
                  </div>
                )}
              </div>
            );
          })}
          {opcoes.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              Nenhum ramal. Adicione ao menos um antes de ativar.
            </p>
          )}
          {semDestino.length > 0 && (
            <p className="text-[11px] text-muted-foreground">
              {semDestino.length} ramal(is) sem destino ficam na caixa central — o que é legítimo
              para um “não sei para onde vai, alguém olhe”.
            </p>
          )}
        </div>
      </Card>

      <Card titulo="Quando o cliente não escolhe">
        <div className="flex flex-wrap gap-3">
          <Field label="Repetir o menu até" dica="Depois disso, desiste." className="w-40">
            <SelectInput
              value={String(menu.max_tentativas)}
              onChange={(e) => campo("max_tentativas", Number(e.target.value))}
              disabled={!podeEditar}
            >
              {[1, 2, 3, 4, 5].map((n) => (
                <option key={n} value={n}>{n} vez(es)</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Aí manda para" className="min-w-[180px]">
            <SelectInput
              value={menu.fila_escape ?? ""}
              onChange={(e) => campo("fila_escape", e.target.value || null)}
              disabled={!podeEditar}
            >
              <option value="">— deixa na caixa central —</option>
              {equipes.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                  {(membrosPorFila[t.id] ?? 0) === 0 ? " (vazia)" : ` (${membrosPorFila[t.id]})`}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field
            label="Esquece o menu depois de"
            dica="Um '1' que chega semanas depois não é resposta de menu."
            className="w-44"
          >
            <SelectInput
              value={String(menu.expira_minutos)}
              onChange={(e) => campo("expira_minutos", Number(e.target.value))}
              disabled={!podeEditar}
            >
              <option value="60">1 hora</option>
              <option value="360">6 horas</option>
              <option value="1440">1 dia</option>
              <option value="4320">3 dias</option>
            </SelectInput>
          </Field>
        </div>
      </Card>

      {/* ---- SIMULADOR ---------------------------------------------- */}
      <Card
        titulo="Testar a resposta do cliente"
        descricao="Roda a mesma regra do sistema. Serve para conferir, antes de ligar, o que vira ramal e o que não vira."
      >
        <TextInput
          value={teste}
          onChange={(e) => setTeste(e.target.value)}
          placeholder="Digite o que o cliente mandaria…"
        />

        <div className="mt-2 flex flex-wrap gap-1.5">
          {[
            // Os três primeiros devem casar; os três últimos NÃO — e é
            // justamente isso que vale conferir antes de ligar.
            "3", "opção 2", ativas[2]?.rotulo.split(" ")[0]?.toLowerCase() ?? "locação",
            "2 quartos", "chego as 3h", "bom dia, tudo bem?",
          ].map((ex) => (
            <button
              key={ex}
              type="button"
              onClick={() => setTeste(ex)}
              className="rounded border bg-background px-1.5 py-0.5 text-[11px] hover:bg-muted"
            >
              {ex}
            </button>
          ))}
        </div>

        {resultadoTeste && (
          <div className="mt-3">
            {resultadoTeste.ok ? (
              <div className="rounded-md border border-emerald-500/30 bg-emerald-500/10 p-2.5 text-sm">
                <div className="flex items-center gap-1.5 font-medium">
                  <CornerDownRight size={14} /> {resultadoTeste.rotulo}
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  {resultadoTeste.fila
                    ? <>Vai para a fila <strong>{resultadoTeste.fila}</strong>, já triada.</>
                    : "Sem fila — continua na caixa central."}
                  {vaziaA(resultadoTeste.teamId) && " Atenção: essa fila está vazia."}
                </div>
              </div>
            ) : (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/10 p-2.5 text-sm">
                <div className="flex items-center gap-1.5 font-medium">
                  <FlaskConical size={14} /> Não vira ramal
                </div>
                <div className="mt-0.5 text-xs text-muted-foreground">
                  O menu é repetido e a conversa não é encaminhada. É o resultado certo para uma
                  frase comum do dia a dia — só o número sozinho (ou o nome do setor) escolhe.
                </div>
              </div>
            )}
          </div>
        )}
      </Card>

      <Card
        titulo="Como o cliente vê"
        descricao="Com as variáveis já substituídas pela mesma função que o envio usa."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Previa
            titulo={previa.com === previa.sem ? "Abertura" : "Contato com nome"}
            texto={previa.com}
          />
          {/* Só mostra o segundo painel quando ele difere. Repetir o mesmo
              texto duas vezes faz o leitor procurar uma diferença que não
              existe — e, quando a mensagem não usa o nome, não existe. */}
          {previa.com !== previa.sem ? (
            <Previa titulo="Contato sem nome salvo" texto={previa.sem} />
          ) : (
            <div className="self-center rounded-md border border-dashed p-2.5 text-[11px] text-muted-foreground">
              Esta abertura não usa o nome do contato, então sai igual para todo mundo. Para
              tratar pelo nome, insira <code>{"{{saudacao_nome}}"}</code> na saudação.
            </div>
          )}
          <Previa titulo="Depois de escolher" texto={previa.confirmacao} />
          <Previa titulo="Quando não entende" texto={previa.repeticao} />
        </div>
      </Card>
    </div>
  );
}

function Previa({ titulo, texto }: { titulo: string; texto: string }) {
  return (
    <div>
      <p className="mb-1 flex items-center gap-1 text-xs font-medium text-muted-foreground">
        <MessageSquare size={12} /> {titulo}
      </p>
      <pre className="whitespace-pre-wrap rounded-md bg-emerald-500/10 p-2.5 font-sans text-[13px] leading-snug">
        {texto || "(vazio)"}
      </pre>
    </div>
  );
}
