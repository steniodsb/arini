import { redirect } from "next/navigation";
import { createSupabaseServer } from "./supabase/server";
import type { Profile, Sector } from "./types";

export async function getCurrentUser() {
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

export async function requireUser() {
  const result = await getCurrentUser();
  if (!result?.user) redirect("/admin/login");
  return result;
}

export async function requireSector(allowed: Sector[]) {
  const { user, profile } = await requireUser();
  if (!profile) redirect("/admin/login");
  if (!profile.is_admin_central && !allowed.includes(profile.sector)) {
    redirect("/admin?error=forbidden");
  }
  return { user, profile };
}

// =====================================================================
// Modelo de papéis: Gerência (administrativo) x Diretoria (admin_central)
// =====================================================================

/** Diretoria = topo da hierarquia: aprova, edita/exclui dinheiro, pede relatórios. */
export function isDiretoria(profile: Pick<Profile, "is_admin_central" | "sector"> | null): boolean {
  if (!profile) return false;
  return profile.is_admin_central || profile.sector === "admin_central";
}

/** Gerência = administrativo (subgerente): lança/cria, mas não edita/exclui dinheiro. */
export function isGerencia(profile: Pick<Profile, "sector"> | null): boolean {
  return profile?.sector === "administrativo";
}

/** Só a diretoria pode editar/excluir lançamentos de dinheiro. */
export function canEditMoney(profile: Pick<Profile, "is_admin_central" | "sector"> | null): boolean {
  return isDiretoria(profile);
}

/** Quem pode LANÇAR dinheiro (financeiro + gerência + diretoria). */
export function canCreateMoney(profile: Pick<Profile, "sector" | "is_admin_central"> | null): boolean {
  if (!profile) return false;
  return isDiretoria(profile) || ["financeiro", "administrativo"].includes(profile.sector);
}

/** Exige diretoria; redireciona se não for. Usar em páginas/ações restritas. */
export async function requireDiretoria() {
  const { user, profile } = await requireUser();
  if (!isDiretoria(profile)) redirect("/admin?error=forbidden");
  return { user, profile };
}
