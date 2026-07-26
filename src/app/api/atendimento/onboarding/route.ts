import { NextResponse } from "next/server";
import { getAtendimentoUser, hasAtendimentoAccess } from "@/lib/atendimento-auth";
import { carregarEstadoOnboarding } from "@/app/atendimento/comecar/estado";
import { resumoOnboarding } from "@/app/atendimento/comecar/tipos";

// =====================================================================
// Resumo do onboarding para a FAIXA DE AVISO (AvisoOnboarding).
//
// Existe porque a faixa é um componente client isolado: parte da
// verificação (contar `profiles` e `atendimento_channels`) depende da
// service role, que jamais pode ir para o browser. Só devolvemos números
// — nenhum dado das tabelas restritas atravessa daqui.
// =====================================================================

export const dynamic = "force-dynamic";

export async function GET() {
  const sessao = await getAtendimentoUser();
  if (!sessao?.user || !hasAtendimentoAccess(sessao.profile)) {
    return NextResponse.json({ error: "Sem acesso ao atendimento." }, { status: 403 });
  }

  try {
    const estado = await carregarEstadoOnboarding();
    return NextResponse.json(resumoOnboarding(estado));
  } catch {
    // A faixa é enfeite: se a leitura falhar, ela simplesmente não aparece.
    return NextResponse.json({ error: "Não foi possível ler o onboarding." }, { status: 500 });
  }
}
