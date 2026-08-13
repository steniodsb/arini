import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { createSupabaseServer } from "@/lib/supabase/server";
import { AtendimentoNav } from "./AtendimentoNav";
import { AtendimentoThemeProvider } from "./AtendimentoThemeProvider";
import { ThemeScript } from "@/components/theme/ThemeScript";
import { CommandBar } from "./CommandBar";
import { papelDoPerfil } from "@/lib/atendimento/papel";
import { corEfetiva } from "@/lib/atendimento/cores";
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

  // Cor: a escolha do agente vence a da conta, que vence o padrão do
  // código. Resolvida aqui no servidor para o script inline já aplicar a
  // paleta certa — trocar de cor depois da hidratação piscaria.
  const supabase = createSupabaseServer();
  const { data: settings } = await supabase
    .from("atendimento_settings")
    .select("cor_padrao")
    .eq("id", true)
    .maybeSingle();
  const cor = corEfetiva(
    (profile as { atendimento_cor?: string | null } | null)?.atendimento_cor,
    settings?.cor_padrao,
  );

  return (
    <>
      <ThemeScript initial={tema} cor={cor} />
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
