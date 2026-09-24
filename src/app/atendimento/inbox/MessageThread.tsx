"use client";

import { forwardRef, useEffect, useMemo, useState } from "react";
import {
  StickyNote, CornerUpLeft, Bot, Settings2, AlertCircle, Check, CheckCheck, Trash2, Pencil, Loader2,
} from "lucide-react";
import { podeEditar, textoSemMarca } from "@/lib/atendimento/editar-mensagem";
import { formatDateTimeBR } from "@/lib/utils";
import { MediaBubble } from "./MediaBubble";
import type { Message, MessageStatus } from "@/lib/types";
import { fmtBR } from "@/lib/fuso";

function diaDaMensagem(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date(); ontem.setDate(hoje.getDate() - 1);
  const mesmoDia = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (mesmoDia(d, hoje)) return "Hoje";
  if (mesmoDia(d, ontem)) return "Ontem";
  return fmtBR(d, { day: "2-digit", month: "long", year: "numeric" });
}

/** Ícone de entrega das mensagens de saída (estilo WhatsApp). */
function StatusIcon({ status }: { status: MessageStatus }) {
  // O tique azul de "lida" precisa aparecer tanto na bolha clara (tema
  // claro) quanto na escura — por isso a cor muda com o tema, não fixa.
  if (status === "falha") return <AlertCircle size={11} className="text-red-600 dark:text-red-300" />;
  if (status === "lida") return <CheckCheck size={12} className="text-sky-600 dark:text-sky-300" />;
  if (status === "entregue") return <CheckCheck size={12} />;
  if (status === "enviada") return <Check size={12} />;
  return null;
}

/**
 * Quebra o texto nos trechos que casam com o termo buscado, para destacar
 * sem usar innerHTML (o conteúdo vem do cliente — nunca injetar como HTML).
 */
function destacar(texto: string, termo: string): React.ReactNode {
  const t = termo.trim();
  if (!t) return texto;
  const partes: React.ReactNode[] = [];
  const alvo = texto.toLowerCase();
  const busca = t.toLowerCase();
  let i = 0;
  let achou = alvo.indexOf(busca);
  let chave = 0;
  while (achou !== -1) {
    if (achou > i) partes.push(texto.slice(i, achou));
    partes.push(
      <mark key={chave++} className="bg-amber-400/40 text-inherit rounded-sm px-0.5">
        {texto.slice(achou, achou + t.length)}
      </mark>,
    );
    i = achou + t.length;
    achou = alvo.indexOf(busca, i);
  }
  if (i < texto.length) partes.push(texto.slice(i));
  return partes;
}

export const MessageThread = forwardRef<
  HTMLDivElement,
  {
    mensagens: Message[];
    carregando: boolean;
    autorNome: Map<string, string>;
    onResponder: (m: Message) => void;
    /** Termo da busca na thread — destaca os trechos encontrados. */
    termoBusca?: string;
    /** Apagar é soft delete; só faz sentido no que a equipe escreveu. */
    onApagar?: (m: Message) => void;
    /**
     * Editar mensagem enviada (texto, até 15 min, ver `editar-mensagem.ts`).
     * Devolve o erro para mostrar dentro da própria bolha, ou null.
     */
    onEditar?: (m: Message, texto: string) => Promise<string | null>;
    /** Quem está olhando — decide em quais mensagens o lápis aparece. */
    usuarioId?: string;
    ehAdmin?: boolean;
  }
>(function MessageThread(
  { mensagens, carregando, autorNome, onResponder, termoBusca = "", onApagar, onEditar, usuarioId, ehAdmin = false },
  ref,
) {
  // Qual mensagem está sendo editada, e o texto no campo.
  const [editando, setEditando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [erroEdicao, setErroEdicao] = useState<string | null>(null);

  // O lápis some quando passam os 15 minutos. Sem este relógio ele ficava
  // na tela até a próxima recarga, e o clique dava erro.
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAgora(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);

  const editavel = (m: Message) =>
    Boolean(onEditar && usuarioId) &&
    podeEditar(
      {
        direcao: m.direcao, remetente: m.remetente, autor_id: m.autor_id, tipo: m.tipo,
        interna: m.interna, created_at: m.created_at, apagada_em: m.apagada_em,
        external_id: m.external_id, conteudo: m.conteudo,
      },
      usuarioId as string,
      ehAdmin,
      agora,
    ).ok;

  function abrirEdicao(m: Message) {
    const autor = m.autor_id ? autorNome.get(m.autor_id) : null;
    setEditando(m.id);
    setRascunho(textoSemMarca(m.conteudo ?? "", autor).texto);
    setErroEdicao(null);
  }

  async function salvarEdicao(m: Message) {
    if (!onEditar || salvando) return;
    const texto = rascunho.trim();
    if (!texto) { setErroEdicao("A mensagem não pode ficar vazia."); return; }
    setSalvando(true);
    const erro = await onEditar(m, texto);
    setSalvando(false);
    if (erro) { setErroEdicao(erro); return; }
    setEditando(null);
  }

  /** Campo de edição dentro da bolha — Enter salva, Esc cancela. */
  function campoEdicao(m: Message, claro: boolean) {
    return (
      <div className="space-y-1.5 min-w-[240px]">
        <textarea
          autoFocus
          value={rascunho}
          onChange={(e) => setRascunho(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void salvarEdicao(m); }
            if (e.key === "Escape") setEditando(null);
          }}
          rows={Math.min(8, Math.max(2, rascunho.split("\n").length))}
          className={`w-full resize-none rounded-md border px-2 py-1.5 text-[15px] leading-snug outline-none focus:ring-2 focus:ring-ring/40 ${
            claro ? "bg-background text-foreground" : "bg-background text-foreground"
          }`}
        />
        {erroEdicao && <div className="text-[11px] text-red-600 dark:text-red-300">{erroEdicao}</div>}
        <div className="flex items-center justify-end gap-2 text-[12px]">
          <button type="button" onClick={() => setEditando(null)} className="px-2 py-1 rounded hover:bg-black/10">
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void salvarEdicao(m)}
            disabled={salvando}
            className="px-2.5 py-1 rounded bg-acao text-acao-foreground font-medium inline-flex items-center gap-1 disabled:opacity-60"
          >
            {salvando && <Loader2 size={12} className="animate-spin" />} Salvar
          </button>
        </div>
      </div>
    );
  }
  const porId = useMemo(() => {
    const m = new Map<string, Message>();
    for (const msg of mensagens) m.set(msg.id, msg);
    return m;
  }, [mensagens]);

  return (
    <div ref={ref} className="flex-1 overflow-y-auto p-4 space-y-1.5 min-h-0 bg-chat">
      {carregando && mensagens.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-6">Carregando…</p>
      )}
      {!carregando && mensagens.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-6">Sem mensagens nesta conversa.</p>
      )}

      {mensagens.map((m, i) => {
        const anterior = mensagens[i - 1];
        const novoDia = !anterior || diaDaMensagem(anterior.created_at) !== diaDaMensagem(m.created_at);
        const citada = m.reply_to_id ? porId.get(m.reply_to_id) : null;
        const autor = m.autor_id ? autorNome.get(m.autor_id) : null;

        return (
          <div key={m.id}>
            {novoDia && (
              <div className="flex justify-center my-3">
                <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  {diaDaMensagem(m.created_at)}
                </span>
              </div>
            )}

            {/* Nota interna — centralizada, cor de alerta, nunca vai ao cliente */}
            {m.interna ? (
              <div className="flex justify-center group">
                <div className="max-w-[80%] rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 px-3 py-2 text-[15px] leading-snug">
                  <div className="flex items-center gap-1 text-[10px] font-semibold uppercase text-amber-700 dark:text-amber-400 mb-0.5">
                    <StickyNote size={11} /> Nota interna{autor ? ` · ${autor}` : ""}
                  </div>
                  {editando === m.id ? (
                    campoEdicao(m, true)
                  ) : (
                    <div className="whitespace-pre-line break-words">
                      {destacar(m.conteudo ?? "", termoBusca)}
                    </div>
                  )}
                  {m.media_url && <div className="mt-1.5"><MediaBubble m={m} saida={false} /></div>}
                  <div className="mt-1 text-[10px] opacity-70 flex items-center gap-1.5">
                    {formatDateTimeBR(m.created_at)}
                    {m.editada_em && <span title={m.conteudo_original ? `Antes: ${m.conteudo_original}` : undefined}>· editada</span>}
                    {editavel(m) && editando !== m.id && (
                      <button
                        type="button"
                        onClick={() => abrirEdicao(m)}
                        title="Editar nota"
                        className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-amber-500/20"
                      >
                        <Pencil size={11} />
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ) : m.remetente === "sistema" && m.direcao === "out" ? (
              /*
                MENSAGEM AUTOMÁTICA PARA O CLIENTE (a "Lia", o menu de
                ramais, as automações). Era desenhada como a etiqueta cinza
                de evento do sistema — uma linha só, em 10 px, com as
                quebras de linha apagadas: o menu de sete ramais virava um
                parágrafo ilegível (relato de 24/09). É uma mensagem que o
                cliente RECEBEU; aparece como bolha de saída, com a marca
                de que foi o robô que mandou.
              */
              <div className="flex justify-end">
                <div className="max-w-[75%] rounded-2xl rounded-br-sm px-3 py-2 text-[15px] leading-snug bg-bolha-out/80 text-bolha-out-foreground border border-dashed border-bolha-out-foreground/25">
                  <div className="flex items-center gap-1 text-[11px] font-medium opacity-75 mb-0.5">
                    <Bot size={12} /> Mensagem automática
                  </div>
                  <div className="whitespace-pre-line break-words">
                    {destacar(m.conteudo ?? "", termoBusca)}
                  </div>
                  <div className="mt-1 flex items-center justify-end gap-1 text-[11px] opacity-70">
                    <span>{formatDateTimeBR(m.created_at)}</span>
                    <StatusIcon status={m.status} />
                  </div>
                </div>
              </div>
            ) : m.remetente === "sistema" ? (
              <div className="flex justify-center">
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
                  <Settings2 size={10} /> {m.conteudo}
                </span>
              </div>
            ) : (
              (() => {
                const saida = m.direcao === "out";
                return (
                  <div className={`flex group ${saida ? "justify-end" : "justify-start"}`}>
                    {/* Responder aparece no hover, do lado de fora do balão */}
                    {saida && (
                      <span className="self-center flex items-center opacity-0 group-hover:opacity-100 transition-opacity">
                        {editavel(m) && editando !== m.id && (
                          <button
                            type="button"
                            onClick={() => abrirEdicao(m)}
                            title="Editar mensagem (até 15 minutos depois do envio)"
                            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-foreground"
                          >
                            <Pencil size={13} />
                          </button>
                        )}
                        {onApagar && !m.apagada_em && (
                          <button
                            type="button"
                            onClick={() => onApagar(m)}
                            title="Apagar mensagem"
                            className="p-1 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
                          >
                            <Trash2 size={13} />
                          </button>
                        )}
                        <BotaoResponder onClick={() => onResponder(m)} lado="esquerda" />
                      </span>
                    )}
                    <div
                      className={`max-w-[75%] rounded-2xl px-3 py-2 text-[15px] leading-snug ${
                        saida
                          ? "bg-bolha-out text-bolha-out-foreground rounded-br-sm"
                          : "bg-card border rounded-bl-sm"
                      }`}
                    >
                      {citada && (
                        <div
                          className={`mb-1.5 rounded-md border-l-2 px-2 py-1 text-[11px] ${
                            saida
                              // Dentro da bolha, a citação se destaca da PRÓPRIA
                              // cor dela — branco fixo sumia na bolha clara.
                              ? "border-bolha-out-foreground/40 bg-bolha-out-foreground/10"
                              : "border-acao/40 bg-muted/60"
                          }`}
                        >
                          <div className="opacity-70 truncate">
                            {citada.conteudo || `[${citada.tipo}]`}
                          </div>
                        </div>
                      )}

                      {m.apagada_em ? (
                        <div className="italic opacity-60 text-xs inline-flex items-center gap-1">
                          <Trash2 size={11} /> mensagem apagada
                        </div>
                      ) : (
                        <>
                          {m.media_url && (
                            <div className={m.conteudo ? "mb-1.5" : ""}>
                              <MediaBubble m={m} saida={saida} />
                            </div>
                          )}

                          {editando === m.id ? (
                            campoEdicao(m, saida)
                          ) : m.conteudo ? (
                            <div className="whitespace-pre-line break-words">
                              {destacar(m.conteudo, termoBusca)}
                            </div>
                          ) : !m.media_url ? (
                            <MidiaAusente m={m} agora={agora} />
                          ) : null}
                        </>
                      )}

                      <div
                        className={`mt-1 flex items-center gap-1 text-[11px] ${
                          saida ? "opacity-70 justify-end" : "text-muted-foreground"
                        }`}
                      >
                        {m.remetente === "ia" && <Bot size={10} />}
                        {saida && autor && <span className="truncate max-w-[90px]">{autor}</span>}
                        {m.editada_em && (
                          <span
                            className="italic"
                            title={m.conteudo_original ? `Antes: ${m.conteudo_original}` : "Mensagem editada"}
                          >
                            editada
                          </span>
                        )}
                        <span>{formatDateTimeBR(m.created_at)}</span>
                        {saida && <StatusIcon status={m.status} />}
                        {saida && m.status === "falha" && (
                          <span className="text-red-600 dark:text-red-300">falhou</span>
                        )}
                      </div>
                    </div>
                    {!saida && <BotaoResponder onClick={() => onResponder(m)} lado="direita" />}
                  </div>
                );
              })()
            )}
          </div>
        );
      })}
    </div>
  );
});

/**
 * Foto/áudio/vídeo/documento cujo arquivo ainda não está aqui. Antes a
 * bolha dizia só "[video]" — sem dizer se estava chegando ou se tinha
 * falhado (relato de 24/09, vídeo de 40 MB). Mídia grande é baixada em
 * segundo plano; nos primeiros minutos, "chegando…"; depois, a orientação
 * de abrir no celular, que é onde o arquivo continua existindo.
 */
function MidiaAusente({ m, agora }: { m: Message; agora: number }) {
  const rotulo: Record<string, string> = {
    video: "Vídeo", imagem: "Foto", audio: "Áudio", documento: "Documento",
  };
  const nome = rotulo[m.tipo] ?? "Arquivo";
  if (m.tipo === "texto") return <div className="italic opacity-70">[mensagem sem texto]</div>;
  const recente = agora - new Date(m.created_at).getTime() < 5 * 60_000;
  return (
    <div className="italic opacity-75 text-[14px] inline-flex items-center gap-1.5">
      {recente ? (
        <>
          <Loader2 size={13} className="animate-spin" /> {nome} chegando…
        </>
      ) : (
        <>{nome} não pôde ser baixado — veja no WhatsApp do celular</>
      )}
    </div>
  );
}

function BotaoResponder({ onClick, lado }: { onClick: () => void; lado: "esquerda" | "direita" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Responder esta mensagem"
      className={`self-center p-1 rounded text-muted-foreground opacity-0 group-hover:opacity-100 hover:bg-muted transition-opacity ${
        lado === "esquerda" ? "mr-1" : "ml-1"
      }`}
    >
      <CornerUpLeft size={13} />
    </button>
  );
}
