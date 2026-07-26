import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { HelpCenterManager } from "./HelpCenterManager";
import type { Artigo, Categoria, Portal } from "./tipos";

export const dynamic = "force-dynamic";

export default async function AjudaPage() {
  const { profile } = await requireAtendimentoUser();
  const supabase = createSupabaseServer();

  // Carregamos tudo de uma vez: o volume da base de conhecimento é pequeno
  // (dezenas de artigos) e assim a troca de portal na tela é instantânea.
  const [portaisRes, categoriasRes, artigosRes, autoresRes] = await Promise.all([
    supabase.from("atendimento_portals").select("*").order("created_at"),
    supabase.from("atendimento_categories").select("*").order("ordem"),
    supabase.from("atendimento_articles").select("*").order("updated_at", { ascending: false }),
    supabase.from("profiles").select("id, nome"),
  ]);

  const autores: Record<string, string> = {};
  for (const a of (autoresRes.data ?? []) as { id: string; nome: string }[]) {
    autores[a.id] = a.nome;
  }

  return (
    <HelpCenterManager
      initialPortais={(portaisRes.data ?? []) as Portal[]}
      initialCategorias={(categoriasRes.data ?? []) as Categoria[]}
      initialArtigos={(artigosRes.data ?? []) as Artigo[]}
      autores={autores}
      usuarioId={profile.id}
    />
  );
}
