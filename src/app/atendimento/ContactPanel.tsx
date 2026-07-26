"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import {
  CHANNEL_LABELS, LEAD_STAGES, CONVERSATION_STATUS_LABELS,
  type Conversation, type CustomAttributeDef, type ContactNote,
} from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import {
  User, Phone, Mail, Home, GitBranch, ChevronDown, ChevronRight,
  MessageSquare, StickyNote, Plus, Trash2, Building2, Timer, ExternalLink,
} from "lucide-react";

type LeadCtx = {
  id: string;
  nome: string | null;
  stage: string | null;
  origem: string | null;
  email: string | null;
  telefone: string | null;
  imovel_interesse_id: string | null;
  company_id: string | null;
  custom_attributes: Record<string, unknown> | null;
};
type PropertyCtx = { codigo: string; titulo: string | null };
type ConvResumo = { id: string; canal: string; status: string; last_message_at: string; last_message_preview: string | null };

function stageLabel(stage: string | null) {
  return LEAD_STAGES.find((s) => s.key === stage)?.label ?? stage ?? "—";
}

function duracaoLegivel(de: string, ate: string): string {
  const min = Math.round((new Date(ate).getTime() - new Date(de).getTime()) / 60000);
  if (min < 1) return "menos de 1 min";
  if (min < 60) return `${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h} h ${min % 60} min`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/**
 * Painel direito da conversa: quem é o contato, o contexto do CRM (lead,
 * funil, imóvel de interesse), atributos personalizados, notas do contato
 * e as conversas anteriores dele. Tudo em blocos recolhíveis.
 */
export function ContactPanel({
  conversation,
  agentName,
}: {
  conversation: Conversation;
  agentName?: Map<string, string>;
}) {
  const [lead, setLead] = useState<LeadCtx | null>(null);
  const [property, setProperty] = useState<PropertyCtx | null>(null);
  const [empresa, setEmpresa] = useState<{ id: string; nome: string } | null>(null);
  const [defs, setDefs] = useState<CustomAttributeDef[]>([]);
  const [notas, setNotas] = useState<ContactNote[]>([]);
  const [novaNota, setNovaNota] = useState("");
  const [salvandoNota, setSalvandoNota] = useState(false);

  const leadId = conversation.lead_id;

  const carregarNotas = useCallback(async (id: string) => {
    const supabase = createSupabaseBrowser();
    const { data } = await supabase
      .from("atendimento_contact_notes")
      .select("*")
      .eq("lead_id", id)
      .order("created_at", { ascending: false })
      .limit(30);
    setNotas((data ?? []) as ContactNote[]);
  }, []);

  useEffect(() => {
    let cancelado = false;
    setLead(null); setProperty(null); setEmpresa(null); setNotas([]);
    const supabase = createSupabaseBrowser();

    // As definições de atributo não dependem do lead — carrega sempre.
    void supabase
      .from("atendimento_custom_attributes")
      .select("*")
      .eq("aplica_a", "contato")
      .then(({ data }) => { if (!cancelado) setDefs((data ?? []) as CustomAttributeDef[]); });

    if (!leadId) return () => { cancelado = true; };

    void (async () => {
      const { data: l } = await supabase
        .from("leads")
        .select("id, nome, stage, origem, email, telefone, imovel_interesse_id, company_id, custom_attributes")
        .eq("id", leadId)
        .maybeSingle();
      if (cancelado) return;
      const lc = (l as LeadCtx) ?? null;
      setLead(lc);
      if (lc?.imovel_interesse_id) {
        const { data: p } = await supabase
          .from("properties").select("codigo, titulo").eq("id", lc.imovel_interesse_id).maybeSingle();
        if (!cancelado) setProperty((p as PropertyCtx) ?? null);
      }
      if (lc?.company_id) {
        const { data: e } = await supabase
          .from("atendimento_companies").select("id, nome").eq("id", lc.company_id).maybeSingle();
        if (!cancelado && e) setEmpresa(e as { id: string; nome: string });
      }
      void carregarNotas(leadId);
    })();

    return () => { cancelado = true; };
  }, [leadId, carregarNotas]);

  const [anteriores, setAnteriores] = useState<ConvResumo[]>([]);
  useEffect(() => {
    if (!leadId) { setAnteriores([]); return; }
    let cancelado = false;
    const supabase = createSupabaseBrowser();
    void supabase
      .from("conversations")
      .select("id, canal, status, last_message_at, last_message_preview")
      .eq("lead_id", leadId)
      .neq("id", conversation.id)
      .order("last_message_at", { ascending: false })
      .limit(8)
      .then(({ data }) => { if (!cancelado) setAnteriores((data ?? []) as ConvResumo[]); });
    return () => { cancelado = true; };
  }, [leadId, conversation.id]);

  async function adicionarNota() {
    const texto = novaNota.trim();
    if (!texto || !leadId || salvandoNota) return;
    setSalvandoNota(true);
    const supabase = createSupabaseBrowser();
    const { data: auth } = await supabase.auth.getUser();
    const { data, error } = await supabase
      .from("atendimento_contact_notes")
      .insert({ lead_id: leadId, texto, autor_id: auth.user?.id ?? null })
      .select("*")
      .single();
    if (!error && data) setNotas((prev) => [data as ContactNote, ...prev]);
    setNovaNota("");
    setSalvandoNota(false);
  }

  async function excluirNota(id: string) {
    const supabase = createSupabaseBrowser();
    await supabase.from("atendimento_contact_notes").delete().eq("id", id);
    setNotas((prev) => prev.filter((n) => n.id !== id));
  }

  const nome = conversation.contato_nome || conversation.contato_telefone || "Contato";
  const atributos = (lead?.custom_attributes ?? {}) as Record<string, unknown>;
  const responsavel = conversation.responsavel_id ? agentName?.get(conversation.responsavel_id) : null;

  return (
    <aside className="w-72 shrink-0 border-l bg-card overflow-y-auto">
      <div className="p-4 border-b text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-arini/10 text-arini dark:text-gold dark:bg-gold/15 flex items-center justify-center text-lg font-semibold">
          {nome.charAt(0).toUpperCase()}
        </div>
        <div className="mt-2 font-semibold text-sm truncate">{nome}</div>
        <div className="text-xs text-muted-foreground">{CHANNEL_LABELS[conversation.canal]}</div>
        {leadId && (
          <Link
            href="/atendimento/contatos"
            className="mt-2 inline-flex items-center gap-1 text-[11px] text-arini dark:text-gold hover:underline"
          >
            Abrir no cadastro <ExternalLink size={10} />
          </Link>
        )}
      </div>

      <Bloco titulo="Contato" inicialAberto>
        {conversation.contato_telefone && <Linha icone={<Phone size={13} />} texto={conversation.contato_telefone} />}
        {lead?.email && <Linha icone={<Mail size={13} />} texto={lead.email} />}
        {empresa && <Linha icone={<Building2 size={13} />} texto={empresa.nome} />}
        <Linha icone={<User size={13} />} texto={`Início: ${formatDateTimeBR(conversation.created_at)}`} />
      </Bloco>

      <Bloco titulo="Conversa" inicialAberto>
        <Linha icone={<MessageSquare size={13} />} texto={`Status: ${CONVERSATION_STATUS_LABELS[conversation.status]}`} />
        {responsavel && <Linha icone={<User size={13} />} texto={`Responsável: ${responsavel}`} />}
        {conversation.primeira_resposta_em ? (
          <Linha
            icone={<Timer size={13} />}
            texto={`1ª resposta em ${duracaoLegivel(conversation.created_at, conversation.primeira_resposta_em)}`}
          />
        ) : (
          <Linha icone={<Timer size={13} />} texto="Ainda sem resposta da equipe" />
        )}
        {conversation.resolvida_em && (
          <Linha
            icone={<Timer size={13} />}
            texto={`Resolvida em ${duracaoLegivel(conversation.created_at, conversation.resolvida_em)}`}
          />
        )}
        {conversation.sla_violado && (
          <div className="rounded-md border border-red-500/25 bg-red-500/10 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
            SLA estourado nesta conversa.
          </div>
        )}
      </Bloco>

      <Bloco titulo="CRM" inicialAberto>
        {!leadId ? (
          <p className="text-xs text-muted-foreground">Sem contato do CRM vinculado.</p>
        ) : !lead ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2">
            <Linha icone={<GitBranch size={13} />} texto={`Funil: ${stageLabel(lead.stage)}`} />
            {lead.origem && <Linha icone={<User size={13} />} texto={`Origem: ${lead.origem}`} />}
            {property && (
              <Linha
                icone={<Home size={13} />}
                texto={`Imóvel ${property.codigo}${property.titulo ? ` — ${property.titulo}` : ""}`}
              />
            )}
          </div>
        )}
      </Bloco>

      {defs.length > 0 && (
        <Bloco titulo="Atributos do contato">
          {defs.map((d) => {
            const v = atributos[d.chave];
            const texto =
              v === undefined || v === null || v === ""
                ? "—"
                : d.tipo === "booleano"
                  ? (v ? "Sim" : "Não")
                  : String(v);
            return (
              <div key={d.id} className="flex items-baseline gap-2 text-xs">
                <span className="text-muted-foreground shrink-0 min-w-[80px]">{d.nome}</span>
                <span className="truncate">{texto}</span>
              </div>
            );
          })}
        </Bloco>
      )}

      {anteriores.length > 0 && (
        <Bloco titulo={`Conversas anteriores (${anteriores.length})`}>
          {anteriores.map((c) => (
            <Link
              key={c.id}
              href={`/atendimento?c=${c.id}`}
              className="block rounded-md px-2 py-1.5 hover:bg-muted -mx-2"
            >
              <div className="text-[11px] font-medium truncate">{c.last_message_preview ?? "—"}</div>
              <div className="text-[10px] text-muted-foreground">
                {CHANNEL_LABELS[c.canal as keyof typeof CHANNEL_LABELS] ?? c.canal} · {formatDateTimeBR(c.last_message_at)}
              </div>
            </Link>
          ))}
        </Bloco>
      )}

      {leadId && (
        <Bloco titulo="Notas do contato" inicialAberto>
          <div className="flex items-start gap-1.5">
            <textarea
              value={novaNota}
              onChange={(e) => setNovaNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { e.preventDefault(); void adicionarNota(); }
              }}
              rows={2}
              placeholder="Anotação sobre este contato…"
              className="flex-1 rounded-md border bg-background px-2 py-1.5 text-xs resize-none outline-none focus:ring-2 focus:ring-ring/40"
            />
            <button
              type="button"
              onClick={() => void adicionarNota()}
              disabled={!novaNota.trim() || salvandoNota}
              className="p-1.5 rounded-md text-arini dark:text-gold hover:bg-muted disabled:opacity-40"
              title="Adicionar nota (Ctrl+Enter)"
            >
              <Plus size={15} />
            </button>
          </div>
          {notas.length === 0 && <p className="text-[11px] text-muted-foreground">Nenhuma nota ainda.</p>}
          {notas.map((n) => (
            <div key={n.id} className="group rounded-md bg-muted/50 px-2 py-1.5">
              <div className="flex items-start gap-1.5">
                <StickyNote size={11} className="mt-0.5 text-muted-foreground shrink-0" />
                <p className="text-[11px] whitespace-pre-line break-words flex-1">{n.texto}</p>
                <button
                  type="button"
                  onClick={() => void excluirNota(n.id)}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-red-600"
                  aria-label="Excluir nota"
                >
                  <Trash2 size={11} />
                </button>
              </div>
              <div className="text-[9px] text-muted-foreground mt-0.5 pl-4">
                {agentName?.get(n.autor_id ?? "") ?? "—"} · {formatDateTimeBR(n.created_at)}
              </div>
            </div>
          ))}
        </Bloco>
      )}
    </aside>
  );
}

function Bloco({
  titulo, children, inicialAberto = false,
}: {
  titulo: string; children: React.ReactNode; inicialAberto?: boolean;
}) {
  const [aberto, setAberto] = useState(inicialAberto);
  return (
    <div className="border-b">
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        className="w-full px-4 py-2.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground hover:bg-muted/40"
      >
        {aberto ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <span className="flex-1 text-left">{titulo}</span>
      </button>
      {aberto && <div className="px-4 pb-3 space-y-2">{children}</div>}
    </div>
  );
}

function Linha({ icone, texto }: { icone: React.ReactNode; texto: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-foreground/80">
      <span className="text-muted-foreground shrink-0">{icone}</span>
      <span className="truncate" title={texto}>{texto}</span>
    </div>
  );
}
