"use client";

import { useEffect, useState } from "react";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { CHANNEL_LABELS, LEAD_STAGES, type Conversation } from "@/lib/types";
import { formatDateTimeBR } from "@/lib/utils";
import { User, Phone, Tag as TagIcon, Home, GitBranch } from "lucide-react";

type LeadCtx = {
  id: string;
  nome: string | null;
  stage: string | null;
  origem: string | null;
  email: string | null;
  telefone: string | null;
  imovel_interesse_id: string | null;
};
type PropertyCtx = { codigo: string; titulo: string | null };

function stageLabel(stage: string | null) {
  return LEAD_STAGES.find((s) => s.key === stage)?.label ?? stage ?? "—";
}

// Painel de contexto do CRM para a conversa selecionada: quem é o contato,
// o lead ligado, a etapa do funil e o imóvel de interesse.
export function ContactPanel({ conversation }: { conversation: Conversation }) {
  const [lead, setLead] = useState<LeadCtx | null>(null);
  const [property, setProperty] = useState<PropertyCtx | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLead(null);
    setProperty(null);
    if (!conversation.lead_id) return;
    const supabase = createSupabaseBrowser();
    void (async () => {
      const { data: l } = await supabase
        .from("leads")
        .select("id, nome, stage, origem, email, telefone, imovel_interesse_id")
        .eq("id", conversation.lead_id)
        .maybeSingle();
      if (cancelled) return;
      setLead((l as LeadCtx) ?? null);
      if (l?.imovel_interesse_id) {
        const { data: p } = await supabase
          .from("properties")
          .select("codigo, titulo")
          .eq("id", l.imovel_interesse_id)
          .maybeSingle();
        if (!cancelled) setProperty((p as PropertyCtx) ?? null);
      }
    })();
    return () => { cancelled = true; };
  }, [conversation.lead_id]);

  const nome = conversation.contato_nome || conversation.contato_telefone || "Contato";

  return (
    <aside className="w-72 shrink-0 border-l bg-card overflow-y-auto">
      <div className="p-4 border-b text-center">
        <div className="mx-auto h-14 w-14 rounded-full bg-arini/10 text-arini flex items-center justify-center text-lg font-semibold">
          {nome.charAt(0).toUpperCase()}
        </div>
        <div className="mt-2 font-semibold text-sm">{nome}</div>
        <div className="text-xs text-muted-foreground">{CHANNEL_LABELS[conversation.canal]}</div>
      </div>

      <Section title="Contato">
        {conversation.contato_telefone && (
          <Row icon={<Phone size={13} />} label={conversation.contato_telefone} />
        )}
        <Row icon={<User size={13} />} label={`Início: ${formatDateTimeBR(conversation.created_at)}`} />
      </Section>

      {conversation.tags.length > 0 && (
        <Section title="Etiquetas">
          <div className="flex flex-wrap gap-1">
            {conversation.tags.map((t) => (
              <span key={t} className="inline-flex items-center gap-1 rounded-full bg-arini/10 text-arini text-[11px] px-2 py-0.5">
                <TagIcon size={10} /> {t}
              </span>
            ))}
          </div>
        </Section>
      )}

      <Section title="CRM">
        {!conversation.lead_id ? (
          <p className="text-xs text-muted-foreground">Sem lead vinculado.</p>
        ) : !lead ? (
          <p className="text-xs text-muted-foreground">Carregando…</p>
        ) : (
          <div className="space-y-2 text-xs">
            <Row icon={<GitBranch size={13} />} label={`Funil: ${stageLabel(lead.stage)}`} />
            {lead.origem && <Row icon={<User size={13} />} label={`Origem: ${lead.origem}`} />}
            {property && (
              <Row
                icon={<Home size={13} />}
                label={`Imóvel ${property.codigo}${property.titulo ? ` — ${property.titulo}` : ""}`}
              />
            )}
            {lead.email && <Row icon={<User size={13} />} label={lead.email} />}
          </div>
        )}
      </Section>
    </aside>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="p-4 border-b">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground mb-2">{title}</h3>
      {children}
    </div>
  );
}

function Row({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <div className="flex items-center gap-2 text-xs text-foreground/80">
      <span className="text-muted-foreground shrink-0">{icon}</span>
      <span className="truncate">{label}</span>
    </div>
  );
}
