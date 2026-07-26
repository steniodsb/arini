"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Maximize2,
  Minimize2,
  RefreshCw,
  Signal,
  UserX,
} from "lucide-react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Alerta, Card, EmptyState, Spinner } from "@/components/atendimento/ui";
import {
  AVAILABILITY_DOT,
  AVAILABILITY_LABELS,
  CHANNEL_LABELS,
  type ConversationChannel,
} from "@/lib/types";
import { tempoDecorrido, type AoVivoSnapshot } from "./relatorios-utils";

// =====================================================================
// Aba "Ao vivo" — painel de parede do atendimento.
//
// A ideia é diferente do resto do relatório: aqui NÃO existe período.
// O supervisor deixa esta tela aberta e ela responde três perguntas o
// tempo todo: quanta gente está esperando, quem está livre e o que
// acabou de chegar.
//
// COMO A TELA SE MANTÉM VIVA (e por que não é só um setInterval):
//
//  · Supabase Realtime (`postgres_changes` em `conversations` e
//    `messages`) avisa no instante em que algo muda — mesmo padrão que o
//    inbox já usa. Sem isso o número ficaria até 30 s desatualizado, que
//    é uma eternidade para quem está olhando a fila crescer.
//  · Todo evento cai num DEBOUNCE de 1 s. Numa rajada (cliente manda 5
//    mensagens seguidas) chegam 5 eventos; sem o debounce seriam 5
//    requisições completas. Com ele, uma só.
//  · Um `setInterval` de 30 s é a rede de segurança: se o websocket cair
//    (wi-fi da recepção, deploy, aba dormindo), a tela continua correta,
//    só que mais devagar.
//
// O componente NÃO consulta o banco direto: `profiles` tem RLS restrita e
// os contadores precisam de `count exact` no servidor. Tudo vem de
// /api/atendimento/relatorios/ao-vivo.
// =====================================================================

/** Intervalo do refresh de segurança, em ms. */
const REFRESH_MS = 30_000;
/** Janela do debounce dos eventos de tempo real, em ms. */
const DEBOUNCE_MS = 1_000;
/** Faltando menos que isto para o prazo de 1ª resposta, o cartão fica âmbar. */
const MIN_ALERTA_SLA = 15;

type Severidade = "ok" | "atencao" | "estourado";

/**
 * A conversa mais antiga sem resposta já é um problema?
 *
 * Só afirmamos "estourou" quando existe prazo gravado na conversa (herdado
 * da caixa de entrada, migration 0033). Sem política de SLA não há linha
 * para cruzar — e inventar um limite fixo aqui daria alarme falso em quem
 * atende por e-mail, onde 2 h de espera é normal.
 */
function severidadeDaEspera(slaIso: string | null, agoraMs: number): Severidade {
  if (!slaIso) return "ok";
  const prazo = new Date(slaIso).getTime();
  if (!Number.isFinite(prazo)) return "ok";
  if (agoraMs > prazo) return "estourado";
  return prazo - agoraMs <= MIN_ALERTA_SLA * 60_000 ? "atencao" : "ok";
}

const CLASSE_SEVERIDADE: Record<Severidade, string> = {
  ok: "text-arini dark:text-gold",
  atencao: "text-amber-600 dark:text-amber-400",
  estourado: "text-red-600 dark:text-red-400",
};

/** Inicial do contato/agente para o avatar — nome vazio não pode virar "undefined". */
function inicial(nome: string): string {
  const limpo = nome.trim();
  return limpo ? limpo.charAt(0).toUpperCase() : "?";
}

function rotuloCanal(canal: ConversationChannel | null): string {
  return canal ? CHANNEL_LABELS[canal] ?? canal : "—";
}

export function AoVivoPanel() {
  const [dados, setDados] = useState<AoVivoSnapshot | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [atualizando, setAtualizando] = useState(false);
  const [modoTv, setModoTv] = useState(false);

  // Relógio único da tela: um tique por segundo alimenta TODOS os
  // contadores relativos ("há 3 min"). Se cada um chamasse Date.now()
  // sozinho, dois relógios lado a lado piscariam fora de sincronia.
  const [agoraMs, setAgoraMs] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgoraMs(Date.now()), 1_000);
    return () => clearInterval(t);
  }, []);

  // `montado` evita setState depois do unmount — a aba pode ser trocada
  // no meio de um fetch que já saiu.
  const montado = useRef(true);
  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const carregar = useCallback(async () => {
    if (montado.current) setAtualizando(true);
    try {
      const resp = await fetch("/api/atendimento/relatorios/ao-vivo", { cache: "no-store" });
      if (!resp.ok) {
        const corpo = (await resp.json().catch(() => null)) as { error?: string } | null;
        throw new Error(corpo?.error ?? `falha ao carregar (HTTP ${resp.status})`);
      }
      const json = (await resp.json()) as AoVivoSnapshot;
      if (!montado.current) return;
      setDados(json);
      setErro(null);
    } catch (e) {
      if (!montado.current) return;
      // Mantemos o último snapshot na tela: numa parede, número velho com
      // aviso é melhor do que tela em branco.
      setErro(e instanceof Error ? e.message : "falha ao atualizar o painel");
    } finally {
      if (montado.current) {
        setAtualizando(false);
        setCarregando(false);
      }
    }
  }, []);

  useEffect(() => {
    void carregar();
  }, [carregar]);

  // ---- Tempo real + refresh de segurança ------------------------------
  useEffect(() => {
    const supabase = createSupabaseBrowser();
    let timer: ReturnType<typeof setTimeout> | null = null;

    // Debounce: a rajada de eventos vira UMA recarga.
    const agendar = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        timer = null;
        void carregar();
      }, DEBOUNCE_MS);
    };

    const canal = supabase
      .channel("atendimento-relatorio-ao-vivo")
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, agendar)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, agendar)
      .subscribe();

    const intervalo = setInterval(() => void carregar(), REFRESH_MS);

    return () => {
      if (timer) clearTimeout(timer);
      clearInterval(intervalo);
      void supabase.removeChannel(canal);
    };
  }, [carregar]);

  // ---- Modo TV: Esc sai ------------------------------------------------
  useEffect(() => {
    if (!modoTv) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setModoTv(false);
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [modoTv]);

  if (carregando && !dados) {
    return (
      <Card>
        <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          <Spinner /> Carregando o painel ao vivo…
        </div>
      </Card>
    );
  }

  if (!dados) {
    return (
      <Card>
        <EmptyState
          titulo="Não foi possível carregar o painel"
          descricao={erro ?? "Tente novamente em instantes."}
          icone={<Signal size={34} />}
          acao={
            <Button type="button" variant="outline" size="sm" onClick={() => void carregar()}>
              <RefreshCw size={15} /> Tentar de novo
            </Button>
          }
        />
      </Card>
    );
  }

  const severidade = severidadeDaEspera(
    dados.maisAntigaSemResposta?.slaPrimeiraRespostaEm ?? null,
    agoraMs,
  );

  // Escala do modo TV: fontes e espaçamentos maiores, tudo derivado de um
  // único booleano para não espalhar condicional por toda a árvore.
  const tv = modoTv;
  const clsNumero = tv ? "text-6xl" : "text-3xl";
  const clsRotulo = tv ? "text-base" : "text-[11px]";
  const clsTexto = tv ? "text-lg" : "text-sm";
  const clsSecundario = tv ? "text-base" : "text-xs";

  const conteudo = (
    <div className={tv ? "space-y-6" : "space-y-4"}>
      {/* Barra de estado: pulso "ao vivo", hora do último dado e modo TV */}
      <div className="flex flex-wrap items-center gap-3">
        <span className="inline-flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            {/* O halo animado é o que comunica "isto está vivo" de longe. */}
            <span className="absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-70 animate-ping" />
            <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
          </span>
          <span className={`font-medium ${clsSecundario}`}>Ao vivo</span>
        </span>
        <span className={`text-muted-foreground ${clsSecundario}`}>
          atualizado às{" "}
          {new Date(dados.agora).toLocaleTimeString("pt-BR", {
            hour: "2-digit",
            minute: "2-digit",
            second: "2-digit",
          })}
          {atualizando && " · sincronizando…"}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Button type="button" variant="outline" size="sm" onClick={() => void carregar()}>
            <RefreshCw size={15} className={atualizando ? "animate-spin" : undefined} /> Atualizar
          </Button>
          <Button type="button" variant="outline" size="sm" onClick={() => setModoTv((v) => !v)}>
            {tv ? <Minimize2 size={15} /> : <Maximize2 size={15} />} {tv ? "Sair do modo TV" : "Modo TV"}
          </Button>
        </div>
      </div>

      {erro && (
        <Alerta tipo="atencao">
          Os números abaixo são do último carregamento bem-sucedido — a atualização mais recente
          falhou ({erro}).
        </Alerta>
      )}

      {dados.amostraTruncada && (
        <Alerta tipo="atencao">
          A fila passou do teto de varredura desta tela. Os contadores grandes continuam exatos, mas
          a carga por agente e a fila por canal podem estar subestimadas.
        </Alerta>
      )}

      {/* Cartões grandes */}
      <div className={`grid grid-cols-2 lg:grid-cols-4 ${tv ? "gap-5" : "gap-3"}`}>
        <CartaoAoVivo rotulo="Abertas agora" valor={dados.abertas} clsNumero={clsNumero} clsRotulo={clsRotulo} />
        <CartaoAoVivo
          rotulo="Não atribuídas"
          valor={dados.naoAtribuidas}
          clsNumero={clsNumero}
          clsRotulo={clsRotulo}
          // Conversa aberta sem dono é a que ninguém vai pegar sozinho.
          destaque={dados.naoAtribuidas > 0 ? "text-amber-600 dark:text-amber-400" : undefined}
        />
        <CartaoAoVivo rotulo="Pendentes" valor={dados.pendentes} clsNumero={clsNumero} clsRotulo={clsRotulo} />
        <CartaoAoVivo
          rotulo="Aguardando 1ª resposta"
          valor={dados.aguardandoPrimeiraResposta}
          clsNumero={clsNumero}
          clsRotulo={clsRotulo}
          destaque={
            dados.aguardandoPrimeiraResposta > 0 ? "text-amber-600 dark:text-amber-400" : undefined
          }
        />
      </div>

      {/* A mais antiga sem resposta — o cronômetro que dói */}
      <Card
        titulo="Esperando há mais tempo"
        descricao="Conversa aberta há mais tempo que ninguém respondeu."
      >
        <div className={tv ? "p-6" : "p-4"}>
          {dados.maisAntigaSemResposta === null ? (
            <p className={`text-muted-foreground ${clsTexto}`}>
              Nenhuma conversa aberta está sem resposta agora.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-4">
              <div className={`font-semibold tabular-nums leading-none ${clsNumero} ${CLASSE_SEVERIDADE[severidade]}`}>
                {tempoDecorrido(dados.maisAntigaSemResposta.criadaEm, agoraMs)}
              </div>
              <div className="min-w-0">
                <div className={`font-medium truncate ${clsTexto}`}>
                  {dados.maisAntigaSemResposta.contato}
                </div>
                <div className={`text-muted-foreground ${clsSecundario}`}>
                  {rotuloCanal(dados.maisAntigaSemResposta.canal)}
                  {severidade === "estourado" && " · SLA de 1ª resposta ESTOURADO"}
                  {severidade === "atencao" && " · perto de estourar o SLA"}
                  {dados.maisAntigaSemResposta.slaPrimeiraRespostaEm === null &&
                    " · caixa sem política de SLA"}
                </div>
              </div>
              {severidade === "estourado" && (
                <AlertTriangle className="text-red-600 dark:text-red-400 shrink-0" size={tv ? 40 : 24} />
              )}
            </div>
          )}
        </div>
      </Card>

      <div className={`grid lg:grid-cols-2 ${tv ? "gap-5" : "gap-4"}`}>
        {/* Quem está livre agora */}
        <Card
          titulo="Agentes agora"
          descricao="Ordenado pela carga. Offline só aparece quando ainda tem conversa na mão."
        >
          {dados.agentes.length === 0 ? (
            <EmptyState
              titulo="Ninguém disponível no momento"
              descricao="Nenhum agente com acesso ao atendimento está online, ausente ou ocupado agora."
              icone={<UserX size={34} />}
            />
          ) : (
            <ul className="divide-y">
              {dados.agentes.map((a) => (
                <li key={a.id} className={`flex items-center gap-3 ${tv ? "px-6 py-4" : "px-4 py-2.5"}`}>
                  <span
                    className={`relative shrink-0 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground ${
                      tv ? "h-12 w-12 text-lg" : "h-8 w-8 text-xs"
                    }`}
                  >
                    {inicial(a.nome)}
                    <span
                      className={`absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-card ${
                        AVAILABILITY_DOT[a.disponibilidade]
                      } ${tv ? "h-3.5 w-3.5" : "h-2.5 w-2.5"}`}
                    />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className={`font-medium truncate ${clsTexto}`}>{a.nome}</div>
                    <div className={`text-muted-foreground ${clsSecundario}`}>
                      {AVAILABILITY_LABELS[a.disponibilidade]}
                      {a.pendentes > 0 && ` · ${a.pendentes} pendente(s)`}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className={`font-semibold tabular-nums ${tv ? "text-3xl" : "text-lg"}`}>
                      {a.abertas}
                    </div>
                    <div className={`text-muted-foreground ${tv ? "text-sm" : "text-[10px]"}`}>abertas</div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>

        {/* Fila por canal */}
        <Card titulo="Fila por canal" descricao="Conversas abertas neste instante.">
          {dados.canais.length === 0 ? (
            <EmptyState titulo="Nenhuma conversa aberta agora" icone={<Signal size={34} />} />
          ) : (
            <ul className="divide-y">
              {dados.canais.map((c) => {
                const pct = dados.abertas > 0 ? (c.abertas / dados.abertas) * 100 : 0;
                return (
                  <li key={c.canal} className={tv ? "px-6 py-4" : "px-4 py-2.5"}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className={`truncate ${clsTexto}`}>{rotuloCanal(c.canal)}</span>
                      <span className={`font-semibold tabular-nums shrink-0 ${tv ? "text-2xl" : "text-base"}`}>
                        {c.abertas}
                      </span>
                    </div>
                    <div className={`mt-1.5 rounded-full bg-muted overflow-hidden ${tv ? "h-3" : "h-1.5"}`}>
                      <div
                        className="h-full rounded-full bg-arini dark:bg-gold"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      {/* Entrando agora */}
      <Card titulo="Entrando agora" descricao="Últimas mensagens recebidas dos clientes.">
        {dados.entrando.length === 0 ? (
          <EmptyState
            titulo="Nenhuma mensagem recebida ainda"
            descricao="Assim que um cliente escrever, a mensagem aparece aqui sozinha."
            icone={<Signal size={34} />}
          />
        ) : (
          <ul className="divide-y">
            {dados.entrando.map((m) => (
              <li key={m.id} className={`flex items-start gap-3 ${tv ? "px-6 py-4" : "px-4 py-2.5"}`}>
                <span
                  className={`shrink-0 rounded-full bg-muted flex items-center justify-center font-semibold text-muted-foreground ${
                    tv ? "h-10 w-10 text-base" : "h-7 w-7 text-[11px]"
                  }`}
                >
                  {inicial(m.contato)}
                </span>
                <div className="min-w-0 flex-1">
                  <div className={`flex items-baseline gap-2 ${clsTexto}`}>
                    <span className="font-medium truncate">{m.contato}</span>
                    <span className={`text-muted-foreground shrink-0 ${clsSecundario}`}>
                      {rotuloCanal(m.canal)}
                    </span>
                  </div>
                  <p className={`text-muted-foreground truncate ${clsSecundario}`}>{m.trecho}</p>
                </div>
                <span className={`text-muted-foreground shrink-0 tabular-nums ${clsSecundario}`}>
                  há {tempoDecorrido(m.criadaEm, agoraMs)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );

  // No modo TV o painel sai do fluxo da página e cobre tudo — inclusive a
  // navegação lateral do atendimento, que numa parede só rouba espaço.
  if (tv) {
    return (
      <div className="fixed inset-0 z-50 bg-background overflow-y-auto p-8">
        {conteudo}
      </div>
    );
  }
  return conteudo;
}

function CartaoAoVivo({
  rotulo,
  valor,
  clsNumero,
  clsRotulo,
  destaque,
}: {
  rotulo: string;
  valor: number;
  clsNumero: string;
  clsRotulo: string;
  destaque?: string;
}) {
  return (
    <div className="rounded-xl border bg-card p-4">
      <div className={`font-semibold leading-none tabular-nums ${clsNumero} ${destaque ?? "text-arini dark:text-gold"}`}>
        {valor}
      </div>
      <div className={`text-muted-foreground mt-2 ${clsRotulo}`}>{rotulo}</div>
    </div>
  );
}
