export type Sector =
  | "captacao"
  | "marketing"
  | "administrativo"
  | "juridico"
  | "recepcao"
  | "financeiro"
  | "admin_central";

export type PropertyType =
  | "casa" | "apartamento" | "lote" | "terreno" | "fazenda"
  | "sitio" | "chacara" | "comercial" | "galpao" | "rural" | "outros";

export type PropertyCategory = "venda" | "locacao" | "venda_locacao" | "rural";

export type PropertyStatus =
  | "rascunho"
  | "aguardando_aprovacao_captacao"
  | "aprovado_captacao"
  | "em_marketing"
  | "aguardando_aprovacao_marketing"
  | "publicado"
  | "reservado"
  | "vendido"
  | "locado"
  | "inativo";

export type LegalStatus =
  | "nao_iniciado" | "em_analise" | "pendente" | "aprovado" | "reprovado";

export type LeadStage =
  | "novo" | "atendimento" | "agendado" | "visitou"
  | "proposta" | "negociacao" | "fechado" | "perdido" | "pos_venda";

export type LeadOrigin =
  | "instagram" | "facebook" | "site" | "whatsapp" | "ligacao"
  | "indicacao" | "trafego_pago" | "placa" | "portal" | "outros";

export type ApprovalStage =
  | "captacao" | "marketing" | "juridico"
  | "financeiro_imovel" | "financeiro_empresarial" | "outro";

export type ApprovalStatus = "pendente" | "aprovado" | "reprovado" | "corrigir";

export type ExpenseStatus = "pendente" | "pago" | "vencido" | "renegociado";
export type CommissionStatus = "pendente" | "parcial" | "pago";
export type OperationType = "venda" | "locacao" | "permuta" | "parceria";

export interface Profile {
  id: string;
  nome: string;
  email: string;
  telefone: string | null;
  sector: Sector;
  is_admin_central: boolean;
  ativo: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Property {
  id: string;
  codigo: string;
  type: PropertyType;
  category: PropertyCategory;
  status: PropertyStatus;
  titulo: string | null;
  descricao: string | null;
  endereco: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  cep: string | null;
  lat: number | null;
  lng: number | null;
  valor: number | null;
  valor_fechado: number | null;
  area_total: number | null;
  area_construida: number | null;
  dormitorios: number | null;
  suites: number | null;
  banheiros: number | null;
  vagas: number | null;
  ano_construcao: number | null;
  captador_id: string | null;
  owner_id: string | null;
  exclusividade: boolean;
  exclusividade_de: string | null;
  exclusividade_prazo: string | null;
  exclusividade_contrato_url: string | null;
  placa_status: string | null;
  data_entrada: string;
  data_fechamento: string | null;
  fonte_leads: string | null;
  slug_publico: string | null;
  publicado_no_site: boolean;
  destaque: boolean;
  created_at: string;
  updated_at: string;
}

export interface PropertyMedia {
  id: string;
  property_id: string;
  tipo: "imagem" | "video" | "tour" | "reels" | "drone";
  url: string;
  storage_path: string | null;
  ordem: number;
  captado_com: string | null;
  tamanho: number | null;
  capa: boolean;
  created_at: string;
}

export interface Lead {
  id: string;
  nome: string;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  origem: LeadOrigin;
  interesse: Record<string, boolean>;
  imovel_interesse_id: string | null;
  stage: LeadStage;
  corretor_id: string | null;
  perfil: string | null;
  faixa_valor_min: number | null;
  faixa_valor_max: number | null;
  urgencia: string | null;
  observacoes: string | null;
  created_at: string;
  ultima_interacao_em: string;
}

export interface Approval {
  id: string;
  entity_table: string;
  entity_id: string;
  stage: ApprovalStage;
  status: ApprovalStatus;
  solicitado_por: string | null;
  aprovador_id: string | null;
  comentario: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
  decidido_em: string | null;
}

export const SECTOR_LABELS: Record<Sector, string> = {
  captacao: "Captação",
  marketing: "Marketing",
  administrativo: "Administrativo",
  juridico: "Jurídico",
  recepcao: "Recepção / Leads",
  financeiro: "Financeiro",
  admin_central: "Administração Central",
};

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  casa: "Casa", apartamento: "Apartamento", lote: "Lote", terreno: "Terreno",
  fazenda: "Fazenda", sitio: "Sítio", chacara: "Chácara", comercial: "Comercial",
  galpao: "Galpão", rural: "Rural", outros: "Outros",
};

export const CATEGORY_LABELS: Record<PropertyCategory, string> = {
  venda: "Venda", locacao: "Locação", venda_locacao: "Venda / Locação", rural: "Rural",
};

export const STATUS_LABELS: Record<PropertyStatus, string> = {
  rascunho: "Rascunho",
  aguardando_aprovacao_captacao: "Aguardando Aprovação (Captação)",
  aprovado_captacao: "Aprovado pela Administração",
  em_marketing: "Em Marketing",
  aguardando_aprovacao_marketing: "Aguardando Aprovação (Marketing)",
  publicado: "Publicado",
  reservado: "Reservado",
  vendido: "Vendido",
  locado: "Locado",
  inativo: "Inativo",
};

export const LEAD_STAGES: { key: LeadStage; label: string; color: string }[] = [
  { key: "novo", label: "Novo", color: "bg-blue-500" },
  { key: "atendimento", label: "Em Atendimento", color: "bg-indigo-500" },
  { key: "agendado", label: "Agendado", color: "bg-purple-500" },
  { key: "visitou", label: "Visitou", color: "bg-pink-500" },
  { key: "proposta", label: "Proposta", color: "bg-yellow-500" },
  { key: "negociacao", label: "Negociação", color: "bg-orange-500" },
  { key: "fechado", label: "Fechado", color: "bg-emerald-500" },
  { key: "perdido", label: "Perdido", color: "bg-red-500" },
  { key: "pos_venda", label: "Pós-venda", color: "bg-teal-500" },
];

export const LEAD_ORIGINS: LeadOrigin[] = [
  "instagram","facebook","site","whatsapp","ligacao",
  "indicacao","trafego_pago","placa","portal","outros"
];
