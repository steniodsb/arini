"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { MessageCircle, CheckCircle2 } from "lucide-react";

interface Props {
  propertyId: string;
  propertyCode: string;
}

export function PropertyContactForm({ propertyId, propertyCode }: Props) {
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const res = await fetch("/api/leads", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        nome: fd.get("nome"),
        whatsapp: fd.get("whatsapp"),
        email: fd.get("email"),
        imovel_interesse_id: propertyId,
        referencia: `Imóvel ${propertyCode}`,
        interesse_tipo: "compra",
        mensagem: `Tenho interesse no imóvel ${propertyCode}.`,
      }),
    });
    setLoading(false);
    if (res.ok) setSent(true);
    else {
      const j = await res.json().catch(() => ({}));
      setError(j.error || "Não foi possível enviar. Tente novamente.");
    }
  }

  if (sent) {
    return (
      <div className="p-4 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-2">
        <CheckCircle2 size={18} className="shrink-0 mt-0.5" />
        <div>
          <strong>Mensagem recebida!</strong>
          <p className="mt-0.5">Em breve entraremos em contato pelo WhatsApp.</p>
        </div>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      <div>
        <Label>Nome completo *</Label>
        <Input name="nome" required placeholder="Seu nome" />
      </div>
      <div>
        <Label>Telefone / WhatsApp *</Label>
        <Input name="whatsapp" required placeholder="(00) 00000-0000" />
      </div>
      <div>
        <Label>E-mail *</Label>
        <Input name="email" type="email" required placeholder="seu@email.com" />
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <Button
        type="submit"
        disabled={loading}
        className="w-full bg-gold-gradient text-arini hover:brightness-105 font-semibold h-11"
      >
        <MessageCircle size={16} /> {loading ? "Enviando..." : "Quero saber mais"}
      </Button>
    </form>
  );
}
