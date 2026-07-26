"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { PageShell, PageHeader, Card, Switch, Alerta } from "@/components/atendimento/ui";
import { Bot, Sparkles, Route, BookOpen, KeyRound, Inbox, FileText } from "lucide-react";

// =====================================================================
// Agentes IA — tela da PRÓXIMA onda. Nada aqui liga a IA de verdade:
// os interruptores estão desabilitados de propósito. O que é real nesta
// página são os números da base de conhecimento (consulta no servidor).
// =====================================================================

const RECURSOS = [
  {
    id: "copiloto",
    icone: Sparkles,
    titulo: "Copiloto do atendente",
    resumo: "Sugere a resposta enquanto o agente digita.",
    detalhes: [
      "Lê o histórico da conversa e propõe uma resposta pronta para editar.",
      "Reescreve o rascunho do agente (mais formal, mais curto, corrigir português).",
      "Resume conversas longas quando alguém assume o atendimento no meio.",
    ],
  },
  {
    id: "triagem",
    icone: Route,
    titulo: "Triagem automática",
    resumo: "Classifica a intenção e roteia para a equipe certa.",
    detalhes: [
      "Detecta o assunto (comprar, alugar, vender, suporte) na primeira mensagem.",
      "Aplica etiquetas e prioridade sem o agente precisar ler tudo.",
      "Encaminha para a equipe ou caixa responsável pelo assunto.",
    ],
  },
  {
    id: "auto_resposta",
    icone: BookOpen,
    titulo: "Auto-resposta com base de conhecimento",
    resumo: "Responde dúvidas comuns usando os artigos da Central de Ajuda.",
    detalhes: [
      "Busca no conteúdo publicado dos portais antes de responder.",
      "Cita o artigo usado, para o cliente conseguir ler o passo a passo completo.",
      "Passa a conversa para um humano quando não encontra resposta confiável.",
    ],
  },
];

export function AgentesIA({
  artigosPublicados, artigosTotal, caixasAtivas,
}: {
  artigosPublicados: number;
  artigosTotal: number;
  caixasAtivas: number;
}) {
  return (
    <PageShell>
      <PageHeader
        titulo="Agentes IA"
        descricao="Assistência com IA no atendimento. Ainda não está ativo — veja abaixo o que falta."
      />

      <Alerta tipo="info">
        <p className="font-medium mb-1">O que falta para ligar</p>
        <ul className="list-disc pl-4 space-y-0.5">
          <li>
            <strong>Chave da API da Anthropic</strong> no ambiente, na variável{" "}
            <code>ANTHROPIC_API_KEY</code> (servidor apenas — nunca com prefixo{" "}
            <code>NEXT_PUBLIC_</code>, senão ela vaza para o navegador).
          </li>
          <li>
            <strong>Escolha do modelo</strong> e do orçamento por conversa — modelo rápido e barato
            para triagem, modelo maior para o copiloto redigir.
          </li>
          <li>
            <strong>Definir quais caixas usam IA</strong>: hoje existem {caixasAtivas} caixa(s)
            ativa(s); a IA deve ser ligada caixa a caixa, não no sistema inteiro.
          </li>
        </ul>
      </Alerta>

      <div className="grid gap-3 md:grid-cols-3 items-start">
        {RECURSOS.map((r) => {
          const Icone = r.icone;
          return (
            <Card key={r.id} className="p-4 space-y-3">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 h-8 w-8 shrink-0 rounded-lg bg-arini/10 dark:bg-gold/15 flex items-center justify-center">
                  <Icone size={16} className="text-arini dark:text-gold" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="text-sm font-semibold">{r.titulo}</h3>
                    <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-300">
                      Em breve
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{r.resumo}</p>
                </div>
              </div>

              <ul className="space-y-1.5 text-xs text-muted-foreground">
                {r.detalhes.map((d) => (
                  <li key={d} className="flex gap-2">
                    <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-muted-foreground/50" />
                    <span>{d}</span>
                  </li>
                ))}
              </ul>

              <div className="pt-1 border-t">
                <div className="pt-3">
                  {/* Desabilitado: não existe backend de IA para ligar ainda. */}
                  <Switch
                    checked={false}
                    onChange={() => {}}
                    disabled
                    label="Ativar recurso"
                    dica="Indisponível até a chave da API ser configurada."
                  />
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Base de conhecimento — dados reais da Central de Ajuda. */}
      <Card
        titulo="Base de conhecimento"
        descricao="É o conteúdo da Central de Ajuda que a auto-resposta vai consultar."
        acoes={
          <Link href="/atendimento/ajuda">
            <Button size="sm" variant="outline">
              <BookOpen size={14} /> Abrir Central de Ajuda
            </Button>
          </Link>
        }
      >
        <div className="p-4 grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText size={13} /> Artigos publicados
            </p>
            <p className="text-2xl font-display text-arini dark:text-gold mt-1">{artigosPublicados}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <FileText size={13} /> Artigos no total
            </p>
            <p className="text-2xl font-display mt-1">{artigosTotal}</p>
          </div>
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Inbox size={13} /> Caixas ativas
            </p>
            <p className="text-2xl font-display mt-1">{caixasAtivas}</p>
          </div>
        </div>

        {artigosPublicados === 0 && (
          <div className="px-4 pb-4">
            <Alerta tipo="atencao">
              Nenhum artigo publicado ainda. Sem base de conhecimento, a auto-resposta não teria o que
              consultar — comece publicando as dúvidas que mais chegam no WhatsApp.
            </Alerta>
          </div>
        )}
      </Card>

      <div className="flex items-start gap-3 rounded-xl border border-dashed p-4">
        <Bot size={18} className="mt-0.5 shrink-0 text-muted-foreground" />
        <p className="text-xs text-muted-foreground">
          Enquanto a IA não entra, o que já reduz trabalho manual são as{" "}
          <Link href="/atendimento/macros" className="text-arini dark:text-gold underline underline-offset-2">
            macros
          </Link>{" "}
          e as{" "}
          <Link href="/atendimento/respostas" className="text-arini dark:text-gold underline underline-offset-2">
            respostas prontas
          </Link>
          . A triagem automática vai nascer em cima das mesmas ações.
        </p>
      </div>

      <p className="text-[11px] text-muted-foreground flex items-center gap-1.5">
        <KeyRound size={12} /> Nenhum dado de conversa é enviado a serviços de IA hoje — nada está
        conectado.
      </p>
    </PageShell>
  );
}
