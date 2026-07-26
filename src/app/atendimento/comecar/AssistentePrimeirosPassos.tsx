"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Alerta, Card, PageHeader, PageShell, Spinner } from "@/components/atendimento/ui";
import { errMessage, formatDateTimeBR } from "@/lib/utils";
import type { OnboardingPassoId } from "@/lib/types";
import {
  PASSOS,
  PASSOS_COM_DEPENDENCIA_EXTERNA,
  passoFeito,
  type EstadoOnboarding,
  type PassoEstado,
} from "./tipos";
import {
  ArrowRight,
  BadgeCheck,
  CheckCircle2,
  Circle,
  Inbox,
  KeyRound,
  PartyPopper,
} from "lucide-react";

// =====================================================================
// Assistente de primeiros passos — CHECKLIST, não wizard.
//
// A escolha é deliberada: um wizard modal obriga a percorrer tudo na
// ordem e prende quem só queria conferir uma coisa. O checklist deixa
// pular, voltar e sair, que é como as pessoas realmente configuram um
// sistema — em pedaços, entre um atendimento e outro.
// =====================================================================

export function AssistentePrimeirosPassos({ inicial }: { inicial: EstadoOnboarding }) {
  const [passos, setPassos] = useState<PassoEstado[]>(inicial.passos);
  const [concluido, setConcluido] = useState(inicial.concluido);
  const [dispensadoEm, setDispensadoEm] = useState<string | null>(inicial.dispensadoEm);
  /** Guarda qual passo está salvando (ou "geral" para dispensar/retomar). */
  const [salvando, setSalvando] = useState<OnboardingPassoId | "geral" | null>(null);
  const [erro, setErro] = useState<string | null>(null);

  const total = passos.length;
  const feitos = passos.filter(passoFeito).length;
  const tudoFeito = total > 0 && feitos === total;
  const percentual = total === 0 ? 0 : Math.round((feitos / total) * 100);

  /**
   * `atendimento_settings` é linha única (id = true) e a RLS libera escrita
   * para quem tem atendimento, então o próprio browser grava — não precisa
   * de rota de API como acontece em `leads`.
   */
  const gravar = useCallback(async (campos: Record<string, unknown>) => {
    const supabase = createSupabaseBrowser();
    const { error } = await supabase
      .from("atendimento_settings")
      .update({ ...campos, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw error;
  }, []);

  const jaGravouConclusao = useRef(false);
  useEffect(() => {
    // Fechou os seis passos → registra a conclusão uma única vez. É isso que
    // faz a faixa de aviso sumir das outras telas sem ninguém precisar clicar.
    if (!tudoFeito || concluido || jaGravouConclusao.current) return;
    jaGravouConclusao.current = true;
    void gravar({ onboarding_concluido: true })
      .then(() => setConcluido(true))
      // Falhou? Libera para tentar de novo no próximo render, sem barulho:
      // não é erro que valha interromper quem acabou de terminar a configuração.
      .catch(() => {
        jaGravouConclusao.current = false;
      });
  }, [tudoFeito, concluido, gravar]);

  /** Marcação manual — fallback para o que a verificação não consegue provar. */
  async function alternarManual(id: OnboardingPassoId, valor: boolean) {
    setSalvando(id);
    setErro(null);
    // O jsonb guarda só as chaves marcadas ({ "<id>": true }), como na 0037.
    const mapa: Record<string, boolean> = {};
    for (const p of passos) {
      const marcado = p.id === id ? valor : p.marcado;
      if (marcado) mapa[p.id] = true;
    }
    try {
      await gravar({ onboarding_passos: mapa });
      setPassos((ps) => ps.map((p) => (p.id === id ? { ...p, marcado: valor } : p)));
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setSalvando(null);
    }
  }

  async function dispensar() {
    setSalvando("geral");
    setErro(null);
    const agora = new Date().toISOString();
    try {
      await gravar({ onboarding_dispensado_em: agora, onboarding_concluido: true });
      setDispensadoEm(agora);
      setConcluido(true);
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setSalvando(null);
    }
  }

  async function retomar() {
    setSalvando("geral");
    setErro(null);
    try {
      await gravar({ onboarding_dispensado_em: null, onboarding_concluido: false });
      setDispensadoEm(null);
      setConcluido(false);
      jaGravouConclusao.current = false;
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setSalvando(null);
    }
  }

  const estadoPorId = new Map(passos.map((p) => [p.id, p]));

  return (
    <PageShell>
      <PageHeader
        titulo="Primeiros passos"
        descricao="Seis ajustes que fazem o atendimento sair do papel. Dá para fazer fora de ordem e voltar depois."
        acoes={
          dispensadoEm ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={salvando === "geral"}
              onClick={() => void retomar()}
            >
              {salvando === "geral" ? <Spinner size={14} /> : null} Voltar a acompanhar
            </Button>
          ) : (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={salvando === "geral"}
              title="Some com o assistente e com o aviso das outras telas."
              onClick={() => void dispensar()}
            >
              {salvando === "geral" ? <Spinner size={14} /> : null} Dispensar
            </Button>
          )
        }
      />

      {erro && <Alerta tipo="erro">{erro}</Alerta>}

      {dispensadoEm && (
        <Alerta tipo="info">
          Assistente dispensado em {formatDateTimeBR(dispensadoEm)}. A faixa de aviso não aparece
          mais nas outras telas — esta página continua acessível por este endereço.
        </Alerta>
      )}

      {/* O que NÃO depende só de clicar aqui dentro. Deixar isso escondido é o
          que faz a pessoa travar no passo do canal achando que fez algo errado. */}
      {PASSOS_COM_DEPENDENCIA_EXTERNA.length > 0 && (
        <Alerta tipo="atencao">
          <p className="font-medium flex items-center gap-1.5">
            <KeyRound size={13} /> Alguns passos dependem de coisas fora daqui
          </p>
          <ul className="mt-1 space-y-1 list-disc pl-4">
            {PASSOS_COM_DEPENDENCIA_EXTERNA.map((p) => (
              <li key={p.id}>
                <span className="font-medium">{p.titulo}:</span> {p.dependeDeExterno}
              </li>
            ))}
          </ul>
        </Alerta>
      )}

      {/* Progresso */}
      <Card className="p-4 space-y-2">
        <div className="flex items-center justify-between gap-3 text-sm">
          <span className="font-medium">
            {feitos} de {total} concluídos
          </span>
          <span className="text-muted-foreground text-xs">{percentual}%</span>
        </div>
        <div
          className="h-2 w-full rounded-full bg-muted overflow-hidden"
          role="progressbar"
          aria-valuenow={percentual}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Progresso da configuração"
        >
          <div
            className="h-full rounded-full bg-arini dark:bg-gold transition-all"
            style={{ width: `${percentual}%` }}
          />
        </div>
      </Card>

      {tudoFeito && (
        <Card className="p-5 text-center space-y-2 border-emerald-500/30 bg-emerald-500/5">
          <PartyPopper size={26} className="mx-auto text-emerald-600 dark:text-emerald-400" />
          <p className="text-sm font-medium">Configuração concluída.</p>
          <p className="text-xs text-muted-foreground max-w-md mx-auto">
            Canal conectado, equipe com acesso e horário definido: já dá para atender de verdade. O
            resto se ajusta com o uso.
          </p>
          <Button asChild variant="gold" size="sm" className="mt-1">
            <Link href="/atendimento/inbox">
              <Inbox size={15} /> Ir para a caixa de entrada
            </Link>
          </Button>
        </Card>
      )}

      <div className="space-y-2.5">
        {PASSOS.map((meta) => {
          const est = estadoPorId.get(meta.id);
          if (!est) return null;
          const feito = passoFeito(est);
          return (
            <Card key={meta.id} className="p-4">
              <div className="flex items-start gap-3">
                <div className="pt-0.5 shrink-0">
                  {feito ? (
                    <CheckCircle2 size={18} className="text-emerald-600 dark:text-emerald-400" />
                  ) : (
                    <Circle size={18} className="text-muted-foreground/50" />
                  )}
                </div>

                <div className="min-w-0 flex-1 space-y-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className={`text-sm font-semibold ${feito ? "text-muted-foreground" : ""}`}>
                      {meta.titulo}
                    </h3>
                    {est.detectado && (
                      // A verificação automática venceu — dizemos isso na cara
                      // dura para ninguém procurar um checkbox que sumiu.
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-medium text-emerald-700 dark:text-emerald-300">
                        <BadgeCheck size={11} /> Verificado automaticamente
                      </span>
                    )}
                  </div>

                  <p className="text-xs text-muted-foreground">{meta.porque}</p>
                  <p className="text-[11px] text-muted-foreground/80">
                    {meta.comoDetectamos} {est.detalhe}
                  </p>

                  <div className="flex items-center gap-3 flex-wrap pt-1.5">
                    <Button asChild variant={feito ? "outline" : "gold"} size="sm">
                      <Link href={meta.href}>
                        {meta.rotuloAcao} <ArrowRight size={14} />
                      </Link>
                    </Button>

                    {est.detectado ? (
                      <span className="text-[11px] text-muted-foreground">
                        Conferido no banco — não precisa marcar nada.
                      </span>
                    ) : (
                      <label className="inline-flex items-center gap-2 text-xs cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={est.marcado}
                          disabled={salvando === meta.id}
                          onChange={(e) => void alternarManual(meta.id, e.target.checked)}
                          className="h-3.5 w-3.5"
                        />
                        <span className="text-muted-foreground">
                          {salvando === meta.id ? "Salvando…" : "Marcar como feito"}
                        </span>
                      </label>
                    )}
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </PageShell>
  );
}
