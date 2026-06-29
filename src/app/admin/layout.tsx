import { getCurrentUser } from "@/lib/auth";
import { SECTOR_LABELS } from "@/lib/types";
import { SECTOR_NAV } from "@/lib/permissions";
import { Logo } from "@/components/brand/Logo";
import { TopBar } from "@/components/crm/TopBar";
import { ChatWidget } from "@/components/crm/ChatWidget";
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
        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
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
        <div className="p-4 border-t border-white/10 text-xs">
          <div className="text-white/40">
            {profile.is_admin_central ? "Admin Central" : SECTOR_LABELS[profile.sector]}
          </div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <TopBar
          profile={{
            id: profile.id,
            nome: profile.nome,
            email: profile.email,
            sector: profile.sector,
            is_admin_central: profile.is_admin_central,
          }}
        />
        <div className="flex-1 p-8 overflow-y-auto">{children}</div>
      </main>
      <ChatWidget userId={profile.id} sector={profile.sector} />
    </div>
  );
}
