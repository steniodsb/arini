"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";

export function DeletePropertyButton({
  propertyId,
  codigo,
  redirectTo = "/admin/captacao",
}: {
  propertyId: string;
  codigo: string;
  redirectTo?: string;
}) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onDelete() {
    if (!confirm(`Excluir o imóvel ${codigo}? Esta ação não pode ser desfeita.`)) return;
    setLoading(true);
    setError(null);
    const supabase = createSupabaseBrowser();
    const { error } = await supabase.from("properties").delete().eq("id", propertyId);
    setLoading(false);
    if (error) {
      setError(error.message);
      return;
    }
    router.push(redirectTo);
    router.refresh();
  }

  return (
    <>
      <Button variant="ghost" size="sm" onClick={onDelete} disabled={loading} className="text-red-600 hover:bg-red-50">
        <Trash2 size={14} /> {loading ? "Excluindo…" : "Excluir"}
      </Button>
      {error && <p className="text-xs text-red-600 mt-1">{error}</p>}
    </>
  );
}
