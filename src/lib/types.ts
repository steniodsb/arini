export type Sector =
  | "captacao"
  | "marketing"
  | "administrativo"
  | "juridico"
  | "recepcao"
  | "financeiro"
  | "aluguel"
  | "admin_central";

export type PropertyType =
  | "casa" | "apartamento" | "lote" | "terreno" | "loteamento" | "fazenda"
  | "sitio" | "chacara" | "comercial" | "galpao" | "rural" | "outros";

export type PropertyCategory = "venda" | "locacao" | "venda_locacao" | "rural" | "arrendamento";

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
  | "indicacao" | "trafego_pago" | "placa" | "portal" | "tiktok" | "messenger" | "outros";

export type ClientType =
  | "comprador" | "vendedor" | "locatario" | "locador" | "proprietario"
  | "fornecedor" | "parceiro" | "investidor" | "outro";

export type SocialPlatform = "instagram" | "facebook" | "whatsapp" | "tiktok";

export type TimeEntryType = "entrada" | "intervalo_inicio" | "intervalo_fim" | "saida";

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
  maps_url: string | null;
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
  foto_principal_url: string | null;
  foto_principal_path: string | null;
  enviado_para_marketing: boolean;
  enviado_marketing_em: string | null;
  enviado_marketing_por: string | null;
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
  administrativo: "Administrativo (Gerência)",
  juridico: "Jurídico",
  recepcao: "Recepção / Leads",
  financeiro: "Financeiro",
  aluguel: "Gestão de Aluguéis",
  admin_central: "Diretoria",
};

// =====================================================================
// Gestão de Aluguéis (locação)
// =====================================================================
export type LeaseContractStatus = "ativo" | "encerrado" | "suspenso";
export type LeasePaymentStatus = "pendente" | "pago" | "atrasado" | "cancelado";
export type LeaseRepasseStatus = "pendente" | "repassado" | "retido";

export interface LeaseContract {
  id: string;
  property_id: string;
  owner_id: string | null;
  client_id: string | null;
  inquilino_nome: string | null;
  inquilino_telefone: string | null;
  valor_aluguel: number;
  taxa_administracao: number;
  dia_vencimento: number;
  dias_repasse: number;
  data_inicio: string;
  data_fim: string | null;
  contrato_url: string | null;
  status: LeaseContractStatus;
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface LeasePayment {
  id: string;
  contract_id: string;
  competencia: string;
  vencimento: string;
  valor: number;
  status: LeasePaymentStatus;
  pago_em: string | null;
  repasse_vencimento: string | null;
  valor_repasse: number | null;
  repasse_status: LeaseRepasseStatus;
  repasse_em: string | null;
  conta_id: string | null;
  observacoes: string | null;
  created_at: string;
}

export interface SectorObservation {
  id: string;
  entity_table: string;
  entity_id: string;
  target_sector: Sector;
  autor_id: string | null;
  autor_sector: Sector | null;
  texto: string;
  resolvido: boolean;
  resolvido_por: string | null;
  resolvido_em: string | null;
  created_at: string;
}

export const PROPERTY_TYPE_LABELS: Record<PropertyType, string> = {
  casa: "Casa", apartamento: "Apartamento", lote: "Lote", terreno: "Terreno",
  loteamento: "Loteamento",
  fazenda: "Fazenda", sitio: "Sítio", chacara: "Chácara", comercial: "Comercial",
  galpao: "Galpão", rural: "Rural", outros: "Outros",
};

export const CATEGORY_LABELS: Record<PropertyCategory, string> = {
  venda: "Venda",
  locacao: "Aluguel",
  venda_locacao: "Venda / Aluguel",
  rural: "Rural",
  arrendamento: "Arrendamento",
};

// Para o menu público — agrupamento simplificado de tipos
export const TYPE_NAV_GROUPS: { label: string; types: PropertyType[] }[] = [
  { label: "Casas",       types: ["casa"] },
  { label: "Apartamentos", types: ["apartamento"] },
  { label: "Rurais",      types: ["fazenda", "sitio", "chacara", "rural"] },
  { label: "Terrenos",    types: ["terreno", "lote"] },
  { label: "Loteamentos", types: ["loteamento"] },
  { label: "Comerciais",  types: ["comercial", "galpao"] },
];

// Para o menu público — categorias clicáveis
export const CATEGORY_NAV: { label: string; key: PropertyCategory }[] = [
  { label: "Venda",        key: "venda" },
  { label: "Aluguel",      key: "locacao" },
  { label: "Arrendamento", key: "arrendamento" },
];

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
  "indicacao","trafego_pago","placa","portal","tiktok","messenger","outros"
];

export const CLIENT_TYPES: ClientType[] = [
  "comprador","vendedor","locatario","locador","proprietario",
  "fornecedor","parceiro","investidor","outro",
];

export const CLIENT_TYPE_LABELS: Record<ClientType, string> = {
  comprador: "Comprador",
  vendedor: "Vendedor",
  locatario: "Locatário",
  locador: "Locador",
  proprietario: "Proprietário",
  fornecedor: "Fornecedor",
  parceiro: "Parceiro",
  investidor: "Investidor",
  outro: "Outro",
};

export interface Client {
  id: string;
  nome: string;
  tipo: ClientType;
  cpf_cnpj: string | null;
  telefone: string | null;
  whatsapp: string | null;
  email: string | null;
  endereco: string | null;
  cidade: string | null;
  uf: string | null;
  observacoes: string | null;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface PropertyClient {
  id: string;
  property_id: string;
  client_id: string;
  papel: ClientType;
  observacao: string | null;
  created_by: string | null;
  created_at: string;
}

export interface ClientDocument {
  id: string;
  client_id: string;
  tipo: string;
  nome: string | null;
  url: string;
  storage_path: string | null;
  status: "pendente" | "entregue" | "assinado" | "cancelado";
  observacoes: string | null;
  created_by: string | null;
  created_at: string;
}

export interface BankAccount {
  id: string;
  nome: string;
  banco: string | null;
  agencia: string | null;
  conta: string | null;
  tipo: "conta_corrente" | "poupanca" | "caixa" | "investimento";
  saldo_inicial: number;
  ativo: boolean;
  created_at: string;
}

export interface BankAccountBalance {
  id: string;
  nome: string;
  banco: string | null;
  tipo: string;
  ativo: boolean;
  saldo_inicial: number;
  saldo_atual: number;
}

export interface TimeEntry {
  id: string;
  user_id: string;
  tipo: TimeEntryType;
  registrado_em: string;
  origem: string;
  observacoes: string | null;
  created_at: string;
}

export const TIME_ENTRY_LABELS: Record<TimeEntryType, string> = {
  entrada: "Entrada",
  intervalo_inicio: "Saída p/ intervalo",
  intervalo_fim: "Retorno do intervalo",
  saida: "Saída",
};

export interface MarketingContent {
  id: string;
  campaign_id: string;
  property_id: string | null;
  tipo: string;
  titulo: string | null;
  data_publicacao: string | null;
  publicado: boolean;
  observacoes: string | null;
  created_at: string;
}

export interface MarketingMedia {
  id: string;
  property_id: string;
  campaign_id: string | null;
  fase: "bruta" | "editada";
  tipo: string;
  url: string;
  storage_path: string | null;
  ordem: number;
  created_at: string;
}
