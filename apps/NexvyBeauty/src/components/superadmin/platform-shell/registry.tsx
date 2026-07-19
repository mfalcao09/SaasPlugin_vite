import type {
  PlatformModuleDefinition,
  PlatformNavGroup,
} from './usePlatformModule';
import { PlatformIcons as I } from './usePlatformModule';
import { EmBreve } from './EmBreve';

// ── Componentes ERP existentes (mesmos imports do SuperAdmin.tsx atual) ──
import { SuperAdminDashboard } from '@/components/superadmin/SuperAdminDashboard';
import { OrganizationsManager } from '@/components/superadmin/OrganizationsManager';
import { UsersManager } from '@/components/superadmin/UsersManager';
import { PlansManager } from '@/components/superadmin/PlansManager';
import { PlatformCrmProductsSection } from '@/components/superadmin/crm/products/PlatformCrmProductsSection';
import { SubscriptionsManager } from '@/components/superadmin/SubscriptionsManager';
import { BillingManager } from '@/components/superadmin/BillingManager';
import { CaktoSuperAdminPanel } from '@/components/superadmin/payments/CaktoSuperAdminPanel';
import { AffiliatesPanel } from '@/components/superadmin/AffiliatesPanel';
import { CaktoAdminPanel } from '@/components/admin/payments/CaktoAdminPanel';
import { EvolutionManager } from '@/components/superadmin/EvolutionManager';
import { IntegrationsManager } from '@/components/admin/integrations/IntegrationsManager';
import { PlatformSettings } from '@/components/superadmin/PlatformSettings';
import { EmailSettings } from '@/components/superadmin/EmailSettings';
import { HelpManager } from '@/components/superadmin/HelpManager';
import { SupportTickets } from '@/components/admin/support/SupportTickets';
import { AgentToolExecutionsPanel } from '@/components/superadmin/AgentToolExecutionsPanel';
import { AIQualityPanel } from '@/components/superadmin/AIQualityPanel';
import { ReleasesManager } from '@/components/superadmin/ReleasesManager';
import { AuditLogs } from '@/components/superadmin/AuditLogs';
import { SystemHealth } from '@/components/superadmin/SystemHealth';

// ── Componentes CRM da PLATAFORMA (platform_crm) — módulo Vendas ──
// Desacoplamento 🔒: só platform_crm/stub. Nada do cockpit do tenant.
// Estrutura de navegação = RÉPLICA 1:1 do `adminMenu.ts` do CRM Vendus original,
// MENOS o grupo de "conta/assinatura do cliente" (Plano/Empresa/Pagamentos/
// Integrações/Suporte) — esses são a NOSSA operação de ERP e vivem no módulo ERP
// (máxima: CRM ≠ ERP, não duplicar). Comissões e Metas NÃO são itens de menu no
// original: vivem dentro de Financeiro (ver PlatformCrmFinanceiro). "Negócios" no
// original = catálogo de Produtos (ProductListPage), não uma lista de deals.
import { PlatformCrmKanban } from '@/components/superadmin/crm/kanban/PlatformCrmKanban';
import { PlatformCrmLeadsManager } from '@/components/superadmin/crm/leads/PlatformCrmLeadsManager';
import { PlatformCrmTagsManager } from '@/components/superadmin/crm/tags/PlatformCrmTagsManager';
import { PlatformCrmCustomFieldsManager } from '@/components/superadmin/crm/custom-fields/PlatformCrmCustomFieldsManager';
import { PlatformCrmEquipes } from '@/components/superadmin/crm/team/PlatformCrmEquipes';
import { PlatformCrmOperationCenter } from '@/components/superadmin/crm/operation/OperationCenter';
import { PlatformCrmCadencesManager } from '@/components/superadmin/crm/cadences/PlatformCrmCadencesManager';
import { PlatformCrmQuickRepliesManager } from '@/components/superadmin/crm/quick-replies/PlatformCrmQuickRepliesManager';
import { PlatformCrmSectorsManager } from '@/components/superadmin/crm/sectors/PlatformCrmSectorsManager';
import { PlatformCrmBusinessHoursManager } from '@/components/superadmin/crm/business-hours/PlatformCrmBusinessHoursManager';
import { PlatformCrmWebhooksManager } from '@/components/superadmin/crm/webhooks/PlatformCrmWebhooksManager';
import { PlatformCrmNotificationManager } from '@/components/superadmin/crm/notifications/PlatformCrmNotificationManager';
import { PlatformCrmAgendaManager } from '@/components/superadmin/crm/agenda/PlatformCrmAgendaManager';
import { PlatformCrmTasksManager } from '@/components/superadmin/crm/tasks/PlatformCrmTasksManager';
import { PlatformCrmProductAgentsManager } from '@/components/superadmin/crm/agents/PlatformCrmProductAgentsManager';
import { PlatformCrmCampaignsManager } from '@/components/superadmin/crm/campaigns/PlatformCrmCampaignsManager';
import { InstagramAutomationsSection } from '@/components/superadmin/crm/instagram-flows/InstagramAutomationsSection';
import { PlatformCrmCaptureManager } from '@/components/superadmin/crm/capture';
import { PlatformCrmFormsManager } from '@/components/superadmin/crm/capture/PlatformCrmFormsManager';
import { PlatformProspeccaoManager } from '@/components/superadmin/crm/capture/PlatformProspeccaoManager';

// ── Prospecção Ativa (grupo próprio) ──
import { PlatformProspeccaoBaseConsolidada } from '@/components/superadmin/crm/prospeccao/PlatformProspeccaoBaseConsolidada';
import { ProspeccaoCampanhasStub } from '@/components/superadmin/crm/prospeccao/stubs/ProspeccaoCampanhasStub';
import { ProspeccaoDashboardStub } from '@/components/superadmin/crm/prospeccao/stubs/ProspeccaoDashboardStub';
import { ProspeccaoEnriquecimentoStub } from '@/components/superadmin/crm/prospeccao/stubs/ProspeccaoEnriquecimentoStub';
import { ProspeccaoVideoImport } from '@/components/superadmin/crm/prospeccao/ProspeccaoVideoImport';
import { PlatformCrmCaptureWidgetsTab } from '@/components/superadmin/crm/capture/PlatformCrmCaptureWidgetsTab';
import { PlatformCrmCaptureAnalyticsTab } from '@/components/superadmin/crm/capture/PlatformCrmCaptureAnalyticsTab';
import { PlatformCrmCaptureWhatsAppTab } from '@/components/superadmin/crm/capture/PlatformCrmCaptureWhatsAppTab';
import { PlatformCrmSellerFormSection } from '@/components/superadmin/crm/capture/PlatformCrmSellerFormSection';
import { PlatformCrmQuizManager } from '@/components/superadmin/crm/capture/quiz/PlatformCrmQuizManager';
import { PlatformCrmChatBotManager } from '@/components/superadmin/crm/capture/chatbot';
import { PlatformCrmCaptureTemplatesLibrary } from '@/components/superadmin/crm/capture/templates';
import { PlatformCrmCaptureResultsSection } from '@/components/superadmin/crm/capture/results';
import { PlatformCrmInbox } from '@/components/superadmin/crm/inbox/PlatformCrmInbox';
import { PlatformCrmInboxPanel } from '@/components/superadmin/crm/inbox-sections/PlatformCrmInboxPanel';
import { PlatformCrmInboxRadar } from '@/components/superadmin/crm/inbox-sections/PlatformCrmInboxRadar';
import { PlatformCrmInboxFollowup } from '@/components/superadmin/crm/inbox-sections/PlatformCrmInboxFollowup';
import { PlatformCrmInboxReports } from '@/components/superadmin/crm/inbox-sections/PlatformCrmInboxReports';
import { PlatformCrmJourneyPage } from '@/components/superadmin/crm/journey/PlatformCrmJourneyPage';
import { PlatformCrmMia } from '@/components/superadmin/crm/mia/PlatformCrmMia';
import { PlatformCrmFinanceiro } from '@/components/superadmin/crm/financeiro/PlatformCrmFinanceiro';
import { PlatformCrmConnectionsPanel } from '@/components/superadmin/crm/connections/PlatformCrmConnectionsPanel';
import { PlatformCrmIntegrationsManager } from '@/components/superadmin/crm/integrations/PlatformCrmIntegrationsManager';

// ── Anúncios (NexvyAds) — seção product-scoped: Atribuição / Campanhas / Recomendações ──
import { PlatformAdsSection } from '@/components/superadmin/crm/ads/PlatformAdsSection';

// ════════════════════════════════════════════════════════════
// MÓDULO ERP (Gestão) — reusa 100% dos componentes atuais
// ════════════════════════════════════════════════════════════
const ERP_NAV: PlatformNavGroup[] = [
  {
    id: 'erp-topo',
    label: null,
    items: [
      {
        id: 'dashboard',
        label: 'Dashboard da Plataforma',
        icon: I.LayoutDashboard,
        render: () => <SuperAdminDashboard />,
      },
      {
        id: 'organizations',
        label: 'Empresas',
        icon: I.Building2,
        // OrganizationsManager exige onViewOrganization; drill-down de org
        // fica fora do escopo desta shell (no-op seguro por ora).
        render: () => <OrganizationsManager onViewOrganization={() => {}} />,
      },
      {
        id: 'users',
        label: 'Usuários',
        icon: I.Users,
        render: () => <UsersManager />,
      },
    ],
  },
  {
    id: 'erp-comercial',
    label: 'Comercial (SaaS)',
    items: [
      {
        id: 'plans',
        label: 'Planos',
        icon: I.Layers,
        render: () => <PlansManager />,
      },
      {
        id: 'subscriptions',
        label: 'Assinaturas',
        icon: I.CreditCard,
        render: () => <SubscriptionsManager />,
      },
      {
        id: 'billing',
        label: 'Faturamento',
        icon: I.FileText,
        render: () => <BillingManager />,
      },
      {
        id: 'payments',
        label: 'Pagamentos (Cakto)',
        icon: I.Banknote,
        render: () => <CaktoSuperAdminPanel />,
      },
    ],
  },
  {
    id: 'erp-crescimento',
    label: 'Crescimento',
    items: [
      {
        id: 'affiliates',
        label: 'Afiliados',
        icon: I.Handshake,
        render: () => <AffiliatesPanel />,
      },
      {
        id: 'sales-payments',
        label: 'Pagamentos (Vendas)',
        icon: I.Banknote,
        render: () => <CaktoAdminPanel />,
      },
    ],
  },
  {
    id: 'erp-infra',
    label: 'Infra',
    items: [
      {
        id: 'whatsapp',
        label: 'WhatsApp / Evolution',
        icon: I.Smartphone,
        render: () => <EvolutionManager />,
      },
      {
        id: 'integrations',
        label: 'Integrações',
        icon: I.Plug,
        render: () => <IntegrationsManager />,
      },
      {
        id: 'branding',
        label: 'Identidade Visual',
        icon: I.Palette,
        render: () => <PlatformSettings />,
      },
      {
        id: 'email',
        label: 'E-mail',
        icon: I.Mail,
        render: () => <EmailSettings />,
      },
    ],
  },
  {
    id: 'erp-sistema',
    label: 'Sistema',
    items: [
      {
        id: 'help',
        label: 'Central de Ajuda',
        icon: I.HelpCircle,
        render: () => <HelpManager />,
      },
      {
        id: 'support',
        label: 'Suporte',
        icon: I.LifeBuoy,
        render: () => <SupportTickets scope="super_admin" />,
      },
      {
        id: 'agent-tools',
        label: 'Ações dos Agentes',
        icon: I.Wrench,
        render: () => <AgentToolExecutionsPanel />,
      },
      {
        id: 'ai-quality',
        label: 'Qualidade da IA',
        icon: I.BarChart3,
        render: () => <AIQualityPanel />,
      },
      {
        id: 'releases',
        label: 'Atualizações',
        icon: I.Sparkles,
        render: () => <ReleasesManager />,
      },
      {
        id: 'audit',
        label: 'Logs',
        icon: I.ScrollText,
        render: () => <AuditLogs />,
      },
      {
        id: 'health',
        label: 'Saúde',
        icon: I.Activity,
        render: () => <SystemHealth />,
      },
    ],
  },
];

// ════════════════════════════════════════════════════════════
// MÓDULO VENDAS (CRM) — RÉPLICA da IA do `adminMenu.ts` original.
// Itens já portados apontam para os componentes platform_crm; o resto é stub
// <EmBreve/> (porte progressivo). "Negócios" = Produtos (a portar). Comissões/
// Metas moram dentro de "Financeiro". Labels fiéis ao original (Pipeline, Leads).
// ════════════════════════════════════════════════════════════
const VENDAS_NAV: PlatformNavGroup[] = [
  {
    id: 'vendas-topo',
    label: null,
    items: [
      {
        id: 'v-dashboard',
        label: 'Dashboard',
        icon: I.LayoutDashboard,
        render: () => <PlatformCrmOperationCenter />,
      },
      {
        id: 'v-mia',
        label: 'Mia',
        icon: I.Sparkles,
        render: () => <PlatformCrmMia />,
      },
      {
        id: 'v-pipeline',
        label: 'Pipeline',
        icon: I.KanbanSquare,
        render: () => <PlatformCrmKanban />,
      },
      {
        id: 'v-leads',
        label: 'Leads',
        icon: I.Contact,
        render: () => <PlatformCrmLeadsManager />,
      },
      {
        id: 'v-agenda',
        label: 'Agenda',
        icon: I.CalendarDays,
        render: () => <PlatformCrmAgendaManager />,
      },
      {
        id: 'v-tarefas',
        label: 'Tarefas',
        icon: I.ListTodo,
        render: () => <PlatformCrmTasksManager />,
      },
    ],
  },
  {
    id: 'vendas-atendimentos',
    label: 'Atendimentos',
    items: [
      {
        id: 'v-chat',
        label: 'Chat',
        icon: I.MessageSquare,
        render: () => <PlatformCrmInbox />,
      },
      {
        id: 'v-painel',
        label: 'Painel',
        icon: I.LayoutPanelTop,
        render: () => <PlatformCrmInboxPanel />,
      },
      {
        id: 'v-radar-ia',
        label: 'Radar IA',
        icon: I.Radar,
        render: () => <PlatformCrmInboxRadar />,
      },
      {
        id: 'v-follow-up',
        label: 'Follow-Up',
        icon: I.Repeat,
        render: () => <PlatformCrmInboxFollowup />,
      },
      {
        id: 'v-relatorios',
        label: 'Relatórios',
        icon: I.BarChart3,
        render: () => <PlatformCrmInboxReports />,
      },
      {
        id: 'v-jornada',
        label: 'Jornada do Lead',
        icon: I.Route,
        render: () => <PlatformCrmJourneyPage />,
      },
    ],
  },
  {
    id: 'vendas-automacao-ia',
    label: 'Automação & IA',
    items: [
      {
        id: 'v-agentes-ia',
        label: 'Agentes IA',
        icon: I.Bot,
        render: () => <PlatformCrmProductAgentsManager />,
      },
      {
        id: 'v-campanhas',
        label: 'Campanhas',
        icon: I.Megaphone,
        render: () => <PlatformCrmCampaignsManager />,
      },
      {
        id: 'v-cadencias',
        label: 'Cadências',
        icon: I.Send,
        render: () => <PlatformCrmCadencesManager />,
      },
      {
        id: 'v-instagram-flows',
        label: 'Automações Instagram',
        icon: I.Instagram,
        render: () => <InstagramAutomationsSection />,
      },
      {
        id: 'v-webhooks',
        label: 'Webhooks',
        icon: I.Webhook,
        render: () => <PlatformCrmWebhooksManager />,
      },
    ],
  },
  {
    id: 'vendas-anuncios',
    label: 'Anúncios',
    items: [
      {
        // Seção NexvyAds (product-scoped): 3 abas — Atribuição / Campanhas /
        // Recomendações. super_admin-only (herda a RLS das tabelas ads_* +
        // a SuperAdminRoute que envolve a PlatformShell).
        id: 'v-anuncios',
        label: 'Anúncios',
        icon: I.Megaphone,
        render: () => <PlatformAdsSection />,
      },
    ],
  },
  {
    id: 'vendas-prospeccao-ativa',
    label: 'Prospecção Ativa',
    items: [
      {
        id: 'v-prospeccao-buscas',
        label: 'Buscas',
        icon: I.Radar,
        render: () => <PlatformProspeccaoManager />,
      },
      {
        id: 'v-prospeccao-base',
        label: 'Base consolidada',
        icon: I.Layers,
        render: () => <PlatformProspeccaoBaseConsolidada />,
      },
      {
        id: 'v-prospeccao-campanhas',
        label: 'Campanhas de disparo',
        icon: I.Send,
        render: () => <ProspeccaoCampanhasStub />,
      },
      {
        id: 'v-prospeccao-dashboard',
        label: 'Dashboard de prospecção',
        icon: I.BarChart3,
        render: () => <ProspeccaoDashboardStub />,
      },
      {
        id: 'v-prospeccao-enriquecimento',
        label: 'Enriquecimento (UI)',
        icon: I.Sparkles,
        render: () => <ProspeccaoEnriquecimentoStub />,
      },
      {
        id: 'v-prospeccao-video',
        label: 'Importação por vídeo',
        icon: I.Video,
        render: () => <ProspeccaoVideoImport />,
      },
    ],
  },
  {
    id: 'vendas-captacao',
    label: 'Captação',
    items: [
      {
        id: 'v-quiz',
        label: 'Quiz',
        icon: I.FileQuestion,
        render: () => <PlatformCrmQuizManager />,
      },
      {
        id: 'v-formularios',
        label: 'Formulários',
        icon: I.FormInput,
        render: () => <PlatformCrmFormsManager />,
      },
      {
        id: 'v-form-vendedores',
        label: 'Form Vendedores',
        icon: I.FileText,
        render: () => <PlatformCrmSellerFormSection />,
      },
      {
        id: 'v-chatbot',
        label: 'ChatBot',
        icon: I.MessageCircle,
        render: () => <PlatformCrmChatBotManager />,
      },
      {
        id: 'v-widget',
        label: 'Widget',
        icon: I.MousePointerClick,
        render: () => <PlatformCrmCaptureWidgetsTab />,
      },
      {
        id: 'v-whatsapp',
        label: 'WhatsApp',
        icon: I.MessageCircleMore,
        render: () => <PlatformCrmCaptureWhatsAppTab />,
      },
      {
        id: 'v-templates',
        label: 'Templates',
        icon: I.LayoutTemplate,
        render: () => <PlatformCrmCaptureTemplatesLibrary />,
      },
      {
        id: 'v-resultados',
        label: 'Resultados',
        icon: I.Trophy,
        render: () => <PlatformCrmCaptureResultsSection />,
      },
      {
        id: 'v-analytics',
        label: 'Analytics',
        icon: I.LineChart,
        render: () => <PlatformCrmCaptureAnalyticsTab />,
      },
    ],
  },
  {
    id: 'vendas-gestao',
    label: 'Gestão',
    items: [
      {
        id: 'v-negocios',
        label: 'Negócios',
        icon: I.Package,
        // "Negócios" = catálogo de PRODUTOS do grupo (os SaaS que vendemos). Decisão
        // Marcelo D3-multiproduto (2026-07-02): 1 CRM vende N produtos → esta é a casa
        // deles. (Reverte a premissa mono-produto anterior de apontar pros planos.) Os
        // planos de assinatura do Beauty seguem no PlansManager DENTRO do módulo ERP.
        render: () => <PlatformCrmProductsSection />,
      },
      {
        id: 'v-setores',
        label: 'Setores',
        icon: I.Network,
        render: () => <PlatformCrmSectorsManager />,
      },
      {
        id: 'v-equipes',
        label: 'Equipes',
        icon: I.UsersRound,
        render: () => <PlatformCrmEquipes />,
      },
      {
        id: 'v-operacao',
        label: 'Central de Operação',
        icon: I.Activity,
        render: () => <PlatformCrmOperationCenter />,
      },
      {
        id: 'v-financeiro',
        label: 'Financeiro',
        icon: I.DollarSign,
        render: () => <PlatformCrmFinanceiro />,
      },
    ],
  },
  {
    id: 'vendas-config',
    label: 'Configurações',
    items: [
      {
        id: 'v-conexoes',
        label: 'Conexões',
        icon: I.Plug,
        render: () => <PlatformCrmConnectionsPanel />,
      },
      {
        id: 'v-integracoes',
        label: 'Integrações',
        icon: I.Plug,
        render: () => <PlatformCrmIntegrationsManager />,
      },
      {
        id: 'v-respostas',
        label: 'Respostas Rápidas',
        icon: I.MessagesSquare,
        render: () => <PlatformCrmQuickRepliesManager />,
      },
      {
        id: 'v-campos',
        label: 'Campos personalizados',
        icon: I.SlidersHorizontal,
        render: () => <PlatformCrmCustomFieldsManager />,
      },
      {
        id: 'v-etiquetas',
        label: 'Etiquetas',
        icon: I.Tags,
        render: () => <PlatformCrmTagsManager />,
      },
      {
        id: 'v-notificacoes',
        label: 'Notificações',
        icon: I.BellRing,
        render: () => <PlatformCrmNotificationManager />,
      },
      {
        id: 'v-horarios',
        label: 'Horários',
        icon: I.Clock,
        render: () => <PlatformCrmBusinessHoursManager />,
      },
    ],
  },
];

// ════════════════════════════════════════════════════════════
// Registry final. Ordem = ordem no ModuleSwitcher.
// ════════════════════════════════════════════════════════════
export const PLATFORM_MODULES: PlatformModuleDefinition[] = [
  {
    id: 'erp',
    label: 'Gestão',
    description: 'Gestão da plataforma, empresas e SaaS',
    icon: I.Building2,
    color: 'bg-slate-600',
    nav: ERP_NAV,
  },
  {
    id: 'vendas',
    label: 'Vendas',
    description: 'CRM da plataforma — pipeline, leads, atendimentos e captação',
    icon: I.Target,
    color: 'bg-primary',
    nav: VENDAS_NAV,
  },
];
