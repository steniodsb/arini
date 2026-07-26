import Link from "next/link";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { Logo } from "@/components/brand/Logo";
import { LogoutButton } from "./LogoutButton";

// Shell do SISTEMA DE ATENDIMENTO — separado do CRM (sem a sidebar do
// /admin). As telas de login e "sem acesso" renderizam sozinhas.
export default async function AtendimentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAtendimentoUser();
  if (!result?.user || !hasAtendimentoAccess(result.profile)) return <>{children}</>;
  const { profile } = result;

  return (
    <div className="h-screen flex flex-col bg-muted/30">
      <header className="h-14 shrink-0 bg-arini text-white flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Logo variant="light" size={26} href="/atendimento" />
          <span className="font-display text-lg leading-none">Atendimento</span>
          <nav className="flex items-center gap-1 ml-3 text-sm">
            <Link
              href="/atendimento"
              className="px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors"
            >
              Conversas
            </Link>
            <Link
              href="/atendimento/canais"
              className="px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors"
            >
              Canais
            </Link>
            <Link
              href="/atendimento/respostas"
              className="px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors"
            >
              Respostas
            </Link>
            <Link
              href="/atendimento/relatorios"
              className="px-2.5 py-1 rounded-md hover:bg-white/10 transition-colors"
            >
              Relatórios
            </Link>
          </nav>
        </div>
        <div className="flex items-center gap-4 text-sm min-w-0">
          <span className="truncate text-white/80">{profile?.nome}</span>
          <LogoutButton />
        </div>
      </header>
      <main className="flex-1 min-h-0">{children}</main>
    </div>
  );
}
