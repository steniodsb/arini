import { getCurrentUser } from "@/lib/auth";
import { SECTOR_LABELS } from "@/lib/types";
import { SECTOR_NAV } from "@/lib/permissions";
import { Logo } from "@/components/brand/Logo";
import { LogoutButton } from "./LogoutButton";
import Link from "next/link";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getCurrentUser();
  // login page renders its own UI; middleware redirects non-auth
  if (!result?.user || !result.profile) return <>{children}</>;
  const { profile } = result;
  const nav = SECTOR_NAV[profile.sector] ?? [];

  return (
    <div className="min-h-screen flex bg-muted/30">
      <aside className="w-64 bg-arini text-white flex flex-col">
        <div className="p-6 border-b border-white/10">
          <Logo variant="light" />
        </div>
        <nav className="flex-1 p-4 space-y-1">
          {nav.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="block px-3 py-2 rounded-md text-sm text-white/80 hover:bg-white/10 hover:text-white transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-4 border-t border-white/10">
          <div className="text-xs text-white/50">Logado como</div>
          <div className="text-sm font-medium">{profile.nome}</div>
          <div className="text-xs text-gold mt-1">
            {profile.is_admin_central ? "Admin Central" : SECTOR_LABELS[profile.sector]}
          </div>
          <LogoutButton />
        </div>
      </aside>
      <main className="flex-1 min-w-0">
        <div className="p-8">{children}</div>
      </main>
    </div>
  );
}
