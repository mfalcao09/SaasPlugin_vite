// ─────────────────────────────────────────────────────────────────────────────
// Tipos do subsistema de AGENTES IA por produto (D3 P1/F1d) — twin de @/types/agents.
// Fonte 1:1: `.vendus-src-reference/src/types/agents.ts`. Diferenças:
//   • `ProductAgent` re-baseado em `Tables<'platform_crm_product_agents'>` (twin)
//   • SEM `organization_id` (escopo = produto)
//   • campos transientes de UI (`dedicated_connections`, `monitored_product_ids`)
//     preservados via interseção — nunca vão pro insert (whitelist do hook filtra).
// NÃO confundir com `crm/types.ts` (root do CRM) — este é local do subsistema agents.
// ─────────────────────────────────────────────────────────────────────────────
import type { Tables } from '@/integrations/supabase/types';

export type AgentType = 'sdr' | 'closer' | 'support' | 'financial' | 'admin' | 'orchestrator' | 'custom' | 'prospector' | 'retention';
export type ToneStyle = 'formal' | 'consultive' | 'friendly' | 'technical';
export type MessageStyle = 'short' | 'balanced' | 'detailed';

export interface SupportLink {
  title: string;
  url: string;
  description?: string;
}

export interface SupportQuickAnswer {
  question: string;
  answer: string;
}

export type QuickMenuAction = 'transfer_to_agent' | 'transfer_to_human' | 'start_flow';

export interface QuickMenuOption {
  label: string;
  action: QuickMenuAction;
  target_agent_id?: string | null;
  target_flow_id?: string | null;
  human_queue?: string | null;
}

export type QuickMenuMode = 'off' | 'always' | 'fallback';

export interface AgentToolConfigs {
  allowed_tags?: string[];
  email_template_id?: string;
  email_default_subject?: string;
  allowed_material_ids?: string[];
  allowed_flow_ids?: string[];
  cadence_default_steps?: Array<{ day: number; action: string; template?: string }>;
  max_emails_per_day?: number;
  // Support agent only — populated via "📚 Suporte" tab
  support_links?: SupportLink[];
  support_quick_answers?: SupportQuickAnswer[];
  [key: string]: unknown;
}

// Type-safe version for internal use, JSON-compatible for Supabase
export type AgentToolConfigsJson = Record<string, unknown>;

export interface QualificationField {
  key: string;
  label: string;
  weight: number;
  hints?: string[];
}

export interface QualificationSchema {
  name: string;
  fields: QualificationField[];
}

export const QUALIFICATION_PRESETS: Record<string, QualificationSchema> = {
  bant: {
    name: 'BANT',
    fields: [
      { key: 'budget',    label: 'Budget (Orçamento)',     weight: 25, hints: ['valor disponível', 'faixa de investimento'] },
      { key: 'authority', label: 'Authority (Autoridade)', weight: 25, hints: ['quem decide', 'comitê', 'aprovação'] },
      { key: 'need',      label: 'Need (Necessidade)',     weight: 30, hints: ['dor', 'problema', 'objetivo'] },
      { key: 'timeline',  label: 'Timing (Tempo)',         weight: 20, hints: ['prazo', 'quando pretende'] },
    ],
  },
  gpct: {
    name: 'GPCT',
    fields: [
      { key: 'goals',     label: 'Goals (Metas)',         weight: 25, hints: ['o que quer alcançar'] },
      { key: 'plans',     label: 'Plans (Planos)',        weight: 25, hints: ['como pretende chegar lá'] },
      { key: 'challenges',label: 'Challenges (Desafios)', weight: 25, hints: ['o que está bloqueando'] },
      { key: 'timeline',  label: 'Timeline (Prazo)',      weight: 25, hints: ['até quando'] },
    ],
  },
  bmc: {
    name: 'Método BMC',
    fields: [
      { key: 'base_obra',  label: 'Base da Obra',           weight: 30, hints: ['construção nova', 'reforma', 'ampliação', 'residencial', 'comercial', 'construtora'] },
      { key: 'metragem',   label: 'Metragem e Material',    weight: 40, hints: ['ambientes', 'm²', 'produtos desejados', 'referências'] },
      { key: 'cronograma', label: 'Cronograma',             weight: 30, hints: ['quando comprar', 'quando instalar', 'prazo'] },
    ],
  },
};

/**
 * Campos transientes de UI que NÃO são colunas de `platform_crm_product_agents`.
 * Preenchidos no editor, filtrados pela whitelist do hook antes do insert/update.
 */
export interface ProductAgentTransientFields {
  /**
   * Conexões dedicadas multi-canal. Vazio = atende em qualquer conexão.
   * Campo transiente — persistido por Edge (product_agent_connections não tem twin).
   */
  dedicated_connections?: Array<{ type: 'evolution' | 'meta_whatsapp' | 'instagram'; id: string }>;
  /** Exclusivo do Agente Admin Executivo (persistido em auto_notification_settings via Edge). */
  monitored_product_ids?: string[];
}

/**
 * Agente IA de produto — twin 1:1 da coluna `platform_crm_product_agents` +
 * campos transientes de UI. Enums de string são estreitados p/ a UI.
 */
export type ProductAgent = Omit<
  Tables<'platform_crm_product_agents'>,
  'agent_type' | 'tone_style' | 'message_style' | 'qualification_schema' | 'humanization' | 'quick_menu_options' | 'quick_menu_mode' | 'followup_tone' | 'followup_attempt_hints'
> &
  ProductAgentTransientFields & {
    agent_type: AgentType;
    tone_style: ToneStyle | null;
    message_style: MessageStyle | null;
    qualification_schema?: QualificationSchema | Record<string, unknown> | null;
    humanization?: Record<string, unknown> | null;
    quick_menu_options?: QuickMenuOption[] | unknown;
    quick_menu_mode?: 'off' | 'always' | 'fallback' | string;
    followup_tone?: 'short' | 'warm' | 'provocative' | string | null;
    followup_attempt_hints?: Array<{ attempt: number; hint: string }> | unknown;
  };

export interface AgentTemplate {
  name: string;
  description: string;
  icon: string;
  primary_objective: string;
  can_do: string[];
  cannot_do: string[];
  handoff_triggers: string[];
  tone_style: ToneStyle;
  message_style: MessageStyle;
}

export const AGENT_TYPE_LABELS: Record<AgentType, string> = {
  sdr: 'SDR',
  closer: 'Closer',
  support: 'Suporte',
  financial: 'Financeiro',
  admin: 'Administrativo',
  orchestrator: 'Orquestrador',
  custom: 'Personalizado',
  prospector: 'Prospector',
  retention: 'Retenção & Sucesso',
};

export const TONE_STYLE_LABELS: Record<ToneStyle, string> = {
  formal: 'Formal',
  consultive: 'Consultivo',
  friendly: 'Amigável',
  technical: 'Técnico',
};

export const MESSAGE_STYLE_LABELS: Record<MessageStyle, string> = {
  short: 'Curtas',
  balanced: 'Equilibradas',
  detailed: 'Detalhadas',
};

export const AGENT_TEMPLATES: Record<AgentType, AgentTemplate> = {
  sdr: {
    name: 'SDR Qualificador',
    description: 'Qualifica leads e encaminha para vendas',
    icon: '🎯',
    primary_objective: 'Qualificar leads e encaminhar para o closer quando houver interesse real',
    can_do: [
      'Fazer perguntas de qualificação',
      'Aplicar tags aos leads',
      'Avançar leads no funil',
      'Coletar informações de contato',
    ],
    cannot_do: [
      'Falar de preço fechado',
      'Fechar vendas',
      'Dar descontos',
    ],
    handoff_triggers: [
      'Lead pede para falar com humano',
      'Lead demonstra alto interesse de compra',
      'Lead tem objeções complexas',
    ],
    tone_style: 'friendly',
    message_style: 'balanced',
  },
  closer: {
    name: 'Closer Premium',
    description: 'Fecha vendas e converte leads qualificados',
    icon: '💼',
    primary_objective: 'Fechar vendas e converter leads qualificados em clientes',
    can_do: [
      'Negociar condições',
      'Apresentar propostas',
      'Falar sobre preços e planos',
      'Enviar links de pagamento',
      'Chamar humano quando necessário',
    ],
    cannot_do: [
      'Dar descontos não autorizados',
      'Prometer prazos irreais',
    ],
    handoff_triggers: [
      'Lead solicita condições especiais',
      'Lead quer falar com gerente',
      'Negociação complexa',
    ],
    tone_style: 'consultive',
    message_style: 'detailed',
  },
  support: {
    name: 'Suporte Técnico',
    description: 'Resolve problemas e dúvidas de clientes',
    icon: '🛠️',
    primary_objective: 'Resolver problemas e dúvidas de clientes de forma eficiente',
    can_do: [
      'Responder dúvidas técnicas',
      'Abrir tickets de suporte',
      'Escalar para equipe técnica',
      'Enviar tutoriais e documentação',
    ],
    cannot_do: [
      'Vender novos produtos',
      'Negociar contratos',
      'Fazer alterações em conta',
    ],
    handoff_triggers: [
      'Problema não resolvido após 3 tentativas',
      'Cliente insatisfeito',
      'Solicitação de reembolso',
    ],
    tone_style: 'friendly',
    message_style: 'detailed',
  },
  financial: {
    name: 'Financeiro',
    description: 'Lida com cobranças e questões financeiras',
    icon: '💰',
    primary_objective: 'Lidar com questões financeiras e cobranças de forma profissional',
    can_do: [
      'Informar sobre faturas',
      'Enviar boletos e links de pagamento',
      'Explicar cobranças',
      'Informar sobre atrasos',
    ],
    cannot_do: [
      'Negociar dívidas sem autorização',
      'Cancelar contratos',
      'Fazer estornos',
    ],
    handoff_triggers: [
      'Solicitação de negociação de dívida',
      'Disputa de cobrança',
      'Cancelamento de serviço',
    ],
    tone_style: 'formal',
    message_style: 'short',
  },
  admin: {
    name: 'Administrativo',
    description: 'Auxilia em questões administrativas',
    icon: '📋',
    primary_objective: 'Auxiliar em questões administrativas e direcionamentos',
    can_do: [
      'Responder sobre processos',
      'Direcionar para áreas corretas',
      'Informar horários e contatos',
      'Agendar reuniões',
    ],
    cannot_do: [
      'Tomar decisões finais',
      'Alterar cadastros',
      'Aprovar solicitações',
    ],
    handoff_triggers: [
      'Solicitação que requer aprovação',
      'Reclamação formal',
    ],
    tone_style: 'formal',
    message_style: 'balanced',
  },
  orchestrator: {
    name: 'Orquestrador Mestre',
    description: 'Classifica produto+intenção e roteia para o especialista',
    icon: '🧭',
    primary_objective: 'Classificar a mensagem recebida (produto + intenção) e rotear o lead para o especialista correto, ou pedir UMA pergunta de esclarecimento quando não conseguir classificar com confiança.',
    can_do: [
      'Identificar de qual produto o lead está falando',
      'Detectar intenção (informação, compra, suporte, financeiro, humano)',
      'Rotear para SDR / Closer / Suporte / Financeiro do produto certo',
      'Fazer UMA pergunta curta para desambiguar quando necessário',
      'Transferir para humano quando for solicitado',
    ],
    cannot_do: [
      'Vender, negociar ou explicar detalhes de produto',
      'Responder dúvidas técnicas (encaminha para Suporte)',
      'Falar de preço, condições ou plano (encaminha para Closer)',
      'Mais de 2 perguntas seguidas — se não classificar, transfere para humano',
    ],
    handoff_triggers: [
      'Lead pede explicitamente para falar com humano',
      'Não consegui classificar produto após 2 perguntas',
      'Mensagem ofensiva ou fora do escopo da empresa',
    ],
    tone_style: 'friendly',
    message_style: 'short',
  },
  custom: {
    name: 'Agente Personalizado',
    description: 'Configure do zero conforme sua necessidade',
    icon: '✨',
    primary_objective: '',
    can_do: [],
    cannot_do: [],
    handoff_triggers: [],
    tone_style: 'friendly',
    message_style: 'balanced',
  },
  // Tipos que JÁ EXISTIAM no banco (Bento/prospector, Nina/retention) mas não no
  // mapa — a ausência derrubava a Hierarquia inteira via undefined.icon (2026-07-19).
  prospector: {
    name: 'Prospector',
    description: 'Prospecção ativa: inicia conversas com leads frios (outbound)',
    icon: '🔭',
    primary_objective: 'Abrir conversas com leads frios e despertar interesse real',
    can_do: [
      'Iniciar contato outbound',
      'Despertar interesse com contexto do lead',
      'Encaminhar interessados para a SDR',
    ],
    cannot_do: [
      'Falar de preço fechado',
      'Fechar vendas',
      'Insistir após desinteresse claro',
    ],
    handoff_triggers: ['Interesse demonstrado', 'Pedido de mais informações'],
    tone_style: 'friendly',
    message_style: 'short',
  },
  retention: {
    name: 'Sucesso & Retenção',
    description: 'Sucesso do cliente, suporte contínuo e retenção pós-venda',
    icon: '💜',
    primary_objective: 'Reter e encantar clientes ativos, prevenindo churn',
    can_do: [
      'Acompanhar saúde do cliente',
      'Resolver dúvidas de uso',
      'Ações de reengajamento e aniversário',
    ],
    cannot_do: [
      'Prometer funcionalidades inexistentes',
      'Dar descontos sem aprovação',
    ],
    handoff_triggers: ['Risco de cancelamento', 'Problema técnico grave'],
    tone_style: 'friendly',
    message_style: 'balanced',
  },
};

export const CHANNEL_LABELS = {
  active_in_funnels: 'Funis de Captura',
  active_in_chat: 'Chat do Site',
  active_in_widget: 'Widget',
  active_in_inbox: 'Inbox',
  active_in_copilot: 'Copilot do Vendedor',
  active_in_whatsapp: 'WhatsApp',
  active_in_instagram: 'Instagram',
  active_in_facebook: 'Facebook',
};
