"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";

interface Props {
  propertyId?: string;
  propertyCode?: string;
  compact?: boolean;
}

export function ContactForm({ propertyId, propertyCode, compact }: Props) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true); setError(null);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    if (propertyId) (payload as Record<string, unknown>).imovel_interesse_id = propertyId;
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    setLoading(false);
    if (res.ok) { setSent(true); } else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Não foi possível enviar. Tente novamente.");
    }
  }

  if (sent) {
    return (
      <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm">
        Mensagem recebida! Em breve entraremos em contato.
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label>Nome*</Label>
        <Input name="nome" required />
      </div>
      <div className={compact ? "" : "grid md:grid-cols-2 gap-3"}>
        <div>
          <Label>WhatsApp*</Label>
          <Input name="whatsapp" required placeholder="(00) 00000-0000" />
        </div>
        {!compact && (
          <div>
            <Label>E-mail</Label>
            <Input name="email" type="email" />
          </div>
        )}
      </div>
      {!compact && (
        <div>
          <Label>Interesse</Label>
          <Select name="interesse_tipo" defaultValue="compra">
            <option value="compra">Compra</option>
            <option value="locacao">Locação</option>
            <option value="rural">Rural</option>
            <option value="investimento">Investimento</option>
          </Select>
        </div>
      )}
      {propertyCode && (
        <input type="hidden" name="referencia" value={`Imóvel ${propertyCode}`} />
      )}
      <div>
        <Label>Mensagem</Label>
        <Textarea name="mensagem" placeholder="Conte um pouco sobre o que procura…" rows={compact ? 3 : 5} />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <Button type="submit" variant="gold" className="w-full" disabled={loading}>
        {loading ? "Enviando..." : "Enviar mensagem"}
      </Button>
    </form>
  );
}
