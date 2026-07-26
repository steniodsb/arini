import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { PageShell } from "@/components/atendimento/ui";
import { PerfilForm } from "./PerfilForm";
import type { AgentAvailability, ThemePreference } from "@/lib/types";

export const dynamic = "force-dynamic";

export default async function PerfilPage() {
  // O próprio requireAtendimentoUser já traz o profile completo do usuário
  // logado — não há motivo para uma segunda consulta aqui.
  const { user, profile } = await requireAtendimentoUser();

  return (
    <PageShell>
      <PerfilForm
        id={profile.id}
        nome={profile.nome ?? ""}
        email={profile.email ?? user.email ?? ""}
        telefone={profile.telefone}
        avatarUrl={profile.avatar_url}
        assinatura={profile.assinatura}
        temaInicial={(profile.atendimento_tema ?? "sistema") as ThemePreference}
        disponibilidadeInicial={(profile.disponibilidade ?? "online") as AgentAvailability}
        notificacoesIniciais={profile.notificacoes ?? {}}
      />
    </PageShell>
  );
}
