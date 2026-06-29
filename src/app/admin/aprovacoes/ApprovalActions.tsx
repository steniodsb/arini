"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

interface Props {
  approvalId: string | null;
  entityTable: string;
  entityId: string;
  stage: string;
}

export function ApprovalActions({ approvalId, entityTable, entityId, stage }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [showReject, setShowReject] = useState(false);
  const [comment, setComment] = useState("");

  async function decide(status: "aprovado" | "reprovado" | "corrigir") {
    setLoading(true);
    try {
      const res = await fetch("/api/approvals/decide", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ approvalId, entityTable, entityId, stage, status, comentario: comment || null }),
      });
      if (!res.ok) {
        const j = await res.json().catch(() => ({}));
        alert(j.error || "Erro ao processar");
      } else {
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  if (showReject) {
    return (
      <div className="w-80 space-y-2">
        <Textarea
          placeholder="Comentário (obrigatório)"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
        />
        <div className="flex gap-2 justify-end">
          <Button variant="ghost" size="sm" onClick={() => setShowReject(false)}>Cancelar</Button>
          <Button variant="default" size="sm" onClick={() => decide("corrigir")} disabled={!comment || loading}>Pedir correção</Button>
          <Button variant="destructive" size="sm" onClick={() => decide("reprovado")} disabled={!comment || loading}>Reprovar</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex gap-2">
      <Button variant="ghost" size="sm" onClick={() => setShowReject(true)} disabled={loading}>Reprovar</Button>
      <Button variant="gold" size="sm" onClick={() => decide("aprovado")} disabled={loading}>Aprovar</Button>
    </div>
  );
}
