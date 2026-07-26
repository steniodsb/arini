"use client";

import { useCallback, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Alerta, Card, Spinner } from "@/components/atendimento/ui";
import { Sparkles, FileText, Route, Copy, Check, RefreshCw, CornerDownLeft } from "lucide-react";

// =====================================================================
// Copiloto de IA dentro da conversa.
//
// Componente ISOLADO de propósito: recebe só o id da conversa e um
// callback. Quem monta o inbox decide onde encaixar e o que fazer com o
// texto — assim dá para ligar/desligar o copiloto sem tocar no inbox.
//
// Regra de ouro da UI: em nenhum momento o texto é apresentado como
// "resposta pronta para enviar". É SUGESTÃO e precisa de revisão humana.
// =====================================================================

type Acao = "sugerir" | "resumir" | "classificar";

const ACOES: { id: Acao; label: string; icone: typeof Sparkles; titulo: string }[] = [
  { id: "sugerir", label: "Sugerir resposta", icone: Sparkles, titulo: "Sugestão de resposta" },
  { id: "resumir", label: "Resumir conversa", icone: FileText, titulo: "Resumo da conversa" },
  { id: "classificar", label: "Detectar intenção", icone: Route, titulo: "Intenção detectada" },
];

/** Rótulos amigáveis das intenções — o banco guarda a palavra crua. */
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

type Resultado = {
  acao: Acao;
  conteudo: string;
  cacheada: boolean;
  modelo: string | null;
};

export function CopilotPanel({
  conversationId,
  onUsarSugestao,
}: {
  conversationId: string;
  onUsarSugestao: (texto: string) => void;
}) {
  const [carregando, setCarregando] = useState<Acao | null>(null);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  // 503 = falta configuração no servidor. É um aviso, não um erro do agente.
  const [faltaChave, setFaltaChave] = useState(false);
  const [copiado, setCopiado] = useState(false);
  const [usada, setUsada] = useState(false);

  const executar = useCallback(
    async (acao: Acao, forcar = false) => {
      setCarregando(acao);
      setErro(null);
      setFaltaChave(false);
      setCopiado(false);
      setUsada(false);
      try {
        const resp = await fetch("/api/atendimento/ia", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ conversationId, acao, forcar }),
        });
        const json = (await resp.json().catch(() => null)) as
          | { ok?: boolean; conteudo?: string; cacheada?: boolean; modelo?: string; erro?: string }
          | null;

        if (resp.status === 503) {
          setFaltaChave(true);
          setErro(json?.erro ?? "Recursos de IA não configurados no servidor.");
          setResultado(null);
          return;
        }
        if (!resp.ok || !json?.ok || !json.conteudo) {
          setErro(json?.erro ?? `Falha na requisição (HTTP ${resp.status}).`);
          setResultado(null);
          return;
        }

        setResultado({
          acao,
          conteudo: json.conteudo,
          cacheada: Boolean(json.cacheada),
          modelo: json.modelo ?? null,
        });
      } catch (e) {
        setErro(e instanceof Error ? e.message : "Não foi possível falar com o servidor.");
        setResultado(null);
      } finally {
        setCarregando(null);
      }
    },
    [conversationId],
  );

  /** Marca a sugestão como usada — é assim que medimos se a IA ajuda. */
  const marcarUsada = useCallback(async () => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("atendimento_ia_sugestoes")
      .select("id")
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(1);
    const id = data?.[0]?.id as string | undefined;
    if (id) await supabase.from("atendimento_ia_sugestoes").update({ usada: true }).eq("id", id);
  }, [conversationId]);

  async function usar() {
    if (!resultado) return;
    onUsarSugestao(resultado.conteudo);
    setUsada(true);
    await marcarUsada();
  }

  async function copiar() {
    if (!resultado) return;
    try {
      await navigator.clipboard.writeText(resultado.conteudo);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 1800);
    } catch {
      setErro("O navegador bloqueou a cópia. Selecione o texto e copie manualmente.");
    }
  }

  const meta = resultado ? ACOES.find((a) => a.id === resultado.acao) : null;
  const textoExibido =
    resultado && resultado.acao === "classificar"
      ? (INTENCAO_LABELS[resultado.conteudo] ?? resultado.conteudo)
      : (resultado?.conteudo ?? "");

  return (
    <Card
      titulo="Copiloto de IA"
      descricao="Gera um rascunho a partir da conversa. Sempre revise antes de enviar."
    >
      <div className="p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {ACOES.map((a) => {
            const Icone = a.icone;
            const rodando = carregando === a.id;
            return (
              <Button
                key={a.id}
                size="sm"
                variant="outline"
                disabled={carregando !== null}
                onClick={() => executar(a.id)}
              >
                {rodando ? <Spinner size={14} /> : <Icone size={14} />}
                {a.label}
              </Button>
            );
          })}
        </div>

        {faltaChave && (
          <Alerta tipo="atencao">
            <p className="font-medium mb-1">IA não configurada neste servidor</p>
            <p>
              Falta a variável de ambiente <code>ANTHROPIC_API_KEY</code> com a chave da API da
              Anthropic. Ela é secreta: use <strong>sem</strong> o prefixo <code>NEXT_PUBLIC_</code> e
              reinicie a aplicação. Enquanto isso, o copiloto fica indisponível.
            </p>
          </Alerta>
        )}

        {erro && !faltaChave && <Alerta tipo="erro">{erro}</Alerta>}

        {carregando && !resultado && (
          <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
            <Spinner size={14} /> Consultando a IA…
          </div>
        )}

        {resultado && (
          <div className="rounded-lg border bg-muted/30 p-3 space-y-3">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-semibold">{meta?.titulo}</span>
              <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                Sugestão — revise antes de enviar
              </span>
              {resultado.cacheada && (
                <span className="text-[10px] text-muted-foreground">
                  reaproveitada do cache (nada foi gasto)
                </span>
              )}
            </div>

            <p className="text-sm whitespace-pre-wrap leading-relaxed">{textoExibido}</p>

            <div className="flex flex-wrap items-center gap-2 pt-1 border-t">
              <div className="pt-2 flex flex-wrap items-center gap-2">
                {resultado.acao === "sugerir" && (
                  <Button size="sm" onClick={usar} disabled={usada}>
                    {usada ? <Check size={14} /> : <CornerDownLeft size={14} />}
                    {usada ? "Enviada para o campo" : "Usar"}
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={copiar}>
                  {copiado ? <Check size={14} /> : <Copy size={14} />}
                  {copiado ? "Copiado" : "Copiar"}
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={carregando !== null}
                  onClick={() => executar(resultado.acao, true)}
                >
                  <RefreshCw size={14} /> Gerar outra
                </Button>
                {resultado.modelo && (
                  <span className="text-[10px] text-muted-foreground">{resultado.modelo}</span>
                )}
              </div>
            </div>
          </div>
        )}

        <p className="text-[11px] text-muted-foreground">
          O texto acima é gerado por IA a partir do histórico da conversa, das respostas rápidas e dos
          artigos publicados. Ela pode errar — confira preço, endereço e disponibilidade antes de
          enviar ao cliente.
        </p>
      </div>
    </Card>
  );
}
