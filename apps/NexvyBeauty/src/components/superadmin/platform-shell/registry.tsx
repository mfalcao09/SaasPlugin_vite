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
import { PlatformCrmKanban } from '@/components/superadmin/crm/kanban/PlatformCrmKanban';
import { PlatformCrmLeadsManager } from '@/components/superadmin/crm/leads/PlatformCrmLeadsManager';

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
// MÓDULO VENDAS (CRM) — só platform_crm + stub EmBreve
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
        render: () => <EmBreve titulo="Dashboard de Vendas" />,
      },
      {
        id: 'v-funil',
        label: 'Funil',
        icon: I.KanbanSquare,
        render: () => <PlatformCrmKanban />,
      },
      {
        id: 'v-contatos',
        label: 'Contatos',
        icon: I.Contact,
        render: () => <PlatformCrmLeadsManager />,
      },
      {
        id: 'v-agenda',
        label: 'Agenda',
        icon: I.CalendarDays,
        render: () => <EmBreve titulo="Agenda" />,
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
        render: () => <EmBreve titulo="Chat" />,
      },
      {
        id: 'v-painel',
        label: 'Painel',
        icon: I.LayoutPanelTop,
        render: () => <EmBreve titulo="Painel de Atendimentos" />,
      },
      {
        id: 'v-radar-ia',
        label: 'Radar IA',
        icon: I.Radar,
        render: () => <EmBreve titulo="Radar IA" />,
      },
      {
        id: 'v-follow-up',
        label: 'Follow-Up',
        icon: I.Repeat,
        render: () => <EmBreve titulo="Follow-Up" />,
      },
      {
        id: 'v-relatorios-atend',
        label: 'Relatórios',
        icon: I.BarChart3,
        render: () => <EmBreve titulo="Relatórios de Atendimento" />,
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
        render: () => <EmBreve titulo="Agentes IA" />,
      },
      {
        id: 'v-campanhas',
        label: 'Campanhas',
        icon: I.Megaphone,
        render: () => <EmBreve titulo="Campanhas" />,
      },
      {
        id: 'v-cadencias',
        label: 'Cadências',
        icon: I.Send,
        render: () => <EmBreve titulo="Cadências" />,
      },
      {
        id: 'v-webhooks',
        label: 'Webhooks',
        icon: I.Webhook,
        render: () => <EmBreve titulo="Webhooks" />,
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
        render: () => <EmBreve titulo="Quiz" />,
      },
      {
        id: 'v-formularios',
        label: 'Formulários',
        icon: I.FormInput,
        render: () => <EmBreve titulo="Formulários" />,
      },
      {
        id: 'v-chatbot',
        label: 'ChatBot',
        icon: I.MessageCircle,
        render: () => <EmBreve titulo="ChatBot" />,
      },
      {
        id: 'v-widget',
        label: 'Widget',
        icon: I.MousePointerClick,
        render: () => <EmBreve titulo="Widget" />,
      },
      {
        id: 'v-whatsapp',
        label: 'WhatsApp',
        icon: I.MessageCircleMore,
        render: () => <EmBreve titulo="WhatsApp (Captação)" />,
      },
      {
        id: 'v-templates',
        label: 'Templates',
        icon: I.LayoutTemplate,
        render: () => <EmBreve titulo="Templates" />,
      },
      {
        id: 'v-resultados',
        label: 'Resultados',
        icon: I.Trophy,
        render: () => <EmBreve titulo="Resultados" />,
      },
      {
        id: 'v-analytics',
        label: 'Analytics',
        icon: I.LineChart,
        render: () => <EmBreve titulo="Analytics" />,
      },
    ],
  },
  {
    id: 'vendas-gestao',
    label: 'Gestão de Vendas',
    items: [
      {
        id: 'v-negocios',
        label: 'Negócios',
        icon: I.Briefcase,
        render: () => <EmBreve titulo="Negócios" />,
      },
      {
        id: 'v-comissoes',
        label: 'Comissões',
        icon: I.DollarSign,
        render: () => <EmBreve titulo="Comissões" />,
      },
      {
        id: 'v-metas',
        label: 'Metas',
        icon: I.Goal,
        render: () => <EmBreve titulo="Metas" />,
      },
      {
        id: 'v-setores',
        label: 'Setores',
        icon: I.Network,
        render: () => <EmBreve titulo="Setores" />,
      },
      {
        id: 'v-equipes',
        label: 'Equipes',
        icon: I.UsersRound,
        render: () => <EmBreve titulo="Equipes" />,
      },
    ],
  },
  {
    id: 'vendas-config',
    label: 'Config de Vendas',
    items: [
      {
        id: 'v-campos',
        label: 'Campos',
        icon: I.SlidersHorizontal,
        render: () => <EmBreve titulo="Campos" />,
      },
      {
        id: 'v-etiquetas',
        label: 'Etiquetas',
        icon: I.Tags,
        render: () => <EmBreve titulo="Etiquetas" />,
      },
      {
        id: 'v-notificacoes',
        label: 'Notificações',
        icon: I.BellRing,
        render: () => <EmBreve titulo="Notificações" />,
      },
      {
        id: 'v-horarios',
        label: 'Horários',
        icon: I.Clock,
        render: () => <EmBreve titulo="Horários" />,
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
    description: 'CRM da plataforma — funil, contatos e captação',
    icon: I.Target,
    color: 'bg-primary',
    nav: VENDAS_NAV,
  },
];
