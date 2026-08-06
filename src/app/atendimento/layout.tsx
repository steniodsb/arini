import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { AtendimentoNav } from "./AtendimentoNav";
import { AtendimentoThemeProvider } from "./AtendimentoThemeProvider";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { CommandBar } from "./CommandBar";
import { papelDoPerfil } from "@/lib/atendimento/papel";
import type { AgentAvailability, ThemePreference } from "@/lib/types";

// Shell do SISTEMA DE ATENDIMENTO — sidebar estilo Chatwoot, tema
// claro/escuro e command bar (Cmd/Ctrl+K). Separado do CRM.
// As telas de login e "sem acesso" renderizam sozinhas.
export default async function AtendimentoLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const result = await getAtendimentoUser();
  if (!result?.user || !hasAtendimentoAccess(result.profile)) return <>{children}</>;
  const { profile } = result;

  const tema = (profile?.atendimento_tema ?? "sistema") as ThemePreference;
  const disponibilidade = (profile?.disponibilidade ?? "online") as AgentAvailability;

  return (
    <>
      <ThemeScript initial={tema} />
      <AtendimentoThemeProvider initial={tema}>
        <div className="h-screen flex bg-background text-foreground">
          {/* O menu muda conforme o papel: a recepção não vê Relatórios nem
              Configurações, e o atendente não vê Configurações. */}
          <AtendimentoNav
            nome={profile?.nome ?? "Agente"}
            email={profile?.email ?? ""}
            cargo={profile?.cargo ?? null}
            disponibilidade={disponibilidade}
            avatarUrl={profile?.avatar_url ?? null}
            papel={papelDoPerfil(profile)}
          />
          <main className="flex-1 min-w-0 min-h-0 overflow-hidden flex flex-col">
            {children}
          </main>
        </div>
        <CommandBar />
      </AtendimentoThemeProvider>
    </>
  );
}
