"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Square, Trash2, Pause, Play, Check, RotateCcw } from "lucide-react";

/**
 * Gravador de áudio do composer (nota de voz), no estilo do Chatwoot: o
 * atendente grava sem sair da tela e o resultado vira só mais um `File`
 * na lista de anexos pendentes — o envio continua sendo o mesmo de sempre.
 *
 * Nada de biblioteca externa: MediaRecorder + AudioContext do próprio
 * navegador dão conta de gravar, medir nível e gerar o arquivo.
 */

/** Teto de 5 minutos: nota de voz longa trava o upload e ninguém escuta. */
const LIMITE_MS = 5 * 60 * 1000;

/** Quantas barrinhas do medidor de nível desenhamos. */
const QTD_BARRAS = 7;

/**
 * Ordem de preferência de contêiner/codec.
 *
 * Isso importa MUITO porque o áudio não fica no navegador — ele é
 * reenviado para o WhatsApp/Telegram, e cada canal aceita um conjunto
 * diferente de contêineres:
 *  - `audio/webm;codecs=opus` é o que Chrome/Edge/Firefox gravam bem e é o
 *    que a Evolution API engole (ela reconverte para nota de voz);
 *  - `audio/mp4` (AAC) é o ÚNICO formato que o Safari sabe gravar — sem
 *    esse fallback o botão simplesmente não funcionaria no Mac/iPhone;
 *  - `audio/ogg;codecs=opus` fica por último porque poucos navegadores
 *    gravam nele, mas é justamente o formato que a Cloud API da Meta
 *    prefere — se o navegador oferecer, melhor ainda.
 * Sem esse teste em cascata, `new MediaRecorder(stream, { mimeType })`
 * estoura NotSupportedError e a gravação nem começa.
 */
const FORMATOS: { mime: string; ext: string }[] = [
  { mime: "audio/webm;codecs=opus", ext: "webm" },
  { mime: "audio/webm", ext: "webm" },
  { mime: "audio/mp4", ext: "m4a" },
  { mime: "audio/ogg;codecs=opus", ext: "ogg" },
];

/** Primeiro formato da lista que este navegador realmente sabe gravar. */
export function escolherFormatoAudio(): { mime: string; ext: string } | null {
  if (typeof window === "undefined") return null;
  if (typeof MediaRecorder === "undefined") return null;
  if (typeof MediaRecorder.isTypeSupported !== "function") return null;
  return FORMATOS.find((f) => MediaRecorder.isTypeSupported(f.mime)) ?? null;
}

/**
 * O canal oficial do WhatsApp (Cloud API da Meta) aceita `audio/ogg` com
 * opus, `audio/mpeg`, `audio/mp4` e `audio/aac` — webm NÃO está na lista.
 * A Evolution costuma aceitar webm porque converte antes de mandar.
 * Converter no navegador exigiria ffmpeg.wasm (dependência nova e pesada),
 * então preferimos AVISAR o atendente a fingir que está tudo certo.
 */
export function audioPodeSerRecusadoPelaCloudApi(mime: string): boolean {
  return mime.toLowerCase().startsWith("audio/webm");
}

/** Suporte real do navegador (precisa de MediaRecorder + getUserMedia). */
function temSuporte(): boolean {
  if (typeof window === "undefined") return false;
  if (typeof MediaRecorder === "undefined") return false;
  // getUserMedia só existe em contexto seguro (https ou localhost).
  return Boolean(navigator.mediaDevices?.getUserMedia);
}

/** Nome com data/hora, ex.: audio-2026-07-26-1432.webm */
function nomeArquivo(ext: string): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `audio-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}.${ext}`;
}

function extPeloMime(mime: string): string {
  const base = mime.split(";")[0].toLowerCase();
  if (base === "audio/mp4") return "m4a";
  if (base === "audio/mpeg") return "mp3";
  if (base === "audio/ogg") return "ogg";
  if (base === "audio/wav" || base === "audio/x-wav") return "wav";
  return "webm";
}

function mmss(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Traduz a exceção do getUserMedia para uma frase que o atendente entenda.
 * "NotAllowedError" na tela não ajuda ninguém — o problema quase sempre é
 * permissão do site, e a solução está no cadeado da barra de endereço.
 */
function mensagemDeErro(e: unknown): string {
  const nome = e instanceof DOMException ? e.name : "";
  if (nome === "NotAllowedError" || nome === "PermissionDeniedError" || nome === "SecurityError") {
    return "O navegador bloqueou o microfone — libere o acesso nas permissões do site (cadeado ao lado do endereço) e tente de novo.";
  }
  if (nome === "NotFoundError" || nome === "DevicesNotFoundError") {
    return "Nenhum microfone encontrado neste computador.";
  }
  if (nome === "NotReadableError" || nome === "TrackStartError") {
    return "O microfone está ocupado por outro programa (chamada, reunião). Feche o outro app e tente de novo.";
  }
  if (nome === "OverconstrainedError") {
    return "O microfone disponível não atende à configuração pedida.";
  }
  return e instanceof Error && e.message ? e.message : "Não foi possível iniciar a gravação.";
}

type Estado = "ocioso" | "gravando" | "pausado" | "revisao";

export function AudioRecorder({
  onGravado,
  desabilitado,
  onAtivoChange,
}: {
  /** Chamado quando o atendente confirma o áudio — vira anexo pendente. */
  onGravado: (file: File) => void;
  desabilitado?: boolean;
  /**
   * Avisa o composer que existe gravação EM CURSO (gravando ou pausada),
   * para travar o envio. A etapa de revisão não conta: ali o atendente já
   * pode voltar a escrever o texto que acompanha a nota de voz.
   */
  onAtivoChange?: (gravando: boolean) => void;
}) {
  const [suportado, setSuportado] = useState(false);
  const [podePausar, setPodePausar] = useState(false);
  const [estado, setEstado] = useState<Estado>("ocioso");
  const [ms, setMs] = useState(0);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [mimeGravado, setMimeGravado] = useState<string | null>(null);

  const recRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const formatoRef = useRef<{ mime: string; ext: string } | null>(null);
  const cancelarRef = useRef(false);
  const arquivoRef = useRef<File | null>(null);

  const ctxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  // Uint8Array<ArrayBuffer> (e não ArrayBufferLike): é a assinatura exata
  // que getByteFrequencyData exige nas libs novas do TypeScript.
  const dadosRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const rafRef = useRef<number | null>(null);
  const barrasRef = useRef<Array<HTMLSpanElement | null>>([]);

  // Duração: guardamos o instante em que o trecho atual começou e o total
  // já acumulado antes da pausa — assim pausar não infla o cronômetro.
  const inicioRef = useRef(0);
  const acumuladoRef = useRef(0);

  // Detecção de suporte só no cliente: no servidor não existe MediaRecorder,
  // e ler isso durante o render quebraria a hidratação.
  useEffect(() => {
    setSuportado(temSuporte());
    setPodePausar(
      typeof MediaRecorder !== "undefined" && typeof MediaRecorder.prototype?.pause === "function",
    );
  }, []);

  const ativo = estado !== "ocioso";
  const emGravacao = estado === "gravando" || estado === "pausado";
  useEffect(() => { onAtivoChange?.(emGravacao); }, [emGravacao, onAtivoChange]);

  /**
   * Solta TUDO: tracks do microfone (senão a luz/ícone de "gravando" fica
   * aceso e o navegador segue segurando o dispositivo), o AudioContext (o
   * navegador limita quantos podem existir por aba) e o loop de animação.
   */
  const liberar = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    analyserRef.current = null;
    dadosRef.current = null;
    const ctx = ctxRef.current;
    ctxRef.current = null;
    if (ctx && ctx.state !== "closed") void ctx.close().catch(() => {});
  }, []);

  /** Loop do medidor: lê o espectro e ajusta a altura das barrinhas. */
  const loopNivel = useCallback(() => {
    const analyser = analyserRef.current;
    const dados = dadosRef.current;
    if (!analyser || !dados) return;
    analyser.getByteFrequencyData(dados);
    const passo = Math.max(1, Math.floor(dados.length / QTD_BARRAS));
    for (let i = 0; i < QTD_BARRAS; i++) {
      let soma = 0;
      for (let j = 0; j < passo; j++) soma += dados[i * passo + j] ?? 0;
      const nivel = soma / passo / 255;
      const el = barrasRef.current[i];
      // Mexemos no DOM direto (e não em estado) porque isso roda ~60x por
      // segundo — re-renderizar o composer nessa frequência seria absurdo.
      if (el) el.style.height = `${Math.max(3, Math.round(nivel * 20))}px`;
    }
    rafRef.current = requestAnimationFrame(loopNivel);
  }, []);

  const zerarBarras = useCallback(() => {
    barrasRef.current.forEach((el) => { if (el) el.style.height = "3px"; });
  }, []);

  const parar = useCallback(() => {
    const rec = recRef.current;
    if (!rec) return;
    // Alguns navegadores não disparam "stop" com o recorder pausado.
    if (rec.state === "paused") rec.resume();
    if (rec.state !== "inactive") rec.stop();
  }, []);

  // Cronômetro + corte automático no limite de 5 minutos.
  useEffect(() => {
    if (estado !== "gravando") return;
    const id = window.setInterval(() => {
      const total = acumuladoRef.current + (Date.now() - inicioRef.current);
      setMs(total);
      if (total >= LIMITE_MS) {
        setAviso("Limite de 5 minutos — a gravação parou sozinha.");
        parar();
      }
    }, 200);
    return () => window.clearInterval(id);
  }, [estado, parar]);

  // Ao desmontar (trocar de conversa, sair da tela) nada pode ficar vivo.
  useEffect(() => {
    return () => {
      const rec = recRef.current;
      cancelarRef.current = true;
      if (rec && rec.state !== "inactive") {
        try { rec.stop(); } catch { /* já parado */ }
      }
      liberar();
    };
  }, [liberar]);

  // Revoga a URL do preview quando ela troca ou o componente sai de cena.
  useEffect(() => {
    if (!previewUrl) return;
    return () => URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  const iniciar = useCallback(async () => {
    setErro(null);
    setAviso(null);
    arquivoRef.current = null;
    setPreviewUrl(null);
    setMimeGravado(null);

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true },
      });
    } catch (e) {
      setErro(mensagemDeErro(e));
      return;
    }
    streamRef.current = stream;

    const formato = escolherFormatoAudio();
    formatoRef.current = formato;

    let rec: MediaRecorder;
    try {
      rec = formato ? new MediaRecorder(stream, { mimeType: formato.mime }) : new MediaRecorder(stream);
    } catch {
      // Último recurso: deixa o navegador escolher o contêiner dele.
      try {
        rec = new MediaRecorder(stream);
        formatoRef.current = null;
      } catch {
        setErro("Este navegador não consegue gravar áudio.");
        liberar();
        return;
      }
    }
    recRef.current = rec;
    chunksRef.current = [];
    cancelarRef.current = false;

    rec.ondataavailable = (ev) => { if (ev.data.size > 0) chunksRef.current.push(ev.data); };

    rec.onerror = () => {
      setErro("A gravação falhou no meio do caminho. Tente de novo.");
      liberar();
      setEstado("ocioso");
    };

    rec.onstop = () => {
      // Guardamos o mime SEM o "; codecs=..." — é o que vai como
      // Content-Type no upload e o que `tipoDaMensagemPeloMime` lê.
      const bruto = formatoRef.current?.mime || rec.mimeType || "audio/webm";
      const mime = bruto.split(";")[0];
      const blob = new Blob(chunksRef.current, { type: mime });
      chunksRef.current = [];
      liberar();
      zerarBarras();

      if (cancelarRef.current) {
        cancelarRef.current = false;
        setEstado("ocioso");
        setMs(0);
        return;
      }
      if (blob.size === 0) {
        setErro("Não veio áudio nenhum — verifique se o microfone certo está selecionado.");
        setEstado("ocioso");
        setMs(0);
        return;
      }

      const ext = formatoRef.current?.ext ?? extPeloMime(mime);
      arquivoRef.current = new File([blob], nomeArquivo(ext), {
        type: mime,
        lastModified: Date.now(),
      });
      setMimeGravado(mime);
      setPreviewUrl(URL.createObjectURL(blob));
      setEstado("revisao");
    };

    // Medidor de nível: sem ele o atendente não tem como saber se o
    // microfone está mesmo captando (e descobre depois de 2 minutos mudos).
    const Ctor =
      window.AudioContext ??
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (Ctor) {
      try {
        const ctx = new Ctor();
        ctxRef.current = ctx;
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.7;
        // De propósito NÃO conectamos ao ctx.destination: sairia som pela
        // caixa e o atendente ouviria a própria voz com eco/microfonia.
        ctx.createMediaStreamSource(stream).connect(analyser);
        analyserRef.current = analyser;
        dadosRef.current = new Uint8Array(analyser.frequencyBinCount);
        rafRef.current = requestAnimationFrame(loopNivel);
      } catch {
        // Medidor é enfeite útil, não requisito: se falhar, grava do mesmo jeito.
      }
    }

    acumuladoRef.current = 0;
    inicioRef.current = Date.now();
    setMs(0);
    // timeslice de 1s: garante que os chunks cheguem mesmo em gravações
    // longas, em vez de um único blob gigante só no final.
    rec.start(1000);
    setEstado("gravando");
  }, [liberar, loopNivel, zerarBarras]);

  function pausar() {
    const rec = recRef.current;
    if (!rec || rec.state !== "recording") return;
    rec.pause();
    acumuladoRef.current += Date.now() - inicioRef.current;
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    zerarBarras();
    setEstado("pausado");
  }

  function retomar() {
    const rec = recRef.current;
    if (!rec || rec.state !== "paused") return;
    rec.resume();
    inicioRef.current = Date.now();
    if (rafRef.current === null && analyserRef.current) {
      rafRef.current = requestAnimationFrame(loopNivel);
    }
    setEstado("gravando");
  }

  function cancelar() {
    if (estado === "revisao") {
      arquivoRef.current = null;
      setPreviewUrl(null);
      setMimeGravado(null);
      setMs(0);
      setEstado("ocioso");
      return;
    }
    cancelarRef.current = true;
    parar();
  }

  function usar() {
    const file = arquivoRef.current;
    if (!file) return;
    onGravado(file);
    arquivoRef.current = null;
    setPreviewUrl(null);
    setMimeGravado(null);
    setMs(0);
    setEstado("ocioso");
  }

  // Navegador sem MediaRecorder (Safari antigo, contexto inseguro): some
  // com o botão em vez de mostrar algo que quebra ao clicar.
  if (!suportado) return null;

  const gravando = estado === "gravando";
  const pausado = estado === "pausado";
  const perto = ms >= LIMITE_MS - 30_000;

  return (
    <>
      <button
        type="button"
        onClick={() => void iniciar()}
        disabled={desabilitado || ativo}
        title="Gravar áudio (nota de voz)"
        aria-label="Gravar áudio"
        className={`p-1.5 rounded-md hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent ${
          ativo ? "text-red-600" : "text-muted-foreground hover:text-foreground"
        }`}
      >
        <Mic size={16} />
      </button>

      {(ativo || erro || aviso) && (
        // basis-full faz este painel cair numa linha própria, ocupando toda a
        // largura do composer (a fileira de ferramentas usa flex-wrap).
        <div className="basis-full w-full mt-2">
          {erro && (
            <div className="rounded-md border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] text-red-700 dark:text-red-300 flex items-start gap-2">
              <span className="flex-1">{erro}</span>
              <button
                type="button"
                onClick={() => setErro(null)}
                className="underline shrink-0"
              >
                ok
              </button>
            </div>
          )}

          {(gravando || pausado) && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-3">
              <span
                className={`h-2.5 w-2.5 rounded-full shrink-0 ${
                  gravando ? "bg-red-600 animate-pulse" : "bg-amber-500"
                }`}
                aria-hidden
              />
              <span className={`text-xs font-medium tabular-nums ${perto ? "text-red-600" : ""}`}>
                {mmss(ms)}
              </span>
              <span className="text-[11px] text-muted-foreground shrink-0">
                {gravando ? "Gravando…" : "Pausado"}
              </span>

              {/* Medidor de nível: prova visual de que o microfone capta. */}
              <span className="flex items-end gap-[3px] h-5 flex-1" aria-hidden>
                {Array.from({ length: QTD_BARRAS }).map((_, i) => (
                  <span
                    key={i}
                    ref={(el) => { barrasRef.current[i] = el; }}
                    className="w-1 rounded-sm bg-arini/70 dark:bg-gold/70 transition-[height] duration-75"
                    style={{ height: 3 }}
                  />
                ))}
              </span>

              <div className="flex items-center gap-1 shrink-0">
                {podePausar && (
                  <button
                    type="button"
                    onClick={() => (gravando ? pausar() : retomar())}
                    title={gravando ? "Pausar" : "Retomar"}
                    aria-label={gravando ? "Pausar gravação" : "Retomar gravação"}
                    className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {gravando ? <Pause size={15} /> : <Play size={15} />}
                  </button>
                )}
                <button
                  type="button"
                  onClick={parar}
                  title="Parar e anexar"
                  aria-label="Parar gravação"
                  className="p-1.5 rounded-md text-arini dark:text-gold hover:bg-muted"
                >
                  <Square size={15} />
                </button>
                <button
                  type="button"
                  onClick={cancelar}
                  title="Descartar gravação"
                  aria-label="Cancelar gravação"
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            </div>
          )}

          {estado === "revisao" && previewUrl && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 flex items-center gap-2 flex-wrap">
              <audio controls src={previewUrl} className="h-9 max-w-full flex-1 min-w-[180px]">
                Seu navegador não toca áudio.
              </audio>
              <span className="text-[10px] text-muted-foreground tabular-nums">{mmss(ms)}</span>
              <div className="flex items-center gap-1 ml-auto">
                <button
                  type="button"
                  onClick={usar}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md bg-acao text-acao-foreground hover:opacity-90"
                >
                  <Check size={13} /> Usar
                </button>
                <button
                  type="button"
                  onClick={() => void iniciar()}
                  className="inline-flex items-center gap-1 text-xs px-2.5 py-1.5 rounded-md border hover:bg-muted"
                >
                  <RotateCcw size={13} /> Regravar
                </button>
                <button
                  type="button"
                  onClick={cancelar}
                  title="Descartar"
                  aria-label="Descartar gravação"
                  className="p-1.5 rounded-md text-muted-foreground hover:bg-muted hover:text-red-600"
                >
                  <Trash2 size={15} />
                </button>
              </div>
              {mimeGravado && (
                <span className="basis-full text-[10px] text-muted-foreground">
                  Formato gravado: {mimeGravado}
                </span>
              )}
            </div>
          )}

          {aviso && (
            <div className="mt-1 rounded-md border border-amber-500/25 bg-amber-500/10 px-3 py-1.5 text-[11px] text-amber-800 dark:text-amber-300">
              {aviso}
            </div>
          )}
        </div>
      )}
    </>
  );
}
