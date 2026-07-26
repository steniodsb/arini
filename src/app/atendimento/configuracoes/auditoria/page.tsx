import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { PageShell, PageHeader, Alerta } from "@/components/atendimento/ui";

export default async function AuditoriaPage() {
  await requireAtendimentoUser();
  return (
    <PageShell>
      <PageHeader
        titulo="Registro de auditoria"
        descricao="Histórico de quem alterou o quê nas configurações e nas conversas."
      />
      <Alerta tipo="atencao">
        <strong>Em construção.</strong> Ainda falta a tabela de auditoria e os gatilhos que gravam as
        alterações (autor, ação, registro afetado, antes/depois). O que existe hoje é apenas o log de
        execução das automações.
      </Alerta>
    </PageShell>
  );
}
