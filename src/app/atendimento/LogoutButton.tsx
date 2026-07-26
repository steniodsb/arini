"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";
import { LogOut } from "lucide-react";

export function LogoutButton() {
  const router = useRouter();
  async function sair() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/atendimento/login");
    router.refresh();
  }
  return (
    <button
      type="button"
      onClick={() => void sair()}
      className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-arini transition-colors"
      title="Sair"
    >
      <LogOut size={14} /> Sair
    </button>
  );
}
