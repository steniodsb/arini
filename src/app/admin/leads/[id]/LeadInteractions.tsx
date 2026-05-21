"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { formatDateTimeBR } from "@/lib/utils";

interface Props {
  leadId: string;
  interactions: { id: string; tipo: string; conteudo: string | null; created_at: string }[];
  appointments: { id: string; tipo: string; data_hora: string; observacoes: string | null; confirmado: boolean }[];
}

export function LeadInteractions({ leadId, interactions, appointments }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  async function addInteraction(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("lead_interactions").insert({
      lead_id: leadId,
      tipo: fd.get("tipo"),
      conteudo: fd.get("conteudo"),
      user_id: user?.id,
    });
    await supabase.from("leads").update({ ultima_interacao_em: new Date().toISOString() }).eq("id", leadId);
    (e.currentTarget as HTMLFormElement).reset();
    setLoading(false);
    router.refresh();
  }

  async function addAppointment(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault(); setLoading(true);
    const fd = new FormData(e.currentTarget);
    const supabase = createSupabaseBrowser();
    const { data: { user } } = await supabase.auth.getUser();
    await supabase.from("lead_appointments").insert({
      lead_id: leadId,
      tipo: fd.get("tipo"),
      data_hora: fd.get("data_hora"),
      responsavel_id: user?.id,
      observacoes: fd.get("obs"),
    });
    (e.currentTarget as HTMLFormElement).reset();
    setLoading(false);
    router.refresh();
  }

  return (
    <div className="grid md:grid-cols-2 gap-4">
      <Card>
        <CardHeader><CardTitle>Interações</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addInteraction} className="space-y-2 mb-4">
            <div className="grid grid-cols-2 gap-2">
              <Select name="tipo" defaultValue="ligacao">
                <option value="ligacao">Ligação</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="reuniao">Reunião</option>
                <option value="visita">Visita</option>
                <option value="proposta">Proposta</option>
                <option value="email">E-mail</option>
                <option value="nota">Nota</option>
              </Select>
              <Button type="submit" variant="gold" size="sm" disabled={loading}>Registrar</Button>
            </div>
            <Textarea name="conteudo" placeholder="Detalhe da interação…" rows={2} />
          </form>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {interactions.length === 0 && <p className="text-sm text-muted-foreground">Sem interações ainda.</p>}
            {interactions.map((it) => (
              <div key={it.id} className="text-sm border-l-2 border-gold pl-3 py-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{it.tipo}</Badge>
                  <span className="text-xs text-muted-foreground">{formatDateTimeBR(it.created_at)}</span>
                </div>
                {it.conteudo && <p className="mt-1 text-muted-foreground">{it.conteudo}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader><CardTitle>Agendamentos</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={addAppointment} className="space-y-2 mb-4">
            <div className="grid grid-cols-2 gap-2">
              <Select name="tipo" defaultValue="visita">
                <option value="visita">Visita</option>
                <option value="reuniao">Reunião</option>
                <option value="ligacao">Ligação</option>
                <option value="retorno">Retorno</option>
                <option value="assinatura">Assinatura</option>
              </Select>
              <Input type="datetime-local" name="data_hora" required />
            </div>
            <Input name="obs" placeholder="Observações" />
            <Button type="submit" variant="gold" size="sm" className="w-full" disabled={loading}>Agendar</Button>
          </form>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {appointments.length === 0 && <p className="text-sm text-muted-foreground">Sem agendamentos.</p>}
            {appointments.map((a) => (
              <div key={a.id} className="text-sm border-l-2 border-arini pl-3 py-1">
                <div className="flex items-center gap-2">
                  <Badge variant="outline">{a.tipo}</Badge>
                  <span className="text-xs">{formatDateTimeBR(a.data_hora)}</span>
                </div>
                {a.observacoes && <p className="text-muted-foreground text-xs mt-0.5">{a.observacoes}</p>}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
