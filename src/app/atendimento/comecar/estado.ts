import { createSupabaseAdmin, createSupabaseServer } from "@/lib/supabase/server";
import type { OnboardingPassoId } from "@/lib/types";
import { PASSOS, type EstadoOnboarding, type PassoEstado } from "./tipos";

// =====================================================================
// Leitura do estado do onboarding — SÓ SERVIDOR (usa cookies e a service
// role). Fica separado da página porque a rota de API que alimenta a
// faixa de aviso precisa exatamente do mesmo cálculo; duplicar isso ia
// dar duas verdades diferentes na mesma tela.
// =====================================================================

/** Valor de fábrica de `atendimento_settings.nome_conta` (migração 0035). */
export const NOME_CONTA_PADRAO = "Arini Negócios Imobiliários";

/** Só o recorte de `atendimento_settings` que o assistente usa. */
interface SettingsOnboarding {
  nome_conta: string | null;
  onboarding_concluido: boolean | null;
  onboarding_passos: Record<string, boolean> | null;
  onboarding_dispensado_em: string | null;
}

function plural(n: number, singular: string, pluralTexto: string): string {
  return `${n} ${n === 1 ? singular : pluralTexto}`;
}

export async function carregarEstadoOnboarding(): Promise<EstadoOnboarding> {
  const supabase = createSupabaseServer();
  // `profiles` e `atendimento_channels` estão atrás de RLS mais dura (diretoria
  // / admin), e aqui só precisamos CONTAR linhas — nenhum token ou dado pessoal
  // sai daqui. Por isso a service role, e não a sessão do usuário.
  const admin = createSupabaseAdmin();

  const [settingsRes, agentesRes, canaisRes, horarioRes, respostasRes, etiquetasRes] =
    await Promise.all([
      supabase
        .from("atendimento_settings")
        .select("nome_conta, onboarding_concluido, onboarding_passos, onboarding_dispensado_em")
        .eq("id", true)
        .maybeSingle(),
      admin
        .from("profiles")
        .select("id", { count: "exact", head: true })
        .eq("atendimento_access", true),
      admin
        .from("atendimento_channels")
        .select("id", { count: "exact", head: true })
        .eq("status", "conectado"),
      supabase
        .from("atendimento_inboxes")
        .select("id", { count: "exact", head: true })
        .eq("horario_comercial_ativo", true),
      supabase.from("canned_responses").select("id", { count: "exact", head: true }),
      supabase.from("atendimento_labels").select("id", { count: "exact", head: true }),
    ]);

  const settings = (settingsRes.data ?? null) as SettingsOnboarding | null;
  const marcados = settings?.onboarding_passos ?? {};

  const agentes = agentesRes.count ?? 0;
  const canais = canaisRes.count ?? 0;
  const caixasComHorario = horarioRes.count ?? 0;
  const respostas = respostasRes.count ?? 0;
  const etiquetas = etiquetasRes.count ?? 0;
  const nomeConta = (settings?.nome_conta ?? "").trim();

  /**
   * Cada regra abaixo é a verificação combinada com a operadora: ela prova o
   * "feito", nunca o "não feito" (ver `passoFeito` em ./tipos).
   */
  const deteccao: Record<OnboardingPassoId, { detectado: boolean; detalhe: string }> = {
    conta: {
      // Só vale se o nome saiu do padrão que a migração 0035 semeou.
      detectado: nomeConta !== "" && nomeConta !== NOME_CONTA_PADRAO,
      detalhe:
        nomeConta === "" || nomeConta === NOME_CONTA_PADRAO
          ? "Ainda com o nome padrão da instalação."
          : `Conta identificada como “${nomeConta}”.`,
    },
    agentes: {
      // > 1 e não >= 1: o dono da conta já conta como um, então um único
      // agente significa que ninguém do time entrou ainda.
      detectado: agentes > 1,
      detalhe:
        agentes > 1
          ? `${plural(agentes, "pessoa", "pessoas")} com acesso ao atendimento.`
          : "Só uma pessoa tem acesso — a equipe ainda não foi liberada.",
    },
    canal: {
      detectado: canais >= 1,
      detalhe:
        canais >= 1
          ? `${plural(canais, "canal conectado", "canais conectados")}.`
          : "Nenhum canal com status conectado.",
    },
    horario: {
      detectado: caixasComHorario >= 1,
      detalhe:
        caixasComHorario >= 1
          ? `${plural(caixasComHorario, "caixa", "caixas")} com horário comercial ativo.`
          : "Nenhuma caixa com horário comercial ativo.",
    },
    respostas: {
      detectado: respostas >= 1,
      detalhe:
        respostas >= 1
          ? `${plural(respostas, "resposta rápida", "respostas rápidas")} cadastradas.`
          : "Nenhuma resposta rápida cadastrada.",
    },
    etiquetas: {
      detectado: etiquetas >= 1,
      detalhe:
        etiquetas >= 1
          ? `${plural(etiquetas, "etiqueta", "etiquetas")} cadastradas.`
          : "Nenhuma etiqueta cadastrada.",
    },
  };

  const passos: PassoEstado[] = PASSOS.map((p) => ({
    id: p.id,
    detectado: deteccao[p.id].detectado,
    marcado: marcados[p.id] === true,
    detalhe: deteccao[p.id].detalhe,
  }));

  return {
    passos,
    concluido: settings?.onboarding_concluido === true,
    dispensadoEm: settings?.onboarding_dispensado_em ?? null,
  };
}
