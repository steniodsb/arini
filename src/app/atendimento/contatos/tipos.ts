import { LEAD_STAGES, type CustomAttributeDef } from "@/lib/types";

// =====================================================================
// Tipos e helpers compartilhados entre a lista de contatos, o drawer de
// detalhe e a rota de API. Ficam num módulo próprio para evitar import
// circular entre ContatosList e ContatoDetalhe.
// =====================================================================

/**
 * Contato = linha de `leads` (no Chatwoot "contato" é pessoa; aqui reusamos
 * o lead do CRM). Só as colunas que a tela realmente usa.
 */
export interface ContatoRow {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  origem: string;
  stage: string;
  observacoes: string | null;
  company_id: string | null;
  custom_attributes: Record<string, unknown>;
  bloqueado: boolean;
  avatar_url: string | null;
  created_at: string;
  ultima_interacao_em: string | null;
}

export interface EmpresaOpcao {
  id: string;
  nome: string;
}

export interface AgenteOpcao {
  id: string;
  nome: string;
}

/** Campos graváveis de um contato (o que a rota de API aceita). */
export interface ContatoInput {
  nome?: string;
  telefone?: string | null;
  whatsapp?: string | null;
  email?: string | null;
  origem?: string;
  stage?: string;
  observacoes?: string | null;
  company_id?: string | null;
  custom_attributes?: Record<string, unknown>;
  bloqueado?: boolean;
}

/** Colunas que o importador de CSV sabe preencher. */
export const CAMPOS_CSV = [
  { chave: "nome", label: "Nome" },
  { chave: "telefone", label: "Telefone" },
  { chave: "whatsapp", label: "WhatsApp" },
  { chave: "email", label: "E-mail" },
  { chave: "origem", label: "Origem" },
] as const;

export type CampoCSV = (typeof CAMPOS_CSV)[number]["chave"];

export const ORIGEM_LABELS: Record<string, string> = {
  instagram: "Instagram",
  facebook: "Facebook",
  site: "Site",
  whatsapp: "WhatsApp",
  ligacao: "Ligação",
  indicacao: "Indicação",
  trafego_pago: "Tráfego pago",
  placa: "Placa",
  portal: "Portal",
  tiktok: "TikTok",
  messenger: "Messenger",
  outros: "Outros",
};

export function rotuloOrigem(origem: string | null | undefined): string {
  if (!origem) return "—";
  return ORIGEM_LABELS[origem] ?? origem;
}

export function rotuloEtapa(stage: string | null | undefined): string {
  if (!stage) return "—";
  return LEAD_STAGES.find((s) => s.key === stage)?.label ?? stage;
}

export function corEtapa(stage: string | null | undefined): string {
  return LEAD_STAGES.find((s) => s.key === stage)?.color ?? "bg-muted-foreground/40";
}

export function inicialDe(nome: string | null | undefined): string {
  const t = (nome ?? "").trim();
  return t ? t.charAt(0).toUpperCase() : "?";
}

/**
 * Converte o valor cru do jsonb para texto legível conforme o tipo definido
 * em `atendimento_custom_attributes` (o jsonb aceita qualquer coisa, então
 * normalizamos aqui e não em cada tela).
 */
export function formatarAtributo(def: CustomAttributeDef, valor: unknown): string {
  if (valor === null || valor === undefined || valor === "") return "—";
  switch (def.tipo) {
    case "booleano":
      return valor ? "Sim" : "Não";
    case "numero":
      return typeof valor === "number" ? valor.toLocaleString("pt-BR") : String(valor);
    case "data": {
      const d = new Date(String(valor));
      return Number.isNaN(d.getTime())
        ? String(valor)
        : new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "UTC" }).format(d);
    }
    default:
      return String(valor);
  }
}

/**
 * Descobre o separador do CSV olhando a primeira linha: planilhas em pt-BR
 * exportam com ";" com muita frequência, e adivinhar errado quebra tudo.
 */
export function detectarSeparador(texto: string): string {
  const primeira = texto.split(/\r?\n/, 1)[0] ?? "";
  const virgulas = (primeira.match(/,/g) ?? []).length;
  const pontoVirgula = (primeira.match(/;/g) ?? []).length;
  const tabs = (primeira.match(/\t/g) ?? []).length;
  if (tabs > virgulas && tabs > pontoVirgula) return "\t";
  return pontoVirgula > virgulas ? ";" : ",";
}

/**
 * Parser de CSV simples porém correto no essencial: respeita aspas duplas
 * (inclusive `""` escapado e quebra de linha dentro do campo). Evita puxar
 * uma dependência só para importar contato.
 */
export function parseCSV(texto: string, separador = detectarSeparador(texto)): string[][] {
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = "";
  let emAspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (emAspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          emAspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"') {
      emAspas = true;
    } else if (c === separador) {
      linha.push(campo);
      campo = "";
    } else if (c === "\n") {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = "";
    } else if (c !== "\r") {
      campo += c;
    }
  }
  if (campo !== "" || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }
  // Descarta linhas totalmente vazias (última quebra de linha do arquivo).
  return linhas.filter((l) => l.some((v) => v.trim() !== ""));
}
