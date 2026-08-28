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
  | "indicacao" | "trafego_pago" | "placa" | "portal" | "tiktok" | "messenger"
  | "telegram" | "email" | "outros";

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
  /**
   * Cargo/função exibido ao lado do nome — "Corretora", "Gerente de
   * Locação". É IDENTIFICAÇÃO, não permissão: quem decide acesso é
   * `sector` (CRM) e `atendimento_papel` (caixa). Migration 0043.
   */
  cargo: string | null;
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
  /**
   * Papel no ATENDIMENTO — independente do `sector` do CRM. O setor diz o
   * que a pessoa faz no CRM de imóveis; isto diz quem tria, quem atende e
   * quem administra. Misturar os dois foi o erro do modelo anterior.
   */
  atendimento_papel: AtendimentoPapel;
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
  /** "Não é lead": sai do funil sem sair do banco. Ver 0048_leads_descarte.sql. */
  descartado: boolean;
  descartado_em: string | null;
  descartado_por: string | null;
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
export type ConversationChannel =
  | "whatsapp" | "instagram" | "facebook" | "messenger"
  | "telegram" | "email" | "sms" | "site" | "api";
export type ConversationStatus = "aberta" | "pendente" | "resolvida" | "adiada";
export type ConversationPriority = "baixa" | "media" | "alta" | "urgente";
export type MessageDirecao = "in" | "out";
export type MessageRemetente = "cliente" | "atendente" | "sistema" | "ia" | "bot";
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
  /** Canal físico por onde a conversa entrou — migration 0027. */
  channel_id: string | null;
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
  /** Nulo = ainda na CAIXA CENTRAL, esperando triagem (0040). */
  triada_em: string | null;
  triada_por: string | null;
  /** O agente marcou de volta como não lida — o contador não serve p/ isso. */
  marcada_nao_lida: boolean;
  /** Intenção e resumo detectados pela IA (0034). */
  ia_intencao: string | null;
  ia_resumo: string | null;
  /** Estado do agent bot NESTA conversa (0037). */
  bot_status: BotStatus;
  bot_id: string | null;
  bot_transferida_em: string | null;
}

export type BotStatus = "sem_bot" | "ativo" | "transferida";

export const BOT_STATUS_LABELS: Record<BotStatus, string> = {
  sem_bot: "Sem bot",
  ativo: "Bot conduzindo",
  transferida: "Transferida para humano",
};

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
  /** Apagar é soft delete: o rastro fica, o conteúdo some (ver 0035). */
  apagada_em: string | null;
  apagada_por: string | null;
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
  /**
   * Cargo do colaborador (migration 0043). Opcional porque nem toda tela
   * que monta um `AgentOption` precisa dele — quem seleciona só
   * `id, nome` continua compilando e cai no rótulo sem cargo.
   */
  cargo?: string | null;
}

/**
 * "Ana Paula · Corretora" — o rótulo de identificação de um colaborador.
 *
 * Existe porque o nome sozinho não basta na hora de assumir um lead: com
 * três Anas no time, o histórico de transferência e o seletor de
 * responsável viram adivinhação. Sem cargo cadastrado devolve só o nome,
 * então dá para usar em qualquer lugar sem checar antes.
 */
export function rotuloAgente(a: { nome: string; cargo?: string | null }): string {
  const cargo = a.cargo?.trim();
  return cargo ? `${a.nome} · ${cargo}` : a.nome;
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
  /** Política de SLA da caixa — o trigger usa para calcular os prazos (0033). */
  sla_policy_id: string | null;
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

/**
 * Bolinha cheia da prioridade. Existe porque numa lista densa o chip
 * inteiro rouba a atenção do nome do contato: onde cabe pouco, entra a
 * cor sozinha; onde cabe texto, entra o chip de PRIORITY_CLASSES.
 */
export const PRIORITY_DOT: Record<ConversationPriority, string> = {
  urgente: "bg-red-500",
  alta: "bg-orange-500",
  media: "bg-amber-500",
  baixa: "bg-sky-500",
};

/** Cor de cada STATUS da conversa — mesma gramática visual da prioridade. */
export const STATUS_CLASSES: Record<ConversationStatus, string> = {
  aberta: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  pendente: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  resolvida: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/30",
  adiada: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

/**
 * Os mesmos significados em HEX, para gráfico.
 *
 * Recharts não entende classe do Tailwind — e sem estes mapas o relatório
 * pintava "Urgente" com a cor genérica da paleta, enquanto a caixa de
 * entrada pintava de vermelho. Cor que muda de tela para tela deixa de
 * ser informação e vira decoração.
 */
export const PRIORITY_HEX: Record<ConversationPriority, string> = {
  urgente: "#ef4444",
  alta: "#f97316",
  media: "#f59e0b",
  baixa: "#0ea5e9",
};

export const STATUS_HEX: Record<ConversationStatus, string> = {
  aberta: "#10b981",
  pendente: "#0ea5e9",
  resolvida: "#94a3b8",
  adiada: "#f59e0b",
};

export const STATUS_DOT: Record<ConversationStatus, string> = {
  aberta: "bg-emerald-500",
  pendente: "bg-sky-500",
  resolvida: "bg-slate-400",
  adiada: "bg-amber-500",
};

export const CHANNEL_LABELS: Record<ConversationChannel, string> = {
  whatsapp: "WhatsApp",
  instagram: "Instagram",
  facebook: "Facebook",
  messenger: "Messenger",
  telegram: "Telegram",
  email: "E-mail",
  sms: "SMS",
  site: "Chat do site",
  api: "API",
};

// ===== Onda F — plataforma (migration 0034) ==========================

export type WebhookEvent =
  | "conversa_criada" | "conversa_atualizada" | "conversa_resolvida"
  | "mensagem_criada" | "contato_criado";

export const WEBHOOK_EVENT_LABELS: Record<WebhookEvent, string> = {
  conversa_criada: "Conversa criada",
  conversa_atualizada: "Conversa atualizada",
  conversa_resolvida: "Conversa resolvida",
  mensagem_criada: "Mensagem criada",
  contato_criado: "Contato criado",
};

export interface AtendimentoWebhook {
  id: string;
  nome: string;
  url: string;
  secret: string;
  eventos: WebhookEvent[];
  ativo: boolean;
  ultimo_status: number | null;
  ultimo_erro: string | null;
  ultimo_envio_em: string | null;
  falhas_seguidas: number;
  criado_por: string | null;
  created_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  evento: string;
  payload: Record<string, unknown> | null;
  status: number | null;
  erro: string | null;
  duracao_ms: number | null;
  created_at: string;
}

export type ApiScope = "leitura" | "escrita" | "admin";

export const API_SCOPE_LABELS: Record<ApiScope, string> = {
  leitura: "Leitura (listar conversas, contatos, relatórios)",
  escrita: "Escrita (enviar mensagem, criar contato, mudar status)",
  admin: "Administração (canais, agentes, configurações)",
};

export interface ApiToken {
  id: string;
  nome: string;
  prefixo: string;
  escopos: ApiScope[];
  ultimo_uso_em: string | null;
  expira_em: string | null;
  revogado: boolean;
  criado_por: string | null;
  created_at: string;
}

export interface AuditEntry {
  id: string;
  ator_id: string | null;
  ator_nome: string | null;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  detalhes: Record<string, unknown> | null;
  ip: string | null;
  created_at: string;
}

export interface WidgetSession {
  id: string;
  inbox_id: string;
  contact_token: string;
  conversation_id: string | null;
  nome: string | null;
  email: string | null;
  telefone: string | null;
  pre_chat: Record<string, string>;
  user_agent: string | null;
  referrer: string | null;
  ultima_atividade: string;
  created_at: string;
}

export type IaSuggestionType = "resposta" | "resumo" | "intencao";

export interface IaSugestao {
  id: string;
  conversation_id: string;
  baseada_em: string | null;
  tipo: IaSuggestionType;
  conteudo: string;
  modelo: string | null;
  usada: boolean;
  created_at: string;
}

// ===== Canais do Atendimento (como o WhatsApp é conectado) ===========
// Três modos, com trade-offs bem diferentes — ver 0027_atendimento_canais.sql.
export type ChannelProvider =
  | "evolution" | "cloud_api" | "cloud_api_coexistence"
  | "telegram_bot" | "email_smtp" | "sms_generico" | "widget" | "api_generica";

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
  telegram_bot: "Telegram (Bot API)",
  email_smtp: "E-mail (SMTP + IMAP)",
  sms_generico: "SMS (provedor genérico)",
  widget: "Chat do site (widget)",
  api_generica: "Canal via API",
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
  "indicacao","trafego_pago","placa","portal","tiktok","messenger",
  "telegram","email","outros"
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
  /** QUEM OPEROU. No terminal central é a conta da recepção, não a pessoa. */
  user_id: string;
  /** DE QUEM é o ponto. Ver 0049_ponto_colaboradores.sql. */
  colaborador_id: string | null;
  tipo: TimeEntryType;
  registrado_em: string;
  origem: string;
  observacoes: string | null;
  created_at: string;
}

/**
 * Pessoa que bate ponto — separada de `profiles` porque bater ponto não
 * exige login (o terminal central é uma máquina só, compartilhada).
 */
export interface Colaborador {
  id: string;
  nome: string;
  cpf: string | null;
  setor: Sector | null;
  cargo: string | null;
  profile_id: string | null;
  carga_horaria_min: number;
  almoco_inicio: string | null;
  almoco_min: number;
  pausa_inicio: string | null;
  pausa_min: number;
  /** 0 = domingo … 6 = sábado. */
  dias_semana: number[];
  codigo: string | null;
  ativo: boolean;
  created_at: string;
  updated_at: string;
}

/** O que o terminal enxerga: tudo menos o CPF. Ver a view `colaboradores_terminal`. */
export type ColaboradorTerminal = Pick<
  Colaborador,
  "id" | "nome" | "codigo" | "setor" | "cargo" | "carga_horaria_min" | "dias_semana"
>;

export const DIAS_SEMANA_LABELS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"] as const;

/** Escalas prontas — cobrem o que o Carlos citou ("segunda a sexta ou segunda a domingo"). */
export const ESCALAS: { key: string; label: string; dias: number[] }[] = [
  { key: "seg_sex", label: "Segunda a sexta", dias: [1, 2, 3, 4, 5] },
  { key: "seg_sab", label: "Segunda a sábado", dias: [1, 2, 3, 4, 5, 6] },
  { key: "seg_dom", label: "Segunda a domingo", dias: [0, 1, 2, 3, 4, 5, 6] },
];

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


// =====================================================================
// Onda G — participantes, templates, papéis, integrações (migration 0035)
// =====================================================================

export interface ConversationParticipant {
  conversation_id: string;
  profile_id: string;
  created_at: string;
}

export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";
export type TemplateStatus =
  | "local" | "PENDING" | "APPROVED" | "REJECTED" | "PAUSED" | "DISABLED";

export const TEMPLATE_CATEGORY_LABELS: Record<TemplateCategory, string> = {
  MARKETING: "Marketing (promoção, novidade)",
  UTILITY: "Utilidade (confirmação, atualização de pedido)",
  AUTHENTICATION: "Autenticação (código de verificação)",
};

export const TEMPLATE_STATUS_LABELS: Record<TemplateStatus, string> = {
  local: "Só aqui (não enviado à Meta)",
  PENDING: "Em análise na Meta",
  APPROVED: "Aprovado",
  REJECTED: "Rejeitado",
  PAUSED: "Pausado pela Meta",
  DISABLED: "Desativado",
};

export interface WhatsappTemplate {
  id: string;
  channel_id: string | null;
  nome: string;
  idioma: string;
  categoria: TemplateCategory;
  status: TemplateStatus;
  componentes: Record<string, unknown>[];
  corpo: string | null;
  variaveis: number;
  meta_id: string | null;
  motivo_rejeicao: string | null;
  sincronizado_em: string | null;
  criado_por: string | null;
  created_at: string;
}

/** Catálogo de permissões oferecido na tela de papéis. */
export const PERMISSOES: { chave: string; label: string; grupo: string }[] = [
  { chave: "conversa:ver_todas", label: "Ver todas as conversas", grupo: "Conversas" },
  { chave: "conversa:ver_proprias", label: "Ver apenas as próprias e as não atribuídas", grupo: "Conversas" },
  { chave: "conversa:atribuir", label: "Atribuir conversa a outro agente", grupo: "Conversas" },
  { chave: "conversa:excluir", label: "Excluir conversa", grupo: "Conversas" },
  { chave: "contato:ver", label: "Ver contatos", grupo: "Contatos" },
  { chave: "contato:editar", label: "Criar e editar contatos", grupo: "Contatos" },
  { chave: "contato:excluir", label: "Excluir contatos", grupo: "Contatos" },
  { chave: "relatorio:ver", label: "Ver relatórios", grupo: "Relatórios" },
  { chave: "relatorio:exportar", label: "Exportar relatórios", grupo: "Relatórios" },
  { chave: "config:ver", label: "Ver configurações", grupo: "Configurações" },
  { chave: "config:editar", label: "Editar configurações", grupo: "Configurações" },
  { chave: "canal:gerenciar", label: "Conectar e desconectar canais", grupo: "Configurações" },
  { chave: "agente:gerenciar", label: "Gerenciar agentes e equipes", grupo: "Configurações" },
];

export interface AtendimentoRole {
  id: string;
  nome: string;
  descricao: string | null;
  permissoes: string[];
  sistema: boolean;
  created_at: string;
}

export type IntegrationType =
  | "slack" | "dialogflow" | "webhook_app" | "dashboard_app" | "google_translate";

export const INTEGRATION_LABELS: Record<IntegrationType, string> = {
  slack: "Slack — espelha as conversas num canal",
  dialogflow: "Dialogflow — bot de triagem",
  webhook_app: "Aplicativo via webhook",
  dashboard_app: "Aplicativo do painel (iframe)",
  google_translate: "Google Tradutor",
};

export interface AtendimentoIntegration {
  id: string;
  tipo: IntegrationType;
  nome: string;
  config: Record<string, string>;
  ativo: boolean;
  ultimo_erro: string | null;
  created_at: string;
}

export interface DashboardApp {
  id: string;
  nome: string;
  url: string;
  ativo: boolean;
  ordem: number;
  created_at: string;
}

export interface AtendimentoSettings {
  id: boolean;
  nome_conta: string;
  idioma: string;
  fuso: string;
  auto_resolver_dias: number;
  ocultar_nome_agente: boolean;
  notificacao_som: boolean;
  logo_url: string | null;
  /**
   * A recepção continua vendo a conversa depois de atribuir? (0040)
   * true = segundo par de olhos; false = ela só enxerga a caixa central.
   */
  recepcao_ve_atribuidas: boolean;
  updated_at: string;
}

export interface ArticleVote {
  id: string;
  article_id: string;
  util: boolean;
  comentario: string | null;
  visitante_token: string | null;
  created_at: string;
}


// =====================================================================
// Agent Bots e onboarding (migration 0037)
// =====================================================================

export interface AgentBot {
  id: string;
  nome: string;
  descricao: string | null;
  /** Para onde cada mensagem recebida na caixa do bot é POSTada. */
  outgoing_url: string;
  prefixo: string;
  secret: string;
  ativo: boolean;
  ultimo_status: number | null;
  ultimo_erro: string | null;
  ultimo_envio_em: string | null;
  falhas_seguidas: number;
  criado_por: string | null;
  created_at: string;
}

export interface BotDelivery {
  id: string;
  bot_id: string;
  conversation_id: string | null;
  payload: Record<string, unknown> | null;
  status: number | null;
  erro: string | null;
  duracao_ms: number | null;
  created_at: string;
}

/** Passos do assistente de primeiros passos. A ordem é a da tela. */
export const ONBOARDING_PASSOS = [
  { id: "conta", titulo: "Nome e fuso da operação" },
  { id: "agentes", titulo: "Liberar acesso da equipe" },
  { id: "canal", titulo: "Conectar um canal" },
  { id: "horario", titulo: "Horário comercial" },
  { id: "respostas", titulo: "Respostas rápidas" },
  { id: "etiquetas", titulo: "Etiquetas" },
] as const;

export type OnboardingPassoId = (typeof ONBOARDING_PASSOS)[number]["id"];

// =====================================================================
// Agenda — visualizações (migration 0038)
// =====================================================================

export type AgendaVista = "kanban" | "timeline" | "mes" | "semana" | "lista";

export const AGENDA_VISTA_LABELS: Record<AgendaVista, string> = {
  kanban: "Kanban",
  timeline: "Linha do tempo",
  mes: "Mês",
  semana: "Semana",
  lista: "Lista",
};

export type AgendaTipo =
  | "visita" | "reuniao" | "ligacao" | "retorno" | "assinatura" | "gravacao" | "outro";

export const AGENDA_TIPO_LABELS: Record<AgendaTipo, string> = {
  visita: "Visita",
  reuniao: "Reunião",
  ligacao: "Ligação",
  retorno: "Retorno",
  assinatura: "Assinatura",
  gravacao: "Gravação",
  outro: "Outro",
};

/** Cor de cada tipo. Hex porque o Tailwind não gera classe dinâmica. */
export const AGENDA_TIPO_COR: Record<AgendaTipo, string> = {
  visita: "#a855f7",
  reuniao: "#3b82f6",
  ligacao: "#f59e0b",
  retorno: "#ec4899",
  assinatura: "#10b981",
  gravacao: "#6366f1",
  outro: "#64748b",
};

export type AgendaStatus =
  | "agendado" | "confirmado" | "concluido" | "cancelado" | "nao_compareceu";

export const AGENDA_STATUS_LABELS: Record<AgendaStatus, string> = {
  agendado: "Agendado",
  confirmado: "Confirmado",
  concluido: "Concluído",
  cancelado: "Cancelado",
  nao_compareceu: "Não compareceu",
};

/** Ordem das colunas quando o quadro agrupa por status. */
export const AGENDA_STATUS_ORDEM: AgendaStatus[] = [
  "agendado", "confirmado", "concluido", "nao_compareceu", "cancelado",
];

export const AGENDA_STATUS_CLASSES: Record<AgendaStatus, string> = {
  agendado: "bg-slate-500/15 text-slate-700 dark:text-slate-300 border-slate-500/30",
  confirmado: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  concluido: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  cancelado: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/30",
  nao_compareceu: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

/** Como o quadro agrupa as colunas. */
export type AgendaAgrupamento = "dia" | "status" | "tipo" | "setor" | "responsavel";

export const AGENDA_AGRUPAMENTO_LABELS: Record<AgendaAgrupamento, string> = {
  dia: "Por dia",
  status: "Por status",
  tipo: "Por tipo",
  setor: "Por setor",
  responsavel: "Por responsável",
};

/**
 * Item unificado da agenda. `agenda_events` e `lead_appointments` são
 * tabelas diferentes, mas toda visualização trata as duas igual — só a
 * gravação precisa saber de qual veio (por isso `origem`).
 */
export interface AgendaItem {
  /** "evt:<uuid>" ou "apt:<uuid>" — o prefixo diz a tabela de origem. */
  id: string;
  origem: "evento" | "agendamento";
  /** Id puro, sem prefixo — é o que vai no `.eq("id", ...)`. */
  rawId: string;
  titulo: string;
  tipo: AgendaTipo;
  status: AgendaStatus;
  /** Nulo = ainda SEM data. Vive no painel lateral até alguém arrastar. */
  data_hora: string | null;
  duracao_min: number;
  /** Ocupa o dia todo — o mês desenha barra, não pílula com hora. */
  dia_inteiro: boolean;
  observacoes: string | null;
  local: string | null;
  cor: string | null;
  ordem: number;
  responsavel_id: string | null;
  setor_destino: Sector | null;
  criado_por_sector: Sector | null;
  /** Só em agendamento de lead. */
  lead_id: string | null;
  lead_nome: string | null;
  property_id: string | null;
  property_codigo: string | null;
}


// =====================================================================
// Papéis do atendimento e triagem (migration 0040)
// =====================================================================

export type AtendimentoPapel = "administrador" | "recepcao" | "atendente";

export const PAPEL_LABELS: Record<AtendimentoPapel, string> = {
  administrador: "Administrador",
  recepcao: "Recepção (triagem)",
  atendente: "Atendente",
};

export const PAPEL_DESCRICAO: Record<AtendimentoPapel, string> = {
  administrador:
    "Vê todas as conversas, assume, transfere, reabre e acompanha a produtividade da equipe.",
  recepcao:
    "Recebe tudo na caixa central, classifica e encaminha para a fila certa. Não atende.",
  atendente:
    "Vê apenas as conversas das filas de que participa e as atribuídas a ele.",
};

/** Ações registradas em `atendimento_transferencias`. */
export type AcaoTransferencia = "triagem" | "transferencia" | "assumir" | "devolver";

export const ACAO_TRANSFERENCIA_LABELS: Record<AcaoTransferencia, string> = {
  triagem: "Triada",
  transferencia: "Transferida",
  assumir: "Assumida",
  devolver: "Devolvida à caixa central",
};

export interface Transferencia {
  id: string;
  conversation_id: string;
  acao: AcaoTransferencia;
  de_equipe: string | null;
  para_equipe: string | null;
  de_agente: string | null;
  para_agente: string | null;
  motivo: string | null;
  feito_por: string | null;
  created_at: string;
}

/**
 * As 9 filas de triagem semeadas na 0040. A lista existe no código só
 * para ordenar e sugerir na tela — a verdade é a tabela
 * `atendimento_teams`, e o cliente pode renomear ou criar outras.
 */
export const FILAS_SUGERIDAS = [
  "Venda Urbana", "Fazenda", "Locação", "Consórcio", "Documentação",
  "Financeiro", "Jurídico", "Marketing", "Administrativo",
] as const;
