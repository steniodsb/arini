import { ONBOARDING_PASSOS, type OnboardingPassoId } from "@/lib/types";

// =====================================================================
// Tipos e textos do assistente de primeiros passos.
//
// Módulo PURO de propósito (nenhum import de Supabase, `next/headers` ou
// componente): é importado tanto pelo carregador que roda no servidor
// quanto pelos componentes client. Se aqui entrasse algo de servidor, o
// bundle do cliente quebraria.
// =====================================================================

/** Texto de tela de um passo. O título vem de `ONBOARDING_PASSOS`. */
export interface PassoMeta {
  id: OnboardingPassoId;
  titulo: string;
  /**
   * POR QUE o passo importa — de propósito não é "o que é". Quem abre o
   * assistente pela primeira vez não precisa saber o que é uma etiqueta,
   * precisa saber o que perde sem ela.
   */
  porque: string;
  /** Para onde o botão leva. */
  href: string;
  rotuloAcao: string;
  /** Como a verificação automática decide que está feito. */
  comoDetectamos: string;
  /**
   * Passo que depende de credencial/serviço de terceiro — some no `Alerta`
   * do topo para ninguém achar que é só clicar e pronto.
   */
  dependeDeExterno?: string;
}

/** Só a parte variável; título e ordem continuam saindo de `@/lib/types`. */
const DETALHES: Record<OnboardingPassoId, Omit<PassoMeta, "id" | "titulo">> = {
  conta: {
    porque:
      "É esse nome que o cliente vê nos e-mails e no portal de ajuda, e é o fuso daqui que decide se uma mensagem chegou dentro ou fora do horário.",
    href: "/atendimento/configuracoes/conta",
    rotuloAcao: "Abrir conta e plataforma",
    comoDetectamos: "Conferimos se o nome da conta saiu do valor de fábrica.",
  },
  agentes: {
    porque:
      "Enquanto só você tiver acesso, todo atendimento para quando você parar. Liberar a equipe é o que transforma isso numa operação.",
    href: "/atendimento/configuracoes/agentes",
    rotuloAcao: "Liberar acesso da equipe",
    comoDetectamos: "Contamos quantas pessoas já têm acesso ao atendimento liberado.",
  },
  canal: {
    porque:
      "Sem um canal conectado nenhuma mensagem de cliente entra na caixa — o sistema fica bonito e vazio.",
    href: "/atendimento/canais",
    rotuloAcao: "Conectar um canal",
    comoDetectamos: "Verificamos se existe algum canal com status conectado.",
    dependeDeExterno:
      "Conectar o WhatsApp exige um servidor Evolution no ar ou um número já aprovado pela Meta (Cloud API). Sem uma dessas duas coisas o passo não fecha, por mais que você clique.",
  },
  horario: {
    porque:
      "É o horário comercial que dispara a mensagem de ausência à noite e no fim de semana. Sem ele o cliente fica no vácuo achando que foi ignorado.",
    href: "/atendimento/configuracoes/horarios",
    rotuloAcao: "Conferir horário comercial",
    comoDetectamos: "Verificamos se alguma caixa de entrada está com o horário comercial ativo.",
  },
  respostas: {
    porque:
      "As perguntas se repetem o dia inteiro. Cada resposta rápida cadastrada é um punhado de minutos por dia que o time deixa de gastar digitando a mesma coisa.",
    href: "/atendimento/respostas",
    rotuloAcao: "Criar respostas rápidas",
    comoDetectamos: "Verificamos se já existe pelo menos uma resposta rápida cadastrada.",
  },
  etiquetas: {
    porque:
      "Sem etiqueta os relatórios só sabem contar conversas. Com etiqueta você descobre por que as pessoas procuram vocês.",
    href: "/atendimento/configuracoes/etiquetas",
    rotuloAcao: "Criar etiquetas",
    comoDetectamos: "Verificamos se já existe pelo menos uma etiqueta cadastrada.",
  },
};

/** Passos na ordem oficial (a de `ONBOARDING_PASSOS`). */
export const PASSOS: PassoMeta[] = ONBOARDING_PASSOS.map((p) => ({
  id: p.id,
  titulo: p.titulo,
  ...DETALHES[p.id],
}));

/** Estado de um passo depois de cruzar detecção automática e marcação manual. */
export interface PassoEstado {
  id: OnboardingPassoId;
  /** A verificação automática confirmou que está feito. */
  detectado: boolean;
  /** Alguém marcou na mão em `atendimento_settings.onboarding_passos`. */
  marcado: boolean;
  /** O que a verificação encontrou, para mostrar na tela ("3 pessoas com acesso"). */
  detalhe: string;
}

export interface EstadoOnboarding {
  passos: PassoEstado[];
  concluido: boolean;
  dispensadoEm: string | null;
}

/**
 * A detecção automática só consegue provar o "sim": achar 2 agentes prova que
 * o passo foi feito, mas não achar nenhum canal conectado não prova que a
 * pessoa não resolveu isso por fora. Por isso, quando a detecção confirma ela
 * manda (e a marcação manual é ignorada); quando não confirma, sobra o
 * checkbox manual como saída.
 */
export function passoFeito(p: PassoEstado): boolean {
  return p.detectado || p.marcado;
}

export interface ResumoOnboarding {
  total: number;
  feitos: number;
  pendentes: number;
  concluido: boolean;
  dispensado: boolean;
  /** Primeiro passo pendente — é para ele que a faixa de aviso aponta. */
  proximoId: OnboardingPassoId | null;
}

export function resumoOnboarding(estado: EstadoOnboarding): ResumoOnboarding {
  const feitos = estado.passos.filter(passoFeito).length;
  const proximo = estado.passos.find((p) => !passoFeito(p));
  return {
    total: estado.passos.length,
    feitos,
    pendentes: estado.passos.length - feitos,
    concluido: estado.concluido,
    dispensado: Boolean(estado.dispensadoEm),
    proximoId: proximo?.id ?? null,
  };
}

/** Passos bloqueados por credencial de terceiro (texto do `Alerta` do topo). */
export const PASSOS_COM_DEPENDENCIA_EXTERNA = PASSOS.filter((p) => p.dependeDeExterno);
