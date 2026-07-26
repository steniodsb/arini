import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { Logo } from "@/components/brand/Logo";
import { LogoutButton } from "./LogoutButton";
import { AtendimentoNav } from "./AtendimentoNav";

// Shell do SISTEMA DE ATENDIMENTO — sidebar de ícones estilo Chatwoot,
// separado do CRM. As telas de login e "sem acesso" renderizam sozinhas.
export default async function AtendimentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAtendimentoUser();
  if (!result?.user || !hasAtendimentoAccess(result.profile)) return <>{children}</>;
  const { profile } = result;

  return (
    <div className="h-screen flex bg-muted/30">
      <AtendimentoNav />
      <div className="flex-1 min-w-0 flex flex-col">
        <header className="h-12 shrink-0 bg-card border-b flex items-center justify-between px-4 gap-4">
          <div className="flex items-center gap-2 min-w-0">
            <Logo size={22} href="/atendimento" />
            <span className="font-display text-base leading-none text-arini">Atendimento</span>
          </div>
          <div className="flex items-center gap-3 text-sm min-w-0">
            <span className="truncate text-muted-foreground">{profile?.nome}</span>
            <LogoutButton />
          </div>
        </header>
        <main className="flex-1 min-h-0 overflow-hidden">{children}</main>
      </div>
    </div>
  );
}
