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
  | "sitio" | "chacara" | "rancho" | "comercial" | "galpao" | "rural" | "outros";

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

export interface Corretor {
  id: string;
  nome: string;
  cpf_cnpj: string | null;
  creci: string | null;
  telefone: string | null;
  email: string | null;
  observacoes: string | null;
  // Vínculo opcional ao usuário do sistema (quem tem login). Nulo = corretor
  // parceiro sem acesso ao sistema.
  user_id: string | null;
  ativo: boolean;
  created_by: string | null;
  created_at: string;
}

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
  /** Libera o sistema de Atendimento (atendimento.<dominio>), independente do setor. */
  atendimento_access: boolean;
  /** Assinatura anexada às respostas do agente no atendimento. */
  assinatura: string | null;
  /** Tema preferido do atendimento (persistido no perfil). */
  atendimento_tema: ThemePreference;
  disponibilidade: AgentAvailability;
  notificacoes: Record<string, boolean>;
  created_at: string;
  updated_at: string;
}

export type ThemePreference = "claro" | "escuro" | "sistema";
export type AgentAvailability = "online" | "ocupado" | "ausente" | "offline";

export const AVAILABILITY_LABELS: Record<AgentAvailability, string> = {
  online: "Disponível",
  ocupado: "Ocupado",
  ausente: "Ausente",
  offline: "Offline",
};

export const AVAILABILITY_DOT: Record<AgentAvailability, string> = {
  online: "bg-emerald-500",
  ocupado: "bg-red-500",
  ausente: "bg-amber-500",
  offline: "bg-gray-400",
};

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
  fazenda: "Fazenda", sitio: "Sítio", chacara: "Chácara", rancho: "Rancho",
  comercial: "Comercial",
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
  { label: "Ranchos",     types: ["rancho"] },
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

// =====================================================================
// Atendimento omnichannel (conversas + mensagens) — migration 0025
// =====================================================================
export type ConversationChannel = "whatsapp" | "instagram" | "facebook" | "messenger";
export type ConversationStatus = "aberta" | "pendente" | "resolvida" | "adiada";
export type ConversationPriority = "baixa" | "media" | "alta" | "urgente";
export type MessageDirecao = "in" | "out";
export type MessageRemetente = "cliente" | "atendente" | "sistema" | "ia";
export type MessageTipo =
  | "texto" | "imagem" | "audio" | "documento" | "video" | "template" | "sistema";
export type MessageStatus = "recebida" | "enviada" | "entregue" | "lida" | "falha";

export interface Conversation {
  id: string;
  canal: ConversationChannel;
  external_id: string;
  lead_id: string | null;
  contato_nome: string | null;
  contato_telefone: string | null;
  setor_responsavel: Sector | null;
  responsavel_id: string | null;
  status: ConversationStatus;
  tags: string[];
  last_message_at: string;
  last_message_preview: string | null;
  unread_count: number;
  resolvida_em: string | null;
  resolvida_por: string | null;
  primeira_resposta_em: string | null;
  created_at: string;
  /** Equipe responsável (além do agente) — migration 0030. */
  team_id: string | null;
  /** Prioridade; nula = sem prioridade definida (padrão do Chatwoot). */
  prioridade: ConversationPriority | null;
  /** Quando a conversa adiada volta sozinha para "aberta". */
  snoozed_until: string | null;
  inbox_id: string | null;
  custom_attributes: Record<string, unknown>;
  waiting_since: string | null;
  sla_policy_id: string | null;
  sla_first_response_due: string | null;
  sla_resolution_due: string | null;
  sla_violado: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  direcao: MessageDirecao;
  remetente: MessageRemetente;
  autor_id: string | null;
  tipo: MessageTipo;
  conteudo: string | null;
  media_url: string | null;
  external_id: string | null;
  raw_payload: Record<string, unknown> | null;
  status: MessageStatus;
  interna: boolean;
  created_at: string;
  media_nome: string | null;
  media_mime: string | null;
  media_tamanho: number | null;
  reply_to_id: string | null;
  mentions: string[];
}

export interface CannedResponse {
  id: string;
  atalho: string;
  titulo: string;
  conteudo: string;
  criado_por: string | null;
  created_at: string;
}

/** Item leve para o seletor de responsável (atendentes). */
export interface AgentOption {
  id: string;
  nome: string;
}

export interface AtendimentoLabel {
  id: string;
  nome: string;
  cor: string;
  created_at: string;
}

export interface AtendimentoTeam {
  id: string;
  nome: string;
  descricao: string | null;
  created_at: string;
}

// ===== Caixas de entrada (inboxes) — migration 0031 ==================
export type InboxChannel =
  | "whatsapp" | "instagram" | "facebook" | "messenger"
  | "telegram" | "email" | "sms" | "site" | "api";

export interface AtendimentoInbox {
  id: string;
  nome: string;
  canal: InboxChannel;
  channel_id: string | null;
  saudacao_ativa: boolean;
  saudacao_texto: string | null;
  mensagem_ausencia: string | null;
  auto_atribuicao: boolean;
  auto_atribuicao_limite: number;
  csat_ativo: boolean;
  csat_mensagem: string | null;
  pre_chat_ativo: boolean;
  pre_chat_campos: PreChatField[];
  horario_comercial_ativo: boolean;
  fuso: string;
  permite_responder_apos_resolver: boolean;
  bloquear_conversa_encerrada: boolean;
  widget_cor: string | null;
  widget_token: string | null;
  ativo: boolean;
  created_at: string;
}

export interface PreChatField {
  chave: string;
  rotulo: string;
  tipo: "texto" | "email" | "telefone" | "lista";
  obrigatorio: boolean;
  opcoes?: string[];
}

export interface BusinessHour {
  id: string;
  inbox_id: string;
  dia_semana: number; // 0 = domingo … 6 = sábado
  aberto: boolean;
  abre: string; // "08:00"
  fecha: string; // "18:00"
}

export const WEEKDAY_LABELS = [
  "Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado",
] as const;

export interface SlaPolicy {
  id: string;
  nome: string;
  descricao: string | null;
  primeira_resposta_min: number | null;
  proxima_resposta_min: number | null;
  resolucao_min: number | null;
  apenas_horario_comercial: boolean;
  created_at: string;
}

export interface CsatResponse {
  id: string;
  conversation_id: string;
  agente_id: string | null;
  nota: number | null;
  comentario: string | null;
  enviado_em: string;
  respondido_em: string | null;
}

// ===== Macros e automações ===========================================
export type MacroActionType =
  | "atribuir_agente" | "atribuir_equipe" | "mudar_status" | "mudar_prioridade"
  | "adicionar_etiqueta" | "remover_etiqueta" | "enviar_mensagem" | "adicionar_nota";

export interface MacroAction {
  tipo: MacroActionType;
  valor: string;
}

export const MACRO_ACTION_LABELS: Record<MacroActionType, string> = {
  atribuir_agente: "Atribuir a um agente",
  atribuir_equipe: "Atribuir a uma equipe",
  mudar_status: "Mudar o status",
  mudar_prioridade: "Mudar a prioridade",
  adicionar_etiqueta: "Adicionar etiqueta",
  remover_etiqueta: "Remover etiqueta",
  enviar_mensagem: "Enviar mensagem ao cliente",
  adicionar_nota: "Adicionar nota interna",
};

export interface AtendimentoMacro {
  id: string;
  nome: string;
  descricao: string | null;
  visibilidade: "global" | "pessoal";
  acoes: MacroAction[];
  criado_por: string | null;
  created_at: string;
}

export type AutomationEvent =
  | "conversa_criada" | "conversa_atualizada" | "mensagem_criada" | "conversa_resolvida";

export const AUTOMATION_EVENT_LABELS: Record<AutomationEvent, string> = {
  conversa_criada: "Quando a conversa é criada",
  conversa_atualizada: "Quando a conversa é atualizada",
  mensagem_criada: "Quando uma mensagem chega",
  conversa_resolvida: "Quando a conversa é resolvida",
};

export type ConditionOperator =
  | "igual" | "diferente" | "contem" | "nao_contem" | "existe" | "nao_existe";

export const CONDITION_OPERATOR_LABELS: Record<ConditionOperator, string> = {
  igual: "é igual a",
  diferente: "é diferente de",
  contem: "contém",
  nao_contem: "não contém",
  existe: "está preenchido",
  nao_existe: "está vazio",
};

export interface AutomationCondition {
  campo: string;
  operador: ConditionOperator;
  valor: string;
}

export interface AtendimentoAutomation {
  id: string;
  nome: string;
  descricao: string | null;
  evento: AutomationEvent;
  condicoes: AutomationCondition[];
  acoes: MacroAction[];
  ativo: boolean;
  criado_por: string | null;
  created_at: string;
}

// ===== Atributos personalizados ======================================
export type CustomAttributeType =
  | "texto" | "numero" | "link" | "data" | "lista" | "booleano";

export const CUSTOM_ATTRIBUTE_TYPE_LABELS: Record<CustomAttributeType, string> = {
  texto: "Texto",
  numero: "Número",
  link: "Link",
  data: "Data",
  lista: "Lista de opções",
  booleano: "Sim / Não",
};

export interface CustomAttributeDef {
  id: string;
  chave: string;
  nome: string;
  descricao: string | null;
  tipo: CustomAttributeType;
  opcoes: string[];
  aplica_a: "conversa" | "contato";
  created_at: string;
}

// ===== Empresas, notas de contato e segmentos ========================
export interface AtendimentoCompany {
  id: string;
  nome: string;
  dominio: string | null;
  telefone: string | null;
  email: string | null;
  site: string | null;
  cidade: string | null;
  uf: string | null;
  setor: string | null;
  tamanho: string | null;
  observacoes: string | null;
  custom_attributes: Record<string, unknown>;
  created_by: string | null;
  created_at: string;
}

export interface ContactNote {
  id: string;
  lead_id: string;
  texto: string;
  autor_id: string | null;
  created_at: string;
}

export interface AtendimentoSegment {
  id: string;
  nome: string;
  tipo: "conversa" | "contato";
  filtros: AutomationCondition[];
  visibilidade: "global" | "pessoal";
  criado_por: string | null;
  created_at: string;
}

export const PRIORITY_LABELS: Record<ConversationPriority, string> = {
  urgente: "Urgente",
  alta: "Alta",
  media: "Média",
  baixa: "Baixa",
};

/** Cor de cada prioridade (badge). Ordem de urgência decrescente. */
export const PRIORITY_ORDER: ConversationPriority[] = ["urgente", "alta", "media", "baixa"];

export const PRIORITY_CLASSES: Record<ConversationPriority, string> = {
  urgente: "bg-red-500/15 text-red-600 dark:text-red-400 border-red-500/30",
  alta: "bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30",
  media: "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
  baixa: "bg-sky-500/15 text-sky-600 dark:text-sky-400 border-sky-500/30",
};

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
};

// ===== Canais do Atendimento (como o WhatsApp é conectado) ===========
// Três modos, com trade-offs bem diferentes — ver 0027_atendimento_canais.sql.
export type ChannelProvider = "evolution" | "cloud_api" | "cloud_api_coexistence";

export type ChannelStatus =
  | "desconectado"
  | "aguardando_qr"
  | "conectando"
  | "conectado"
  | "erro";

/** Canal sem credenciais — o que a UI do Atendimento enxerga. */
export interface AtendimentoChannelSafe {
  id: string;
  nome: string;
  canal: ConversationChannel;
  provedor: ChannelProvider;
  status: ChannelStatus;
  telefone: string | null;
  ultimo_erro: string | null;
  conectado_em: string | null;
  created_at: string;
  instance_name: string | null;
}

export const CHANNEL_PROVIDER_LABELS: Record<ChannelProvider, string> = {
  evolution: "Evolution API (QR Code)",
  cloud_api: "API Oficial da Meta",
  cloud_api_coexistence: "API Oficial — mantendo o número no celular",
};

export const CHANNEL_STATUS_LABELS: Record<ChannelStatus, string> = {
  desconectado: "Desconectado",
  aguardando_qr: "Aguardando leitura do QR Code",
  conectando: "Conectando",
  conectado: "Conectado",
  erro: "Erro",
};

export const CONVERSATION_STATUS_LABELS: Record<ConversationStatus, string> = {
  aberta: "Aberta",
  pendente: "Pendente",
  resolvida: "Resolvida",
  adiada: "Adiada",
};

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
