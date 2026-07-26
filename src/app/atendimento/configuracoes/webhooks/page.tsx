import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { PageShell, PageHeader, Alerta } from "@/components/atendimento/ui";

export default async function WebhooksPage() {
  await requireAtendimentoUser();
  return (
    <PageShell>
      <PageHeader
        titulo="Webhooks"
        descricao="Enviar eventos do atendimento (nova conversa, mensagem, resolução) para uma URL externa."
      />
      <Alerta tipo="atencao">
        <strong>Em construção.</strong> Ainda falta a tabela de webhooks no banco, o cadastro de URL +
        eventos assinados e o disparo com repetição em caso de falha. Nada é enviado para fora por
        enquanto.
      </Alerta>
    </PageShell>
  );
}
