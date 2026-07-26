import { requireAtendimentoUser } from "@/lib/atendimento-auth";
import { AssistentePrimeirosPassos } from "./AssistentePrimeirosPassos";
import { carregarEstadoOnboarding } from "./estado";

export const dynamic = "force-dynamic";

// O estado é lido no servidor a cada visita (e não guardado em cache): o
// checklist perde a graça se mostrar "canal pendente" logo depois de a
// pessoa ter conectado o canal na aba ao lado.
export default async function ComecarPage() {
  await requireAtendimentoUser();
  const estado = await carregarEstadoOnboarding();
  return <AssistentePrimeirosPassos inicial={estado} />;
}
