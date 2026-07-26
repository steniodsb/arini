"use client";

import { useMemo } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import Link from "next/link";
import { Bot, Download, PlugZap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alerta, Card, EmptyState, Table } from "@/components/atendimento/ui";
import type { BotStatus, ConversationStatus } from "@/lib/types";
import {
  COR_EIXO,
  COR_GRADE,
  ESTILO_TOOLTIP,
  PALETA,
  baixarCsv,
  chaveDia,
  duracaoOuTraco,
  media,
  minutosEntre,
  numeroBr,
  percentual,
  rotuloDia,
  type CelulaCsv,
} from "./relatorios-utils";

// =====================================================================
// Aba "Bots" — o bot está ajudando ou atrapalhando?
//
// A pergunta que esta aba responde não é "quantas mensagens o bot
// mandou" (isso qualquer log diz), e sim: DE CADA 10 CONVERSAS QUE ELE
// PEGOU, QUANTAS ELE RESOLVEU SOZINHO? Um bot que fala muito e transfere
// tudo é pior do que não ter bot — ele só adiciona uma etapa antes do
// humano.
//
// Definições usadas aqui (e o porquê):
//
//  · "passou por bot"  = a conversa tem `bot_id` OU `bot_status` diferente
//    de 'sem_bot'. Os dois sinais existem porque o bot pode ser apagado
//    depois (a FK vira NULL) sem que a conversa deixe de ter sido
//    atendida por um.
//  · "resolvida sem humano" = está resolvida E o `bot_status` NUNCA virou
//    'transferida'. O estado é terminal — uma vez transferida, fica
//    transferida — então o campo atual serve de histórico confiável.
//  · "entrega com falha" = `status >= 400` OU `erro` preenchido. Timeout
//    e DNS quebrado não produzem status HTTP nenhum, só `erro`; olhar só
//    o status esconderia justamente o bot que está fora do ar.
//
// Os tipos de linha são declarados aqui de propósito (estruturalmente
// compatíveis com os do painel principal) para não criar import circular
// com `RelatoriosPanel.tsx`, que é quem renderiza esta aba.
// =====================================================================

export type RelBot = {
  id: string;
  nome: string;
  ativo: boolean;
};

/** Só os campos de conversa que este relatório usa. */
export type BotConversa = {
  id: string;
  status: ConversationStatus;
  created_at: string;
  resolvida_em: string | null;
  bot_status: BotStatus;
  bot_id: string | null;
  bot_transferida_em: string | null;
};

export type BotCsat = {
  conversation_id: string;
  nota: number | null;
};

/** Mensagem cujo `remetente` é 'bot' (o filtro é feito no servidor). */
export type RelMensagemBot = {
  conversation_id: string;
  bot_id: string | null;
  created_at: string;
};

export type RelEntregaBot = {
  id: string;
  bot_id: string;
  conversation_id: string | null;
  status: number | null;
  erro: string | null;
  duracao_ms: number | null;
  created_at: string;
};

/** Chave usada quando a conversa passou por bot mas a FK já foi apagada. */
const BOT_DESCONHECIDO = "__sem_bot_id__";

/** Quantas falhas recentes a tabela de saúde mostra. */
const MAX_FALHAS = 12;

function passouPorBot(c: BotConversa): boolean {
  return c.bot_id !== null || c.bot_status !== "sem_bot";
}

/** Entrega considerada falha — ver comentário do cabeçalho. */
function entregaFalhou(e: RelEntregaBot): boolean {
  return (e.status !== null && e.status >= 400) || (e.erro !== null && e.erro !== "");
}

type LinhaBot = {
  id: string;
  nome: string;
  ativo: boolean;
  conversas: number;
  mensagens: number;
  transferidas: number;
  /** % de conversas que o bot segurou até o fim (não transferiu). */
  retencao: number;
  falhas: number;
};

export function BotsPanel({
  bots,
  conversas,
  todasConversas,
  csat,
  mensagensBot,
  entregas,
  inicio,
  fim,
}: {
  bots: RelBot[];
  /** Conversas criadas DENTRO do período selecionado. */
  conversas: BotConversa[];
  /** Janela inteira (90 dias) — só para saber se uma conversa avaliada passou por bot. */
  todasConversas: BotConversa[];
  /** Respostas de CSAT já recortadas pelo período. */
  csat: BotCsat[];
  /** Mensagens do bot na janela inteira; o recorte por período é feito aqui. */
  mensagensBot: RelMensagemBot[];
  /** Entregas na janela inteira; o recorte por período é feito aqui. */
  entregas: RelEntregaBot[];
  inicio: Date;
  fim: Date;
}) {
  const dentro = useMemo(() => {
    const a = inicio.getTime();
    const b = fim.getTime();
    return (iso: string | null): boolean => {
      if (!iso) return false;
      const t = new Date(iso).getTime();
      return Number.isFinite(t) && t >= a && t <= b;
    };
  }, [inicio, fim]);

  const nomePorBot = useMemo(() => {
    const m = new Map<string, string>();
    for (const b of bots) m.set(b.id, b.nome);
    return m;
  }, [bots]);

  const comBot = useMemo(() => conversas.filter(passouPorBot), [conversas]);

  const mensagensPeriodo = useMemo(
    () => mensagensBot.filter((m) => dentro(m.created_at)),
    [mensagensBot, dentro],
  );

  const entregasPeriodo = useMemo(
    () => entregas.filter((e) => dentro(e.created_at)),
    [entregas, dentro],
  );

  // ---- Indicadores do topo ---------------------------------------------
  const resumo = useMemo(() => {
    const atendidas = comBot.length;
    const transferidas = comBot.filter((c) => c.bot_status === "transferida").length;
    const semHumano = comBot.filter(
      (c) => c.status === "resolvida" && c.bot_status !== "transferida",
    ).length;

    const ateTransferir: number[] = [];
    for (const c of comBot) {
      const min = minutosEntre(c.created_at, c.bot_transferida_em);
      if (min !== null) ateTransferir.push(min);
    }

    return {
      atendidas,
      transferidas,
      semHumano,
      // percentual() já trata divisão por zero devolvendo 0.
      taxaResolucao: percentual(semHumano, atendidas),
      taxaTransferencia: percentual(transferidas, atendidas),
      tempoAteTransferir: media(ateTransferir),
      aindaConduzindo: comBot.filter((c) => c.bot_status === "ativo").length,
    };
  }, [comBot]);

  // ---- Tabela por bot ---------------------------------------------------
  const linhas = useMemo<LinhaBot[]>(() => {
    const acc = new Map<string, LinhaBot>();
    const garante = (id: string): LinhaBot => {
      let linha = acc.get(id);
      if (!linha) {
        const cadastrado = bots.find((b) => b.id === id);
        linha = {
          id,
          nome:
            id === BOT_DESCONHECIDO
              ? "Bot não identificado"
              : cadastrado?.nome ?? "Bot removido",
          ativo: cadastrado?.ativo ?? false,
          conversas: 0,
          mensagens: 0,
          transferidas: 0,
          retencao: 0,
          falhas: 0,
        };
        acc.set(id, linha);
      }
      return linha;
    };

    // Todo bot cadastrado aparece, mesmo com zero: um bot ligado que não
    // pegou NENHUMA conversa é informação (provavelmente não está ligado
    // em caixa nenhuma).
    for (const b of bots) garante(b.id);

    for (const c of comBot) {
      const linha = garante(c.bot_id ?? BOT_DESCONHECIDO);
      linha.conversas += 1;
      if (c.bot_status === "transferida") linha.transferidas += 1;
    }
    for (const m of mensagensPeriodo) {
      garante(m.bot_id ?? BOT_DESCONHECIDO).mensagens += 1;
    }
    for (const e of entregasPeriodo) {
      if (entregaFalhou(e)) garante(e.bot_id).falhas += 1;
    }

    const todas = Array.from(acc.values());
    for (const linha of todas) {
      linha.retencao = percentual(linha.conversas - linha.transferidas, linha.conversas);
    }
    return todas
      .filter((l) => l.id !== BOT_DESCONHECIDO || l.conversas > 0 || l.mensagens > 0)
      .sort((a, b) => b.conversas - a.conversas || a.nome.localeCompare(b.nome, "pt-BR"));
  }, [bots, comBot, mensagensPeriodo, entregasPeriodo]);

  // ---- Série diária: resolvidas pelo bot x transferidas -----------------
  const serie = useMemo(() => {
    const mapa = new Map<
      string,
      { dia: string; rotulo: string; resolvidas: number; transferidas: number }
    >();
    const cursor = new Date(inicio);
    // Mesmo teto do painel principal: período personalizado longo não
    // pode travar a tela montando milhares de barras.
    for (let i = 0; cursor.getTime() <= fim.getTime() && i <= 400; i += 1) {
      const k = chaveDia(cursor);
      mapa.set(k, { dia: k, rotulo: rotuloDia(k), resolvidas: 0, transferidas: 0 });
      cursor.setDate(cursor.getDate() + 1);
    }
    for (const c of comBot) {
      // Resolvida sem humano conta no dia da RESOLUÇÃO; transferida, no dia
      // do handoff. São eventos diferentes e podem cair em dias diferentes.
      if (c.bot_status !== "transferida" && c.status === "resolvida" && c.resolvida_em) {
        const item = mapa.get(chaveDia(new Date(c.resolvida_em)));
        if (item) item.resolvidas += 1;
      }
      if (c.bot_transferida_em) {
        const item = mapa.get(chaveDia(new Date(c.bot_transferida_em)));
        if (item) item.transferidas += 1;
      }
    }
    return Array.from(mapa.values());
  }, [comBot, inicio, fim]);

  const serieTemDado = useMemo(
    () => serie.some((d) => d.resolvidas > 0 || d.transferidas > 0),
    [serie],
  );

  // ---- Saúde da entrega -------------------------------------------------
  const falhas = useMemo(
    () =>
      entregasPeriodo
        .filter(entregaFalhou)
        .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
        .slice(0, MAX_FALHAS),
    [entregasPeriodo],
  );

  const totalEntregas = entregasPeriodo.length;
  const totalFalhas = useMemo(() => entregasPeriodo.filter(entregaFalhou).length, [entregasPeriodo]);

  // ---- CSAT: passou por bot x não passou --------------------------------
  const comparativoCsat = useMemo(() => {
    // O CSAT do período pode se referir a conversa aberta ANTES dele, por
    // isso o mapa vem da janela inteira e não só do recorte.
    const passou = new Set<string>();
    for (const c of todasConversas) if (passouPorBot(c)) passou.add(c.id);

    const notasBot: number[] = [];
    const notasHumano: number[] = [];
    for (const r of csat) {
      if (r.nota === null) continue;
      (passou.has(r.conversation_id) ? notasBot : notasHumano).push(r.nota);
    }
    return {
      bot: { media: media(notasBot), n: notasBot.length },
      humano: { media: media(notasHumano), n: notasHumano.length },
    };
  }, [csat, todasConversas]);

  function exportar() {
    const sufixo = `${chaveDia(inicio)}_a_${chaveDia(fim)}`;
    const dados: CelulaCsv[][] = [
      ["Indicador", "Valor"],
      ["Conversas atendidas por bot", resumo.atendidas],
      ["Resolvidas sem humano", resumo.semHumano],
      ["Taxa de resolução sem humano", `${numeroBr(resumo.taxaResolucao)}%`],
      ["Transferidas para humano", resumo.transferidas],
      ["Taxa de transferência", `${numeroBr(resumo.taxaTransferencia)}%`],
      ["Tempo médio até a transferência", duracaoOuTraco(resumo.tempoAteTransferir)],
      ["Ainda conduzidas pelo bot", resumo.aindaConduzindo],
      ["Entregas ao bot", totalEntregas],
      ["Entregas com falha", totalFalhas],
      [],
      ["Bot", "Ativo", "Conversas", "Mensagens do bot", "Transferidas", "% retenção", "Entregas com falha"],
      ...linhas.map((l): CelulaCsv[] => [
        l.nome,
        l.ativo ? "sim" : "não",
        l.conversas,
        l.mensagens,
        l.transferidas,
        l.conversas > 0 ? `${numeroBr(l.retencao)}%` : "—",
        l.falhas,
      ]),
      [],
      ["Dia", "Resolvidas pelo bot", "Transferidas para humano"],
      ...serie.map((d): CelulaCsv[] => [d.rotulo, d.resolvidas, d.transferidas]),
      [],
      ["Falhas recentes — bot", "Status", "Erro", "Quando"],
      ...falhas.map((f): CelulaCsv[] => [
        nomePorBot.get(f.bot_id) ?? "Bot removido",
        f.status ?? "sem resposta",
        f.erro ?? "",
        new Date(f.created_at).toLocaleString("pt-BR"),
      ]),
    ];
    baixarCsv(`relatorio_bots_${sufixo}.csv`, dados);
  }

  // ---- Estados vazios ----------------------------------------------------
  if (bots.length === 0) {
    return (
      <Card>
        <EmptyState
          titulo="Nenhum bot cadastrado"
          descricao="Um agent bot recebe as mensagens de uma caixa por webhook e responde pela API — é assim que se pluga um fluxo próprio (n8n, Dialogflow, script caseiro). Cadastre um para este relatório ganhar conteúdo."
          icone={<Bot size={34} />}
          acao={
            <Button asChild variant="gold" size="sm">
              <Link href="/atendimento/configuracoes/bots">Cadastrar um bot</Link>
            </Button>
          }
        />
      </Card>
    );
  }

  if (resumo.atendidas === 0) {
    return (
      <div className="space-y-4">
        <Card>
          <EmptyState
            titulo="Nenhuma conversa passou por bot no período"
            descricao="Existem bots cadastrados, mas nenhuma conversa criada neste intervalo foi conduzida por um deles. Confira se o bot está vinculado a alguma caixa de entrada."
            icone={<Bot size={34} />}
            acao={
              <Button asChild variant="outline" size="sm">
                <Link href="/atendimento/configuracoes/bots">Ver bots</Link>
              </Button>
            }
          />
        </Card>

        {/* A saúde da entrega continua valendo: um bot que nunca pegou
            conversa pode estar justamente falhando em TODAS as chamadas. */}
        {totalEntregas > 0 && (
          <SaudeDaEntrega
            falhas={falhas}
            total={totalEntregas}
            totalFalhas={totalFalhas}
            nomePorBot={nomePorBot}
          />
        )}
      </div>
    );
  }

  const totalRespostasCsat = comparativoCsat.bot.n + comparativoCsat.humano.n;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" onClick={exportar}>
          <Download size={15} /> Exportar CSV dos bots
        </Button>
      </div>

      {/* Cartões */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <CartaoBot
          rotulo="Atendidas por bot"
          valor={resumo.atendidas}
          detalhe={`${resumo.aindaConduzindo} ainda com o bot`}
        />
        <CartaoBot
          rotulo="Resolvidas sem humano"
          valor={`${numeroBr(resumo.taxaResolucao)}%`}
          detalhe={`${resumo.semHumano} de ${resumo.atendidas} conversas`}
          cor={corDaRetencao(resumo.taxaResolucao)}
        />
        <CartaoBot
          rotulo="Transferidas para humano"
          valor={`${numeroBr(resumo.taxaTransferencia)}%`}
          detalhe={`${resumo.transferidas} conversa(s)`}
        />
        <CartaoBot
          rotulo="Até a transferência (média)"
          valor={duracaoOuTraco(resumo.tempoAteTransferir)}
          detalhe={
            resumo.transferidas === 0
              ? "nenhuma transferência no período"
              : "do início da conversa ao handoff"
          }
        />
      </div>

      <Alerta tipo="info">
        &quot;Resolvida sem humano&quot; é a conversa que o bot atendeu, foi resolvida e nunca chegou a ser
        transferida. Conversas ainda em andamento não contam nem de um lado nem do outro — por isso as
        duas taxas juntas podem não fechar 100%.
      </Alerta>

      {/* Gráfico empilhado por dia */}
      <Card
        titulo="Desfecho por dia"
        descricao="Resolvidas pelo próprio bot x entregues a um humano."
      >
        <div className="p-3">
          {!serieTemDado ? (
            <EmptyState
              titulo="Sem desfechos no período"
              descricao="As conversas que passaram por bot ainda não foram resolvidas nem transferidas dentro deste intervalo."
              icone={<Bot size={34} />}
            />
          ) : (
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={serie} margin={{ top: 5, right: 10, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke={COR_GRADE} vertical={false} />
                <XAxis dataKey="rotulo" stroke={COR_EIXO} fontSize={11} minTickGap={18} />
                <YAxis stroke={COR_EIXO} fontSize={11} allowDecimals={false} />
                <Tooltip
                  contentStyle={ESTILO_TOOLTIP}
                  labelStyle={{ color: "hsl(var(--foreground))" }}
                  cursor={{ fill: "hsl(var(--muted))", opacity: 0.4 }}
                />
                <Legend iconSize={10} wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="resolvidas" stackId="d" name="Resolvidas pelo bot" fill={PALETA[0]} />
                <Bar
                  dataKey="transferidas"
                  stackId="d"
                  name="Transferidas para humano"
                  fill={PALETA[3]}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </Card>

      {/* Tabela por bot */}
      <Card titulo="Desempenho por bot" descricao="Retenção alta com poucas falhas é o cenário bom.">
        <Table
          colunas={[
            "Bot",
            "Conversas",
            "Mensagens do bot",
            "Transferidas",
            "% retenção",
            "Entregas com falha",
          ]}
        >
          {linhas.map((l) => (
            <tr key={l.id} className="hover:bg-muted/30">
              <td className="px-3 py-2">
                <div className="font-medium">{l.nome}</div>
                <div className="text-[11px] text-muted-foreground">
                  {l.ativo ? "ativo" : "desativado"}
                </div>
              </td>
              <td className="px-3 py-2 tabular-nums">{l.conversas}</td>
              <td className="px-3 py-2 tabular-nums">{l.mensagens}</td>
              <td className="px-3 py-2 tabular-nums">{l.transferidas}</td>
              <td
                className={`px-3 py-2 tabular-nums font-medium ${
                  l.conversas > 0 ? corDaRetencao(l.retencao) : "text-muted-foreground"
                }`}
              >
                {l.conversas > 0 ? `${numeroBr(l.retencao)}%` : "—"}
              </td>
              <td
                className={`px-3 py-2 tabular-nums ${
                  l.falhas > 0 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
                }`}
              >
                {l.falhas}
              </td>
            </tr>
          ))}
        </Table>
      </Card>

      <SaudeDaEntrega
        falhas={falhas}
        total={totalEntregas}
        totalFalhas={totalFalhas}
        nomePorBot={nomePorBot}
      />

      {/* CSAT lado a lado */}
      <Card
        titulo="Satisfação: com bot x sem bot"
        descricao="Média das notas de CSAT respondidas no período."
      >
        {totalRespostasCsat === 0 ? (
          <EmptyState
            titulo="Nenhuma resposta de CSAT no período"
            descricao="Sem avaliação respondida não dá para dizer se o bot melhora ou piora a experiência. Ligue o CSAT na caixa de entrada para começar a coletar."
            icone={<Bot size={34} />}
          />
        ) : (
          <div className="p-4 grid sm:grid-cols-2 gap-3">
            <BlocoCsat
              titulo="Conversas que passaram por bot"
              media={comparativoCsat.bot.media}
              n={comparativoCsat.bot.n}
            />
            <BlocoCsat
              titulo="Conversas só com humano"
              media={comparativoCsat.humano.media}
              n={comparativoCsat.humano.n}
            />
          </div>
        )}
      </Card>
    </div>
  );
}

// =====================================================================
// Blocos auxiliares
// =====================================================================

/** Verde acima de 70% de retenção, âmbar acima de 40%, vermelho abaixo. */
function corDaRetencao(pct: number): string {
  if (pct >= 70) return "text-emerald-600 dark:text-emerald-400";
  if (pct >= 40) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

function CartaoBot({
  rotulo,
  valor,
  detalhe,
  cor,
}: {
  rotulo: string;
  valor: string | number;
  detalhe?: string;
  cor?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-3.5">
      <div className={`text-xl font-semibold leading-tight ${cor ?? "text-arini dark:text-gold"}`}>
        {valor}
      </div>
      <div className="text-[11px] text-muted-foreground mt-1">{rotulo}</div>
      {detalhe && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{detalhe}</div>}
    </div>
  );
}

/**
 * Amostra pequena vira aviso, não número bonito: média de 2 respostas não
 * sustenta decisão nenhuma sobre desligar (ou manter) o bot.
 */
const MINIMO_CSAT_CONFIAVEL = 5;

function BlocoCsat({ titulo, media: valor, n }: { titulo: string; media: number | null; n: number }) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className="text-xs text-muted-foreground">{titulo}</div>
      {n === 0 || valor === null ? (
        <p className="text-sm mt-2 text-muted-foreground">Nenhuma resposta de CSAT no período.</p>
      ) : (
        <>
          <div className="text-2xl font-semibold text-arini dark:text-gold mt-1">
            {numeroBr(valor, 2)} <span className="text-sm text-muted-foreground">/ 5</span>
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">{n} resposta(s)</div>
          {n < MINIMO_CSAT_CONFIAVEL && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-1.5">
              Amostra pequena — não dá para tirar conclusão daqui ainda.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function SaudeDaEntrega({
  falhas,
  total,
  totalFalhas,
  nomePorBot,
}: {
  falhas: RelEntregaBot[];
  total: number;
  totalFalhas: number;
  nomePorBot: Map<string, string>;
}) {
  const pct = percentual(totalFalhas, total);
  return (
    <Card
      titulo="Saúde da entrega"
      descricao="Chamadas que saíram daqui para a URL do bot. É o que denuncia um bot fora do ar."
    >
      {total === 0 ? (
        <EmptyState
          titulo="Nenhuma entrega registrada no período"
          descricao="Ou nenhuma mensagem chegou numa caixa com bot, ou o disparo ainda não está ligado."
          icone={<PlugZap size={34} />}
        />
      ) : (
        <>
          <div className="px-4 py-3 border-b text-xs text-muted-foreground">
            {totalFalhas} de {total} entrega(s) falharam{" "}
            <span
              className={
                pct > 10 ? "text-red-600 dark:text-red-400 font-medium" : "text-muted-foreground"
              }
            >
              ({numeroBr(pct)}%)
            </span>
            .
          </div>
          {falhas.length === 0 ? (
            <EmptyState
              titulo="Nenhuma falha de entrega no período"
              descricao="Todas as chamadas ao bot responderam com sucesso."
              icone={<PlugZap size={34} />}
            />
          ) : (
            <Table colunas={["Bot", "Status", "Erro", "Duração", "Quando"]}>
              {falhas.map((f) => (
                <tr key={f.id} className="hover:bg-muted/30 align-top">
                  <td className="px-3 py-2 font-medium">
                    {nomePorBot.get(f.bot_id) ?? "Bot removido"}
                  </td>
                  <td className="px-3 py-2 tabular-nums">
                    {/* Sem status = a requisição nem chegou a responder
                        (timeout, DNS, conexão recusada). */}
                    {f.status === null ? (
                      <span className="text-muted-foreground">sem resposta</span>
                    ) : (
                      <span className="text-red-600 dark:text-red-400">{f.status}</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground max-w-sm">
                    <span className="line-clamp-2 break-words">{f.erro ?? "—"}</span>
                  </td>
                  <td className="px-3 py-2 tabular-nums text-muted-foreground whitespace-nowrap">
                    {f.duracao_ms === null ? "—" : `${f.duracao_ms} ms`}
                  </td>
                  <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
                    {new Date(f.created_at).toLocaleString("pt-BR")}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </>
      )}
    </Card>
  );
}
