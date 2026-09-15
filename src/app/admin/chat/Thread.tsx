"use client";

import Link from "next/link";
import { Fragment, type RefObject } from "react";
import { fmtBR, fmtHoraBR } from "@/lib/fuso";
import {
  SECTOR_LABELS,
  type ChatMensagem,
  type ChatPessoa,
  type SectorObservation,
} from "@/lib/types";
import { Building2, CornerUpLeft, Trash2, Paperclip, ArrowRight } from "lucide-react";

/** "Hoje" / "Ontem" / "12 de setembro de 2026" — o divisor de dia. */
function diaDaMensagem(iso: string): string {
  const d = new Date(iso);
  const hoje = new Date();
  const ontem = new Date();
  ontem.setDate(hoje.getDate() - 1);
  const igual = (a: Date, b: Date) =>
    a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
  if (igual(d, hoje)) return "Hoje";
  if (igual(d, ontem)) return "Ontem";
  return fmtBR(d, { day: "2-digit", month: "long", year: "numeric" });
}

function Anexo({ m }: { m: ChatMensagem }) {
  if (!m.media_url) return null;
  const ehImagem = (m.media_mime ?? "").startsWith("image/");
  const ehAudio = (m.media_mime ?? "").startsWith("audio/");

  if (ehImagem) {
    return (
      <a href={m.media_url} target="_blank" rel="noreferrer" className="block mt-1">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={m.media_url}
          alt={m.media_nome ?? "anexo"}
          className="rounded-md max-h-64 w-auto"
        />
      </a>
    );
  }
  if (ehAudio) {
    // eslint-disable-next-line jsx-a11y/media-has-caption
    return <audio controls src={m.media_url} className="mt-1 max-w-[260px]" />;
  }
  return (
    <a
      href={m.media_url}
      target="_blank"
      rel="noreferrer"
      className="mt-1 flex items-center gap-1.5 rounded-md border px-2 py-1.5 text-xs hover:bg-muted"
    >
      <Paperclip size={12} className="shrink-0" />
      <span className="truncate">{m.media_nome ?? "Anexo"}</span>
    </a>
  );
}

export function Thread({
  mensagens, carregando, meuId, porPessoa, delegacoes, imoveis,
  onResponder, onApagar, fimRef,
}: {
  mensagens: ChatMensagem[];
  carregando: boolean;
  meuId: string;
  porPessoa: Map<string, ChatPessoa>;
  delegacoes: SectorObservation[];
  imoveis: Record<string, { codigo: string; titulo: string | null }>;
  onResponder: (m: ChatMensagem) => void;
  onApagar: (id: string) => void;
  fimRef: RefObject<HTMLDivElement>;
}) {
  if (carregando) {
    return (
      <div className="flex-1 grid place-items-center">
        <p className="text-xs text-muted-foreground">Carregando…</p>
      </div>
    );
  }

  const porId = new Map(mensagens.map((m) => [m.id, m]));
  let diaAnterior = "";

  return (
    <div className="flex-1 overflow-y-auto px-3 py-3 space-y-1">
      {/* As delegações de imóvel ficam no TOPO da conversa do setor. Elas
          não são mensagem — são tarefa presa a um imóvel, com estado de
          resolvida — mas precisam ser vistas no mesmo lugar, senão o time
          volta a olhar duas telas. */}
      {delegacoes.length > 0 && (
        <div className="mb-3 rounded-lg border border-gold/40 bg-gold/5 p-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-wide text-gold-dark mb-1.5">
            Delegações para este setor ({delegacoes.filter((o) => !o.resolvido).length} em aberto)
          </p>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {delegacoes.slice(0, 20).map((o) => {
              const ref =
                (o.entity_table === "properties" || o.entity_table === "marketing_campaigns")
                  ? imoveis[o.entity_id]
                  : null;
              const href =
                o.entity_table === "marketing_campaigns"
                  ? `/admin/marketing/${o.entity_id}`
                  : `/admin/captacao/${o.entity_id}`;
              return (
                <div
                  key={o.id}
                  className={`rounded-md border bg-card p-2 text-xs ${o.resolvido ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center gap-1.5 mb-0.5 text-[10px] text-muted-foreground">
                    {o.autor_sector && <span>{SECTOR_LABELS[o.autor_sector]}</span>}
                    <span>·</span>
                    <span>{fmtBR(o.created_at, { day: "2-digit", month: "2-digit" })}</span>
                    {o.resolvido && <span className="text-emerald-600">· resolvida</span>}
                  </div>
                  <p className="whitespace-pre-line">{o.texto}</p>
                  {ref && (
                    <Link
                      href={href}
                      className="mt-1 inline-flex items-center gap-1 text-[11px] text-arini dark:text-gold hover:underline"
                    >
                      <Building2 size={11} /> {ref.codigo}
                      {ref.titulo ? ` — ${ref.titulo}` : ""}
                      <ArrowRight size={10} />
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {mensagens.length === 0 && delegacoes.length === 0 && (
        <p className="text-center text-xs text-muted-foreground py-8">
          Nenhuma mensagem ainda. Escreva a primeira.
        </p>
      )}

      {mensagens.map((m) => {
        const dia = diaDaMensagem(m.created_at);
        const novoDia = dia !== diaAnterior;
        diaAnterior = dia;
        const minha = m.autor_id === meuId;
        const autor = m.autor_id ? porPessoa.get(m.autor_id) : null;
        const citada = m.responde_a ? porId.get(m.responde_a) : null;

        return (
          <Fragment key={m.id}>
            {novoDia && (
              <div className="flex justify-center py-2">
                <span className="text-[10px] rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  {dia}
                </span>
              </div>
            )}

            <div className={`flex ${minha ? "justify-end" : "justify-start"} group`}>
              <div className={`max-w-[75%] min-w-0 ${minha ? "items-end" : "items-start"}`}>
                {/* O nome só aparece em mensagem dos outros: numa conversa
                    de setor é essencial saber quem falou, e na minha
                    própria bolha seria ruído. */}
                {!minha && (
                  <p className="text-[10px] text-muted-foreground mb-0.5 ml-1">
                    {autor?.nome ?? "Alguém"}
                  </p>
                )}

                <div
                  className={`rounded-lg px-2.5 py-1.5 text-sm ${
                    minha
                      ? "bg-arini text-white dark:bg-gold dark:text-arini"
                      : "bg-muted text-foreground"
                  }`}
                >
                  {citada && (
                    <div
                      className={`mb-1 rounded border-l-2 pl-1.5 text-[11px] opacity-80 ${
                        minha ? "border-white/50" : "border-arini/40"
                      }`}
                    >
                      <span className="block font-medium">
                        {citada.autor_id ? porPessoa.get(citada.autor_id)?.nome ?? "Alguém" : "Alguém"}
                      </span>
                      <span className="block truncate">
                        {citada.texto ?? `[${citada.media_nome ?? "anexo"}]`}
                      </span>
                    </div>
                  )}

                  {m.apagada_em ? (
                    <em className="opacity-60">mensagem apagada</em>
                  ) : (
                    <>
                      {m.texto && <p className="whitespace-pre-wrap break-words">{m.texto}</p>}
                      <Anexo m={m} />
                    </>
                  )}

                  <span
                    className={`block text-[10px] mt-0.5 ${
                      minha ? "text-white/60 dark:text-arini/60" : "text-muted-foreground"
                    }`}
                  >
                    {fmtHoraBR(m.created_at)}
                    {m.editada_em && " · editada"}
                  </span>
                </div>

                {!m.apagada_em && (
                  <div
                    className={`flex gap-2 mt-0.5 opacity-0 group-hover:opacity-100 transition-opacity ${
                      minha ? "justify-end" : "justify-start"
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onResponder(m)}
                      className="text-[10px] text-muted-foreground hover:text-arini inline-flex items-center gap-0.5"
                    >
                      <CornerUpLeft size={10} /> responder
                    </button>
                    {minha && (
                      <button
                        type="button"
                        onClick={() => onApagar(m.id)}
                        className="text-[10px] text-muted-foreground hover:text-red-600 inline-flex items-center gap-0.5"
                      >
                        <Trash2 size={10} /> apagar
                      </button>
                    )}
                  </div>
                )}
              </div>
            </div>
          </Fragment>
        );
      })}
      <div ref={fimRef} />
    </div>
  );
}
