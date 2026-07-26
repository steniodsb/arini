import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { PageShell, PageHeader, Alerta } from "@/components/atendimento/ui";

export default async function TokensPage() {
  await requireAtendimentoUser();
  return (
    <PageShell>
      <PageHeader
        titulo="Tokens de API"
        descricao="Chaves para integrar sistemas externos ao atendimento."
      />
      <Alerta tipo="atencao">
        <strong>Em construção.</strong> Ainda falta a tabela de tokens (com hash da chave), a geração
        com exibição única do valor, a revogação e a validação nos endpoints da API. Hoje não existe
        nenhum token válido.
      </Alerta>
    </PageShell>
  );
}
