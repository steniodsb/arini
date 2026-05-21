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
