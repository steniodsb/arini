"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { EmojiPicker } from "./EmojiPicker";
import { AudioRecorder, audioPodeSerRecusadoPelaCloudApi } from "./AudioRecorder";
import {
  Send, StickyNote, Zap, Paperclip, X, AtSign, PenLine, CornerUpLeft, Workflow, Mic,
} from "lucide-react";
import type { AgentOption, CannedResponse, AtendimentoMacro, Message } from "@/lib/types";

export type ArquivoPendente = { file: File; preview: string | null };

/**
 * Composer da conversa: resposta ou nota interna, anexos, emoji, respostas
 * rápidas (com atalho "/"), menções "@" nas notas, macros e assinatura.
 */
export function Composer({
  cannedResponses,
  macros,
  agents,
  assinatura,
  respondendoA,
  onCancelarResposta,
  enviando,
  onEnviar,
  onAplicarMacro,
  bloqueado,
  avisoBloqueio,
  injetarTexto,
  onTextoInjetado,
  provedorCanal,
}: {
  cannedResponses: CannedResponse[];
  macros: AtendimentoMacro[];
  agents: AgentOption[];
  assinatura: string | null;
  respondendoA: Message | null;
  onCancelarResposta: () => void;
  enviando: boolean;
  onEnviar: (dados: {
    texto: string;
    interna: boolean;
    arquivos: File[];
    mentions: string[];
    assinar: boolean;
  }) => void | Promise<void>;
  onAplicarMacro: (macroId: string) => void;
  bloqueado?: boolean;
  avisoBloqueio?: string;
  /** Texto vindo de fora (sugestão do copiloto) para cair no campo. */
  injetarTexto?: string | null;
  onTextoInjetado?: () => void;
  /**
   * Provedor do canal desta conversa ("evolution", "cloud_api", …), quando
   * quem monta o composer souber. Serve só para calibrar o aviso de formato
   * do áudio gravado; sem ele avisamos de forma condicional ("se este canal
   * for a API Oficial…") em vez de afirmar o que não sabemos.
   */
  provedorCanal?: string | null;
}) {
  const [texto, setTexto] = useState("");
  const [modo, setModo] = useState<"resposta" | "nota">("resposta");
  const [arquivos, setArquivos] = useState<ArquivoPendente[]>([]);
  const [mentions, setMentions] = useState<string[]>([]);
  const [assinar, setAssinar] = useState(true);
  const [menu, setMenu] = useState<"canned" | "macros" | "mencao" | null>(null);
  // Gravação em curso: trava o envio para não sair mensagem pela metade.
  const [gravandoAudio, setGravandoAudio] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Libera as URLs de preview ao trocar/desmontar (senão vaza memória).
  useEffect(() => {
    return () => { arquivos.forEach((a) => a.preview && URL.revokeObjectURL(a.preview)); };
  }, [arquivos]);

  // Sugestão do copiloto entra como resposta ao cliente, no fim do que já
  // estiver escrito — nunca sobrescreve o que o atendente digitou.
  useEffect(() => {
    if (!injetarTexto) return;
    setModo("resposta");
    setTexto((t) => (t.trim() ? `${t.trimEnd()}\n\n${injetarTexto}` : injetarTexto));
    requestAnimationFrame(() => taRef.current?.focus());
    onTextoInjetado?.();
  }, [injetarTexto, onTextoInjetado]);

  // Atalhos do composer: Alt+N alterna nota interna.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === "n") {
        e.preventDefault();
        setModo((m) => (m === "nota" ? "resposta" : "nota"));
        taRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function inserir(txt: string) {
    const ta = taRef.current;
    if (!ta) { setTexto((t) => t + txt); return; }
    const ini = ta.selectionStart ?? texto.length;
    const fim = ta.selectionEnd ?? texto.length;
    const novo = texto.slice(0, ini) + txt + texto.slice(fim);
    setTexto(novo);
    requestAnimationFrame(() => {
      ta.focus();
      ta.selectionStart = ta.selectionEnd = ini + txt.length;
    });
  }

  // Áudio também ganha preview: é o mesmo blob URL, e assim o atendente
  // consegue ouvir a nota de voz antes de mandar (o efeito de limpeza
  // lá em cima já revoga todas as URLs).
  function previewDe(file: File): string | null {
    return file.type.startsWith("image/") || file.type.startsWith("audio/")
      ? URL.createObjectURL(file)
      : null;
  }

  function addArquivos(lista: FileList | null) {
    if (!lista?.length) return;
    const novos: ArquivoPendente[] = Array.from(lista).map((file) => ({
      file,
      preview: previewDe(file),
    }));
    setArquivos((prev) => [...prev, ...novos]);
  }

  /**
   * A gravação vira um File comum e entra na MESMA lista de anexos — não
   * existe caminho de envio paralelo para áudio.
   */
  function addGravacao(file: File) {
    setArquivos((prev) => [...prev, { file, preview: previewDe(file) }]);
  }

  function removerArquivo(i: number) {
    setArquivos((prev) => {
      const alvo = prev[i];
      if (alvo?.preview) URL.revokeObjectURL(alvo.preview);
      return prev.filter((_, idx) => idx !== i);
    });
  }

  function limpar() {
    setTexto("");
    setArquivos([]);
    setMentions([]);
    setMenu(null);
  }

  async function enviar(tambemResolver = false) {
    const body = texto.trim();
    if ((!body && arquivos.length === 0) || enviando || bloqueado || gravandoAudio) return;
    await onEnviar({
      texto: body,
      interna: modo === "nota",
      arquivos: arquivos.map((a) => a.file),
      mentions,
      assinar: modo === "resposta" && assinar && Boolean(assinatura),
    });
    limpar();
    if (tambemResolver) {
      // O pai trata o resolver via atalho; aqui só limpamos.
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void enviar((e.metaKey || e.ctrlKey) === true);
      return;
    }
    // "/" no começo abre as respostas rápidas; "@" abre menções na nota.
    if (e.key === "/" && texto.length === 0) setMenu("canned");
    if (e.key === "@" && modo === "nota") setMenu("mencao");
  }

  const nota = modo === "nota";

  /**
   * Aviso honesto de entrega do áudio gravado.
   *
   * O que a gente sabe de fato:
   *  - Evolution API: o envio de áudio usa /message/sendWhatsAppAudio, que
   *    converte para nota de voz — webm/opus costuma passar sem problema.
   *  - Cloud API da Meta (WhatsApp oficial): a lista de mídias de áudio
   *    aceitas é audio/ogg (opus), audio/mpeg, audio/mp4 e audio/aac.
   *    webm NÃO está nessa lista e o envio pode voltar com erro.
   * Converter no navegador exigiria ffmpeg.wasm (dependência nova), então
   * o que dá para fazer com honestidade é avisar antes de enviar.
   */
  const audioWebmPendente = arquivos.some((a) => audioPodeSerRecusadoPelaCloudApi(a.file.type));
  const canalECloudApi = (provedorCanal ?? "").startsWith("cloud_api");
  const avisoAudioWebm =
    audioWebmPendente && !nota && (canalECloudApi || provedorCanal == null)
      ? canalECloudApi
        ? "Este canal é a API Oficial da Meta, que não aceita áudio em WebM — o WhatsApp pode recusar esta nota de voz."
        : "Áudio gravado em WebM. A Evolution API converte para nota de voz normalmente, mas a API Oficial da Meta (Cloud API) não aceita WebM e pode recusar o envio."
      : null;

  return (
    <div className="border-t bg-card shrink-0">
      {/* Citação */}
      {respondendoA && (
        <div className="px-3 pt-2 flex items-start gap-2">
          <div className="flex-1 min-w-0 rounded-md border-l-2 border-l-arini dark:border-l-gold bg-muted/50 px-2.5 py-1.5">
            <div className="text-[10px] font-medium text-muted-foreground flex items-center gap-1">
              <CornerUpLeft size={10} /> Respondendo a
            </div>
            <div className="text-xs truncate">
              {respondendoA.conteudo || `[${respondendoA.tipo}]`}
            </div>
          </div>
          <button
            type="button"
            onClick={onCancelarResposta}
            className="p-1 text-muted-foreground hover:text-foreground"
            aria-label="Cancelar resposta"
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Abas + ferramentas (flex-wrap: o painel do gravador cai numa linha própria) */}
      <div className="flex flex-wrap items-center gap-1 px-3 pt-2">
        <button
          type="button"
          onClick={() => setModo("resposta")}
          className={`text-xs px-2.5 py-1 rounded-t-md ${
            !nota ? "bg-acao text-acao-foreground" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          Responder
        </button>
        <button
          type="button"
          onClick={() => setModo("nota")}
          title="Alt + N"
          className={`text-xs px-2.5 py-1 rounded-t-md inline-flex items-center gap-1 ${
            nota ? "bg-amber-500 text-white" : "text-muted-foreground hover:bg-muted"
          }`}
        >
          <StickyNote size={12} /> Nota interna
        </button>

        <div className="ml-auto flex items-center gap-0.5">
          {/* Macros */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === "macros" ? null : "macros")}
              title="Macros"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Workflow size={16} />
            </button>
            {menu === "macros" && (
              <Dropdown onFechar={() => setMenu(null)}>
                {macros.length === 0 && <Vazio texto="Nenhuma macro cadastrada." />}
                {macros.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => { onAplicarMacro(m.id); setMenu(null); }}
                    className="w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted"
                  >
                    <div className="text-xs font-medium">{m.nome}</div>
                    {m.descricao && (
                      <div className="text-[11px] text-muted-foreground truncate">{m.descricao}</div>
                    )}
                  </button>
                ))}
              </Dropdown>
            )}
          </div>

          {/* Respostas rápidas */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenu(menu === "canned" ? null : "canned")}
              title="Respostas rápidas (digite / )"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <Zap size={16} />
            </button>
            {menu === "canned" && (
              <Dropdown onFechar={() => setMenu(null)}>
                {cannedResponses.length === 0 && <Vazio texto="Nenhuma resposta rápida cadastrada." />}
                {cannedResponses.map((cr) => (
                  <button
                    key={cr.id}
                    type="button"
                    onClick={() => { inserir((texto ? "\n" : "") + cr.conteudo); setMenu(null); }}
                    className="w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted"
                  >
                    <div className="text-xs font-medium">
                      {cr.titulo} <span className="text-muted-foreground">/{cr.atalho}</span>
                    </div>
                    <div className="text-[11px] text-muted-foreground truncate">{cr.conteudo}</div>
                  </button>
                ))}
              </Dropdown>
            )}
          </div>

          {/* Menção (só faz sentido em nota interna) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => { setModo("nota"); setMenu(menu === "mencao" ? null : "mencao"); }}
              title="Mencionar um colega (só em nota interna)"
              className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <AtSign size={16} />
            </button>
            {menu === "mencao" && (
              <Dropdown onFechar={() => setMenu(null)}>
                {agents.length === 0 && <Vazio texto="Nenhum agente." />}
                {agents.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      inserir(`@${a.nome} `);
                      setMentions((prev) => (prev.includes(a.id) ? prev : [...prev, a.id]));
                      setMenu(null);
                    }}
                    className="w-full text-left px-3 py-2 border-b last:border-0 hover:bg-muted text-xs"
                  >
                    {a.nome}
                  </button>
                ))}
              </Dropdown>
            )}
          </div>

          <EmojiPicker onPick={(e) => inserir(e)} />

          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            title="Anexar arquivo"
            className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <Paperclip size={16} />
          </button>
          <input
            ref={fileRef}
            type="file"
            multiple
            hidden
            onChange={(e) => { addArquivos(e.target.files); e.target.value = ""; }}
          />

          {assinatura && !nota && (
            <button
              type="button"
              onClick={() => setAssinar((v) => !v)}
              title={assinar ? "Assinatura ligada" : "Assinatura desligada"}
              className={`p-1.5 rounded-md hover:bg-muted ${
                assinar ? "text-arini dark:text-gold" : "text-muted-foreground"
              }`}
            >
              <PenLine size={16} />
            </button>
          )}
        </div>

        {/*
          Gravador de áudio. Fica fora do grupo com `ml-auto` de propósito:
          ele devolve um fragmento (botão + painel de largura total), e o
          painel só consegue quebrar linha sendo filho direto desta fileira.
          O botão do microfone cai colado no clipe/emoji, como pedido.
        */}
        <AudioRecorder
          onGravado={addGravacao}
          desabilitado={bloqueado || enviando}
          onAtivoChange={setGravandoAudio}
        />
      </div>

      {/* Anexos pendentes */}
      {arquivos.length > 0 && (
        <div className="px-3 pt-2 flex flex-wrap gap-2">
          {arquivos.map((a, i) => (
            <div
              key={i}
              className={`relative rounded-md border bg-muted/40 p-1.5 pr-6 ${
                a.file.type.startsWith("audio/") ? "max-w-[240px]" : "max-w-[160px]"
              }`}
            >
              {a.file.type.startsWith("audio/") && a.preview ? (
                // Áudio precisa ser CONFERIDO antes de ir, não só nomeado.
                <div className="w-[210px]">
                  <audio controls src={a.preview} className="h-8 w-full">
                    Seu navegador não toca áudio.
                  </audio>
                  <div className="text-[10px] text-muted-foreground truncate mt-0.5">{a.file.name}</div>
                </div>
              ) : a.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={a.preview} alt={a.file.name} className="h-14 w-full object-cover rounded" />
              ) : (
                <div className="text-[11px] truncate py-2">{a.file.name}</div>
              )}
              <button
                type="button"
                onClick={() => removerArquivo(i)}
                className="absolute top-0.5 right-0.5 p-0.5 rounded bg-background/80 text-muted-foreground hover:text-red-600"
                aria-label="Remover anexo"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>
      )}

      {avisoAudioWebm && (
        <div className="mx-3 mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[10px] text-amber-800 dark:text-amber-300">
          {avisoAudioWebm}
        </div>
      )}

      {bloqueado && avisoBloqueio && (
        <div className="mx-3 mt-2 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-800 dark:text-amber-300">
          {avisoBloqueio}
        </div>
      )}

      <div
        className={`p-3 pt-2 flex items-end gap-2 ${nota ? "bg-amber-500/5" : ""}`}
        onDragOver={(e) => e.preventDefault()}
        onDrop={(e) => { e.preventDefault(); addArquivos(e.dataTransfer.files); }}
      >
        {gravandoAudio ? (
          // Enquanto grava, o campo de texto sai de cena: o atendente
          // resolve a nota de voz primeiro (usar ou descartar) e só depois
          // volta a escrever — evita mandar mensagem pela metade.
          <div className="flex-1 min-h-[42px] rounded-md border border-dashed bg-muted/30 px-3 py-2 text-sm text-muted-foreground flex items-center gap-2">
            <Mic size={15} className="text-red-600 shrink-0" />
            Gravando áudio… use os controles acima para parar, usar ou descartar.
          </div>
        ) : (
          <textarea
            ref={taRef}
            rows={1}
            value={texto}
            disabled={bloqueado}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              nota
                ? "Nota interna — só a equipe vê. Use @ para avisar um colega."
                : "Escreva uma resposta…  (Enter envia · Shift+Enter quebra linha · / respostas rápidas)"
            }
            className="flex-1 resize-none min-h-[42px] max-h-40 rounded-md border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring/40 disabled:opacity-60"
          />
        )}
        <Button
          type="button"
          variant={nota ? "outline" : "gold"}
          onClick={() => void enviar()}
          disabled={
            enviando || bloqueado || gravandoAudio || (!texto.trim() && arquivos.length === 0)
          }
        >
          {nota ? <StickyNote size={15} /> : <Send size={15} />}
          {enviando ? "…" : nota ? "Nota" : "Enviar"}
        </Button>
      </div>

      {assinar && assinatura && !nota && (
        <div className="px-3 pb-2 -mt-1 text-[10px] text-muted-foreground truncate">
          Assinando com: {assinatura.replace(/\n/g, " · ")}
        </div>
      )}
    </div>
  );
}

function Dropdown({ children, onFechar }: { children: React.ReactNode; onFechar: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onFechar();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [onFechar]);
  return (
    <div
      ref={ref}
      className="absolute right-0 bottom-9 z-40 w-72 max-h-64 overflow-y-auto rounded-lg border bg-popover shadow-xl"
    >
      {children}
    </div>
  );
}

function Vazio({ texto }: { texto: string }) {
  return <div className="p-3 text-xs text-muted-foreground">{texto}</div>;
}
