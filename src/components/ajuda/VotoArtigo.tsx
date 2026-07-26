"use client";

// =====================================================================
// Bloco "Este artigo ajudou?".
//
// Regra de fluxo: o voto NEGATIVO é gravado assim que a pessoa clica em 👎
// — e só depois abrimos o campo de comentário. Se esperássemos o comentário
// para gravar, perderíamos justamente o sinal mais valioso (quem clica em
// 👎 e vai embora sem escrever nada é a maioria).
//
// O comentário vai num segundo POST com o mesmo token: a rota reconhece a
// duplicata, não cria outro voto e apenas anexa o texto ao que já existe.
// =====================================================================

import { useEffect, useState } from "react";
import { ThumbsDown, ThumbsUp } from "lucide-react";
import { corDeTextoSobre } from "./cores";
import { jaVotou, marcarComoVotado, obterVisitanteToken } from "./visitante";

type Etapa = "carregando" | "perguntando" | "comentando" | "agradecendo";

export function VotoArtigo({
  portalSlug,
  articleId,
  corDestaque,
}: {
  portalSlug: string;
  articleId: string;
  corDestaque: string;
}) {
  const [etapa, setEtapa] = useState<Etapa>("carregando");
  const [comentario, setComentario] = useState("");
  const [enviando, setEnviando] = useState(false);

  // Só no cliente sabemos se já houve voto — por isso a etapa inicial é
  // "carregando": renderizar os botões e escondê-los depois causaria pisca.
  useEffect(() => {
    setEtapa(jaVotou(articleId) ? "agradecendo" : "perguntando");
  }, [articleId]);

  async function enviar(util: boolean, texto?: string) {
    setEnviando(true);
    try {
      await fetch(`/api/ajuda/${encodeURIComponent(portalSlug)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "voto",
          articleId,
          util,
          comentario: texto?.trim() || undefined,
          visitanteToken: obterVisitanteToken(),
        }),
      });
    } catch {
      // Rede caiu: não travamos a pessoa numa tela de erro por um voto.
    } finally {
      setEnviando(false);
    }
  }

  async function votarSim() {
    marcarComoVotado(articleId);
    setEtapa("agradecendo");
    await enviar(true);
  }

  async function votarNao() {
    marcarComoVotado(articleId);
    setEtapa("comentando");
    await enviar(false);
  }

  async function enviarComentario() {
    const texto = comentario.trim();
    setEtapa("agradecendo");
    if (texto) await enviar(false, texto);
  }

  if (etapa === "carregando") {
    // Reserva a altura do bloco para o conteúdo abaixo não pular.
    return <div className="mt-12 h-32 rounded-xl border border-border bg-muted/30" aria-hidden />;
  }

  return (
    <section
      aria-labelledby="titulo-feedback"
      className="mt-12 rounded-xl border border-border bg-muted/30 p-5 sm:p-6"
    >
      {etapa === "agradecendo" ? (
        <div className="space-y-1">
          <h2 id="titulo-feedback" className="text-base font-semibold text-foreground">
            Obrigado pelo retorno!
          </h2>
          <p className="text-sm text-muted-foreground">
            Sua resposta ajuda a melhorar esta Central de Ajuda.
          </p>
        </div>
      ) : etapa === "comentando" ? (
        <div className="space-y-3">
          <h2 id="titulo-feedback" className="text-base font-semibold text-foreground">
            O que faltou neste artigo?
          </h2>
          <p className="text-sm text-muted-foreground">
            Seu voto já foi registrado. Se quiser, conte o que você procurava —
            é opcional.
          </p>
          <label htmlFor="comentario-artigo" className="sr-only">
            Comentário sobre o artigo
          </label>
          <textarea
            id="comentario-artigo"
            value={comentario}
            onChange={(e) => setComentario(e.target.value)}
            rows={3}
            maxLength={1000}
            placeholder="Ex.: não encontrei como cancelar o pedido…"
            className="w-full rounded-lg border border-border bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={enviarComentario}
              disabled={enviando}
              className="rounded-full px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 disabled:opacity-60"
              // Cor de marca vem do banco e muda por portal — o Tailwind não
              // consegue gerar classe para valor decidido em runtime.
              style={{
                backgroundColor: corDestaque,
                color: corDeTextoSobre(corDestaque),
              }}
            >
              Enviar comentário
            </button>
            <button
              type="button"
              onClick={() => setEtapa("agradecendo")}
              className="rounded-full border border-border px-4 py-2 text-sm text-muted-foreground hover:bg-muted"
            >
              Agora não
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h2 id="titulo-feedback" className="text-base font-semibold text-foreground">
            Este artigo ajudou?
          </h2>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={votarSim}
              disabled={enviando}
              aria-label="Sim, este artigo ajudou"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              <ThumbsUp size={16} aria-hidden /> Sim
            </button>
            <button
              type="button"
              onClick={votarNao}
              disabled={enviando}
              aria-label="Não, este artigo não ajudou"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-muted disabled:opacity-60"
            >
              <ThumbsDown size={16} aria-hidden /> Não
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
