"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Drawer, DrawerRow, DrawerSection } from "@/components/atendimento/Drawer";
import { Alerta, Spinner, TextArea } from "@/components/atendimento/ui";
import {
  CHANNEL_LABELS,
  CONVERSATION_STATUS_LABELS,
  type ContactNote,
  type ConversationChannel,
  type ConversationStatus,
  type CustomAttributeDef,
} from "@/lib/types";
import { errMessage, formatDateTimeBR } from "@/lib/utils";
import { Ban, MessageSquare, Pencil, ShieldCheck, Trash2 } from "lucide-react";
import {
  corEtapa,
  formatarAtributo,
  inicialDe,
  rotuloEtapa,
  rotuloOrigem,
  type AgenteOpcao,
  type ContatoRow,
  type EmpresaOpcao,
} from "./tipos";

/** Linha de `conversations` que o painel realmente usa. */
interface ConversaResumo {
  id: string;
  canal: ConversationChannel;
  status: ConversationStatus;
  last_message_at: string;
  last_message_preview: string | null;
}

export function ContatoDetalhe({
  contato,
  empresas,
  atributos,
  agentes,
  usuarioId,
  onFechar,
  onEditar,
  onExcluir,
  onAlterado,
}: {
  contato: ContatoRow;
  empresas: EmpresaOpcao[];
  atributos: CustomAttributeDef[];
  agentes: AgenteOpcao[];
  usuarioId: string;
  onFechar: () => void;
  onEditar: (c: ContatoRow) => void;
  onExcluir: (c: ContatoRow) => void;
  onAlterado: (c: ContatoRow) => void;
}) {
  const [conversas, setConversas] = useState<ConversaResumo[]>([]);
  const [notas, setNotas] = useState<ContactNote[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [novaNota, setNovaNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);
  const [bloqueando, setBloqueando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const empresa = empresas.find((e) => e.id === contato.company_id) ?? null;
  const nomeAgente = useCallback(
    (id: string | null) => (id ? agentes.find((a) => a.id === id)?.nome ?? "Agente" : "Sistema"),
    [agentes],
  );

  // Conversas e notas são específicas do contato aberto — buscamos sob demanda
  // em vez de trazer tudo na listagem.
  useEffect(() => {
    let cancelado = false;
    setCarregando(true);
    setErro(null);
    const supabase = createSupabaseBrowser();
    void (async () => {
      const [convRes, notasRes] = await Promise.all([
        supabase
          .from("conversations")
          .select("id, canal, status, last_message_at, last_message_preview")
          .eq("lead_id", contato.id)
          .order("last_message_at", { ascending: false })
          .limit(30),
        supabase
          .from("atendimento_contact_notes")
          .select("*")
          .eq("lead_id", contato.id)
          .order("created_at", { ascending: false }),
      ]);
      if (cancelado) return;
      if (convRes.error || notasRes.error) {
        setErro(convRes.error?.message ?? notasRes.error?.message ?? null);
      }
      setConversas((convRes.data ?? []) as ConversaResumo[]);
      setNotas((notasRes.data ?? []) as ContactNote[]);
      setCarregando(false);
    })();
    return () => {
      cancelado = true;
    };
  }, [contato.id]);

  async function adicionarNota() {
    const texto = novaNota.trim();
    if (!texto) return;
    setSalvandoNota(true);
    setErro(null);
    const supabase = createSupabaseBrowser();
    const { data, error } = await supabase
      .from("atendimento_contact_notes")
      .insert({ lead_id: contato.id, texto, autor_id: usuarioId })
      .select("*")
      .single();
    setSalvandoNota(false);
    if (error) {
      setErro(error.message);
      return;
    }
    setNotas((p) => [data as ContactNote, ...p]);
    setNovaNota("");
  }

  async function excluirNota(id: string) {
    setErro(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("atendimento_contact_notes").delete().eq("id", id);
    if (error) {
      setErro(error.message);
      return;
    }
    setNotas((p) => p.filter((n) => n.id !== id));
  }

  async function alternarBloqueio() {
    setBloqueando(true);
    setErro(null);
    try {
      const res = await fetch("/api/atendimento/contatos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          acao: "massa",
          ids: [contato.id],
          dados: { bloqueado: !contato.bloqueado },
        }),
      });
      const json = (await res.json().catch(() => ({}))) as {
        error?: string;
        contatos?: ContatoRow[];
      };
      if (!res.ok) throw new Error(json.error ?? "Falha ao alterar o bloqueio.");
      onAlterado({ ...contato, bloqueado: !contato.bloqueado });
    } catch (e) {
      setErro(errMessage(e));
    } finally {
      setBloqueando(false);
    }
  }

  const atributosPreenchidos = atributos.filter(
    (a) => contato.custom_attributes?.[a.chave] !== undefined,
  );

  return (
    <Drawer
      aberto
      onFechar={onFechar}
      titulo={contato.nome}
      subtitulo={empresa ? empresa.nome : "Sem empresa"}
      largura="max-w-lg"
      cabecalho={
        <span className="h-9 w-9 shrink-0 rounded-full bg-arini/10 text-arini dark:text-gold dark:bg-gold/15 flex items-center justify-center text-sm font-semibold">
          {inicialDe(contato.nome)}
        </span>
      }
      acoes={
        <>
          <button
            type="button"
            onClick={() => onEditar(contato)}
            title="Editar contato"
            className="p-1.5 rounded text-muted-foreground hover:bg-muted"
          >
            <Pencil size={15} />
          </button>
          <button
            type="button"
            onClick={() => void alternarBloqueio()}
            disabled={bloqueando}
            title={contato.bloqueado ? "Desbloquear contato" : "Bloquear contato"}
            className="p-1.5 rounded text-muted-foreground hover:bg-muted disabled:opacity-50"
          >
            {contato.bloqueado ? <ShieldCheck size={15} /> : <Ban size={15} />}
          </button>
          <button
            type="button"
            onClick={() => onExcluir(contato)}
            title="Excluir contato"
            className="p-1.5 rounded text-muted-foreground hover:bg-muted hover:text-red-600"
          >
            <Trash2 size={15} />
          </button>
        </>
      }
    >
      <div>
        {(erro || contato.bloqueado) && (
          <div className="p-4 space-y-2 border-b">
            {contato.bloqueado && <Alerta tipo="atencao">Este contato está bloqueado.</Alerta>}
            {erro && <Alerta tipo="erro">{erro}</Alerta>}
          </div>
        )}

        <DrawerSection titulo="Dados">
          <div className="space-y-0.5">
            <DrawerRow label="Telefone">{contato.telefone ?? "—"}</DrawerRow>
            <DrawerRow label="WhatsApp">{contato.whatsapp ?? "—"}</DrawerRow>
            <DrawerRow label="E-mail">
              {contato.email ? (
                <a href={`mailto:${contato.email}`} className="text-arini dark:text-gold hover:underline">
                  {contato.email}
                </a>
              ) : (
                "—"
              )}
            </DrawerRow>
            <DrawerRow label="Empresa">{empresa?.nome ?? "—"}</DrawerRow>
            <DrawerRow label="Origem">{rotuloOrigem(contato.origem)}</DrawerRow>
            <DrawerRow label="Etapa">
              <span className="inline-flex items-center gap-1.5">
                <span className={`h-2 w-2 rounded-full ${corEtapa(contato.stage)}`} />
                {rotuloEtapa(contato.stage)}
              </span>
            </DrawerRow>
            <DrawerRow label="Criado em">{formatDateTimeBR(contato.created_at)}</DrawerRow>
            <DrawerRow label="Última interação">
              {formatDateTimeBR(contato.ultima_interacao_em)}
            </DrawerRow>
            {contato.observacoes && (
              <DrawerRow label="Observações">{contato.observacoes}</DrawerRow>
            )}
          </div>
        </DrawerSection>

        <DrawerSection titulo="Atributos personalizados">
          {atributos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum atributo de contato definido em Configurações.
            </p>
          ) : atributosPreenchidos.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhum atributo preenchido.</p>
          ) : (
            <div className="space-y-0.5">
              {atributosPreenchidos.map((a) => (
                <DrawerRow key={a.id} label={a.nome}>
                  {formatarAtributo(a, contato.custom_attributes?.[a.chave])}
                </DrawerRow>
              ))}
            </div>
          )}
        </DrawerSection>

        <DrawerSection titulo={`Conversas (${conversas.length})`}>
          {carregando ? (
            <p className="text-xs text-muted-foreground flex items-center gap-2">
              <Spinner size={13} /> Carregando…
            </p>
          ) : conversas.length === 0 ? (
            <p className="text-xs text-muted-foreground">Nenhuma conversa com este contato.</p>
          ) : (
            <ul className="space-y-1.5">
              {conversas.map((c) => (
                <li key={c.id}>
                  <Link
                    href={`/atendimento?c=${c.id}`}
                    className="block rounded-lg border px-3 py-2 hover:bg-muted/50"
                  >
                    <div className="flex items-center gap-2 text-xs">
                      <MessageSquare size={12} className="text-muted-foreground shrink-0" />
                      <span className="font-medium">{CHANNEL_LABELS[c.canal] ?? c.canal}</span>
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px]">
                        {CONVERSATION_STATUS_LABELS[c.status] ?? c.status}
                      </span>
                      <span className="ml-auto text-[10px] text-muted-foreground shrink-0">
                        {formatDateTimeBR(c.last_message_at)}
                      </span>
                    </div>
                    {c.last_message_preview && (
                      <p className="mt-1 text-xs text-muted-foreground line-clamp-2">
                        {c.last_message_preview}
                      </p>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </DrawerSection>

        <DrawerSection titulo={`Notas (${notas.length})`}>
          <div className="space-y-2">
            <TextArea
              value={novaNota}
              onChange={(e) => setNovaNota(e.target.value)}
              placeholder="Escreva uma nota interna sobre este contato…"
              rows={2}
            />
            <div className="flex justify-end">
              <Button
                type="button"
                size="sm"
                variant="gold"
                disabled={!novaNota.trim() || salvandoNota}
                onClick={() => void adicionarNota()}
              >
                {salvandoNota ? <Spinner size={14} /> : "Adicionar nota"}
              </Button>
            </div>

            {notas.length === 0 && !carregando && (
              <p className="text-xs text-muted-foreground">Nenhuma nota ainda.</p>
            )}
            <ul className="space-y-2">
              {notas.map((n) => (
                <li key={n.id} className="rounded-lg border bg-muted/30 px-3 py-2">
                  <p className="text-xs whitespace-pre-wrap break-words">{n.texto}</p>
                  <div className="mt-1.5 flex items-center gap-2 text-[10px] text-muted-foreground">
                    <span>{nomeAgente(n.autor_id)}</span>
                    <span>·</span>
                    <span>{formatDateTimeBR(n.created_at)}</span>
                    {n.autor_id === usuarioId && (
                      <button
                        type="button"
                        onClick={() => void excluirNota(n.id)}
                        className="ml-auto hover:text-red-600"
                        title="Excluir nota"
                      >
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </DrawerSection>
      </div>
    </Drawer>
  );
}
