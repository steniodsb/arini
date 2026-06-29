"use client";

import { useRouter } from "next/navigation";
import { createSupabaseBrowser } from "@/lib/supabase/browser";

export function LogoutButton() {
  const router = useRouter();
  async function logout() {
    const supabase = createSupabaseBrowser();
    await supabase.auth.signOut();
    router.push("/admin/login");
    router.refresh();
  }
  return (
    <button
      onClick={logout}
      className="mt-3 text-xs text-white/60 hover:text-gold transition-colors"
    >
      Sair →
    </button>
  );
}
