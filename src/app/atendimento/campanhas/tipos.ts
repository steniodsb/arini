import type { LeadOrigin, LeadStage } from "@/lib/types";

// Tipos locais das Campanhas (tabelas criadas na migração 0032).

export type CampanhaTipo = "ao_vivo" | "disparo";
export type CampanhaStatus = "rascunho" | "agendada" | "enviando" | "concluida" | "cancelada";

/** Filtros de audiência de uma campanha de disparo. Gravados em
 *  `atendimento_campaigns.publico` para permitir recalcular depois. */
export interface PublicoDisparo {
  modo: "disparo";
  etapas: LeadStage[];
  origens: LeadOrigin[];
  /** Só contatos que têm alguma conversa aberta no atendimento. */
  somenteConversaAberta: boolean;
  /** Ignora contatos marcados como bloqueados. */
  ignorarBloqueados: boolean;
  /** Quantos alvos o último cálculo encontrou (para exibir sem consultar). */
  totalCalculado?: number;
}

/** Condições de exibição de uma campanha ao vivo no widget do site. */
export interface PublicoAoVivo {
  modo: "ao_vivo";
  urlContem: string;
  tempoNaPaginaSeg: number;
}

export type PublicoCampanha = PublicoDisparo | PublicoAoVivo;

export interface Campanha {
  id: string;
  nome: string;
  tipo: CampanhaTipo;
  inbox_id: string | null;
  mensagem: string | null;
  publico: PublicoCampanha | unknown[] | null;
  agendado_para: string | null;
  status: CampanhaStatus;
  enviados: number;
  falhas: number;
  criado_por: string | null;
  created_at: string;
}

export interface CampanhaAlvoResumo {
  campaign_id: string;
  status: "pendente" | "enviado" | "falha";
}

export interface CaixaOpcao {
  id: string;
  nome: string;
  canal: string;
}

export const PUBLICO_DISPARO_VAZIO: PublicoDisparo = {
  modo: "disparo",
  etapas: [],
  origens: [],
  somenteConversaAberta: false,
  ignorarBloqueados: true,
};

export const PUBLICO_AO_VIVO_VAZIO: PublicoAoVivo = {
  modo: "ao_vivo",
  urlContem: "",
  tempoNaPaginaSeg: 15,
};

/** Lê o jsonb `publico` com tolerância: campanhas antigas gravaram `[]`. */
export function lerPublicoDisparo(valor: unknown): PublicoDisparo {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const v = valor as Partial<PublicoDisparo>;
    return {
      modo: "disparo",
      etapas: Array.isArray(v.etapas) ? v.etapas : [],
      origens: Array.isArray(v.origens) ? v.origens : [],
      somenteConversaAberta: Boolean(v.somenteConversaAberta),
      ignorarBloqueados: v.ignorarBloqueados !== false,
      totalCalculado: typeof v.totalCalculado === "number" ? v.totalCalculado : undefined,
    };
  }
  return { ...PUBLICO_DISPARO_VAZIO };
}

export function lerPublicoAoVivo(valor: unknown): PublicoAoVivo {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const v = valor as Partial<PublicoAoVivo>;
    return {
      modo: "ao_vivo",
      urlContem: typeof v.urlContem === "string" ? v.urlContem : "",
      tempoNaPaginaSeg: typeof v.tempoNaPaginaSeg === "number" ? v.tempoNaPaginaSeg : 15,
    };
  }
  return { ...PUBLICO_AO_VIVO_VAZIO };
}
