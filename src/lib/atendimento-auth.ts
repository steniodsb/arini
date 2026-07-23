import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase/server";
import type { Profile } from "./types";

// =====================================================================
// Autenticação do SISTEMA DE ATENDIMENTO (atendimento.<dominio>).
// Sistema separado do CRM: tela de login própria, sessão própria (o
// cookie é por subdomínio) e acesso controlado pela flag
// profiles.atendimento_access — não pelo setor do CRM.
// =====================================================================

export function hasAtendimentoAccess(
  profile: Pick<Profile, "atendimento_access" | "is_admin_central" | "ativo"> | null,
): boolean {
  if (!profile || !profile.ativo) return false;
  return profile.atendimento_access || profile.is_admin_central;
}

export async function getAtendimentoUser() {
  const supabase = createSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();
  return { user, profile: profile as Profile | null };
}

/** Exige sessão válida COM acesso ao atendimento. Usar nas páginas do sistema. */
export async function requireAtendimentoUser() {
  const result = await getAtendimentoUser();
  if (!result?.user) redirect("/atendimento/login");
  if (!hasAtendimentoAccess(result.profile)) redirect("/atendimento/sem-acesso");
  return { user: result.user, profile: result.profile as Profile };
}
