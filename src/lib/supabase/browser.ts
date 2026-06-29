import { createBrowserClient } from "@supabase/ssr";

// Remove barra(s) finais para não gerar URLs como "...supabase.co//auth/v1/..."
// (o gateway do Supabase responde "Invalid path specified in request URL").
const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").replace(/\/+$/, "");

export function createSupabaseBrowser() {
  return createBrowserClient(SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
}
