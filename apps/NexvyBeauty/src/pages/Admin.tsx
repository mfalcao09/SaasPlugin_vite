import { useState, Suspense, useEffect, useRef, useTransition, useCallback } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { Navigate, useSearchParams } from 'react-router-dom';
import { useIsMobile } from '@/hooks/use-mobile';
import { AdminSidebar } from '@/components/admin/AdminSidebar';
import { MobileAdminLayout } from '@/components/admin/MobileAdminLayout';
import { ComingSoonSection } from '@/components/admin/ComingSoonSection';
import { SectionErrorBoundary } from '@/components/admin/SectionErrorBoundary';
import { lazyWithRetry, prefetch, onIdle } from '@/lib/lazyWithRetry';
import { allMenuItems } from '@/config/adminMenu';
import { AppTopBar } from '@/components/layout/AppTopBar';

// Factories nomeadas para podermos reutilizá-las no prefetch on-hover.
const f = {
  OperationCenter: () => import('@/components/admin/operation/OperationCenter').then(m => ({ default: m.OperationCenter })),
  TeamManager: () => import('@/components/admin/TeamManager').then(m => ({ default: m.TeamManager })),
  FinancialDashboard: () => import('@/components/admin/FinancialDashboard').then(m => ({ default: m.FinancialDashboard })),
  IntegrationsManager: () => import('@/components/admin/integrations/IntegrationsManager').then(m => ({ default: m.IntegrationsManager })),
  NotificationManager: () => import('@/components/admin/NotificationManager').then(m => ({ default: m.NotificationManager })),
  ProductListPage: () => import('@/components/admin/products/ProductListPage').then(m => ({ default: m.ProductListPage })),
  ProductDetailPage: () => import('@/components/admin/products/ProductDetailPage').then(m => ({ default: m.ProductDetailPage })),
  LeadsManager: () => import('@/components/admin/leads/LeadsManager').then(m => ({ default: m.LeadsManager })),
  KanbanBoard: () => import('@/components/admin/kanban/KanbanBoard').then(m => ({ default: m.KanbanBoard })),
  InboxManager: () => import('@/components/admin/InboxManager').then(m => ({ default: m.InboxManager })),
  ReportsManager: () => import('@/components/admin/reports/ReportsManager').then(m => ({ default: m.ReportsManager })),
  
  WebhooksManager: () => import('@/components/admin/webhooks/WebhooksManager').then(m => ({ default: m.WebhooksManager })),
  CustomFieldsManager: () => import('@/components/admin/CustomFieldsManager').then(m => ({ default: m.CustomFieldsManager })),
  AgentsManager: () => import('@/components/admin/agents/AgentsManager').then(m => ({ default: m.AgentsManager })),
  SectorsManager: () => import('@/components/admin/sectors/SectorsManager').then(m => ({ default: m.SectorsManager })),
  PlanSelector: () => import('@/components/admin/plan/PlanSelector').then(m => ({ default: m.PlanSelector })),
  CaktoAdminPanel: () => import('@/components/admin/payments/CaktoAdminPanel').then(m => ({ default: m.CaktoAdminPanel })),
  EvolutionInstancesPanel: () => import('@/components/admin/integrations/EvolutionInstancesPanel').then(m => ({ default: m.EvolutionInstancesPanel })),
  TagsManager: () => import('@/components/admin/tags/TagsManager').then(m => ({ default: m.TagsManager })),
  BusinessHoursManager: () => import('@/components/admin/schedules/BusinessHoursManager').then(m => ({ default: m.BusinessHoursManager })),
  CompanySettings: () => import('@/components/admin/company/CompanySettings').then(m => ({ default: m.CompanySettings })),
  SupportTickets: () => import('@/components/admin/support/SupportTickets').then(m => ({ default: m.SupportTickets })),
  QuickRepliesManager: () => import('@/components/admin/QuickRepliesManager').then(m => ({ default: m.QuickRepliesManager })),
  CampaignsManager: () => import('@/components/admin/campaigns/CampaignsManager').then(m => ({ default: m.CampaignsManager })),
  CadencesManager: () => import('@/components/admin/cadences/CadencesManager').then(m => ({ default: m.CadencesManager })),
  ChatBotSection: () => import('@/components/admin/capture/channels/ChatBotSection').then(m => ({ default: m.ChatBotSection })),
  WhatsAppSection: () => import('@/components/admin/capture/channels/WhatsAppSection').then(m => ({ default: m.WhatsAppSection })),
  FormsSection: () => import('@/components/admin/capture/channels/FormsSection').then(m => ({ default: m.FormsSection })),
  WidgetSection: () => import('@/components/admin/capture/channels/WidgetSection').then(m => ({ default: m.WidgetSection })),
  QuizSection: () => import('@/components/admin/capture/channels/QuizSection').then(m => ({ default: m.QuizSection })),
  CaptureReportsSection: () => import('@/components/admin/capture/channels/CaptureReportsSection').then(m => ({ default: m.CaptureReportsSection })),
  CaptureTemplatesSection: () => import('@/components/admin/capture/channels/CaptureTemplatesSection').then(m => ({ default: m.CaptureTemplatesSection })),
  CaptureResultsSection: () => import('@/components/admin/capture/channels/CaptureResultsSection').then(m => ({ default: m.CaptureResultsSection })),
  CaptureAnalyticsSection: () => import('@/components/admin/capture/channels/CaptureAnalyticsSection').then(m => ({ default: m.CaptureAnalyticsSection })),
};

// Lazy components (com retry + cache compartilhado para prefetch).
const OperationCenter = lazyWithRetry(f.OperationCenter);
const TeamManager = lazyWithRetry(f.TeamManager);
const FinancialDashboard = lazyWithRetry(f.FinancialDashboard);
const IntegrationsManager = lazyWithRetry(f.IntegrationsManager);
const NotificationManager = lazyWithRetry(f.NotificationManager);
const ProductListPage = lazyWithRetry(f.ProductListPage);
const ProductDetailPage = lazyWithRetry(f.ProductDetailPage);
const LeadsManager = lazyWithRetry(f.LeadsManager);
const KanbanBoard = lazyWithRetry(f.KanbanBoard);
const InboxManager = lazyWithRetry(f.InboxManager);
const ReportsManager = lazyWithRetry(f.ReportsManager);

const WebhooksManager = lazyWithRetry(f.WebhooksManager);
const CustomFieldsManager = lazyWithRetry(f.CustomFieldsManager);
const AgentsManager = lazyWithRetry(f.AgentsManager);
const SectorsManager = lazyWithRetry(f.SectorsManager);
const PlanSelector = lazyWithRetry(f.PlanSelector);
const CaktoAdminPanel = lazyWithRetry(f.CaktoAdminPanel);
const EvolutionInstancesPanel = lazyWithRetry(f.EvolutionInstancesPanel);
const TagsManager = lazyWithRetry(f.TagsManager);
const BusinessHoursManager = lazyWithRetry(f.BusinessHoursManager);
const CompanySettings = lazyWithRetry(f.CompanySettings);
const SupportTickets = lazyWithRetry(f.SupportTickets);
const QuickRepliesManager = lazyWithRetry(f.QuickRepliesManager);
const CampaignsManager = lazyWithRetry(f.CampaignsManager);
const CadencesManager = lazyWithRetry(f.CadencesManager);
const ChatBotSection = lazyWithRetry(f.ChatBotSection);
const WhatsAppSection = lazyWithRetry(f.WhatsAppSection);
const FormsSection = lazyWithRetry(f.FormsSection);
const WidgetSection = lazyWithRetry(f.WidgetSection);
const QuizSection = lazyWithRetry(f.QuizSection);
const CaptureReportsSection = lazyWithRetry(f.CaptureReportsSection);
const CaptureTemplatesSection = lazyWithRetry(f.CaptureTemplatesSection);
const CaptureResultsSection = lazyWithRetry(f.CaptureResultsSection);
const CaptureAnalyticsSection = lazyWithRetry(f.CaptureAnalyticsSection);

/**
 * Mapa: id da seção → factory de import. Usado pelo prefetch on-hover
 * (AdminSidebar/MobileAdminLayout chamam `prefetchSection(id)`).
 */
const sectionFactories: Record<string, () => Promise<unknown>> = {
  dashboard: f.OperationCenter,
  leads: f.LeadsManager,
  pipeline: f.KanbanBoard,
  inbox: f.InboxManager,
  agents: f.AgentsManager,
  
  team: f.TeamManager,
  products: f.ProductListPage,
  reports: f.ReportsManager,
  financial: f.FinancialDashboard,
  notifications: f.NotificationManager,
  webhooks: f.WebhooksManager,
  'custom-fields': f.CustomFieldsManager,
  integrations: f.IntegrationsManager,
  sectors: f.SectorsManager,
  plan: f.PlanSelector,
  payments: f.CaktoAdminPanel,
  connections: f.EvolutionInstancesPanel,
  tags: f.TagsManager,
  schedules: f.BusinessHoursManager,
  company: f.CompanySettings,
  support: f.SupportTickets,
  'quick-replies': f.QuickRepliesManager,
  campaigns: f.CampaignsManager,
  cadences: f.CadencesManager,
  'capture-chatbot': f.ChatBotSection,
  'capture-whatsapp': f.WhatsAppSection,
  'capture-forms': f.FormsSection,
  'capture-widget': f.WidgetSection,
  'capture-quiz': f.QuizSection,
  'capture-reports': f.CaptureReportsSection,
  'capture-analytics': f.CaptureReportsSection,
};

export function prefetchAdminSection(id: string) {
  const factory = sectionFactories[id];
  if (factory) prefetch(factory);
}

export default function Admin() {
  const { isAdmin, isManager } = useAuth();
  const isMobile = useIsMobile();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = searchParams.get('tab') || 'dashboard';
  const [activeSection, setActiveSection] = useState(initialTab);
  const [selectedProductId, setSelectedProductId] = useState<string | null>(null);
  const [, startTransition] = useTransition();

  // Cache de seções já visitadas — mantemos elas montadas (apenas escondidas)
  // para que a 2ª visita seja instantânea.
  const visitedRef = useRef<Set<string>>(new Set([activeSection]));
  visitedRef.current.add(activeSection);

  // Sincroniza tab da URL → estado (permite navegação programática via ?tab=plan)
  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && tab !== activeSection) {
      setActiveSection(tab);
      visitedRef.current.add(tab);
    }
  }, [searchParams, activeSection]);

  // Prefetch agressivo: assim que o app carrega, baixamos no idle todas as
  // seções principais. O usuário sente "clicou, abriu".
  useEffect(() => {
    onIdle(() => {
      Object.values(f).forEach((factory) => prefetch(factory));
    }, 2500);
  }, []);

  if (!isAdmin() && !isManager()) {
    return <Navigate to="/" replace />;
  }

  const handleSectionChange = useCallback((id: string) => {
    // Garante que o chunk começa a baixar antes da transição (caso ainda
    // não tenha sido prefechado).
    prefetchAdminSection(id);
    // Mantém ?tab=... na URL para que reload preserve a seção atual.
    const next = new URLSearchParams(searchParams);
    next.set('tab', id);
    setSearchParams(next, { replace: true });
    startTransition(() => setActiveSection(id));
  }, [searchParams, setSearchParams]);

  const handleProductSelect = (productId: string) => {
    setSelectedProductId(productId);
  };

  const handleBackToProducts = () => {
    setSelectedProductId(null);
  };

  // Renderiza o conteúdo de UMA seção específica.
  const renderSection = (sectionId: string) => {
    if (sectionId === 'products' && selectedProductId) {
      return (
        <ProductDetailPage
          productId={selectedProductId}
          onBack={handleBackToProducts}
        />
      );
    }

    const menuItem = allMenuItems.find((i) => i.id === sectionId);
    if (menuItem?.comingSoon) {
      return <ComingSoonSection title={menuItem.label} />;
    }

    switch (sectionId) {
      case 'dashboard': return <OperationCenter />;
      case 'leads': return <LeadsManager />;
      case 'pipeline': return <KanbanBoard />;
      // Agenda unificada: a antiga UI Calendly (CalendarManager) saiu.
      // A agenda do salão vive em /salao/agenda (views Mês/Semana/Dia/Lista).
      case 'calendar': return <Navigate to="/salao/agenda" replace />;
      case 'inbox': return <InboxManager />;
      case 'agents': return <AgentsManager />;
      
      case 'team': return <TeamManager />;
      case 'products': return <ProductListPage onProductSelect={handleProductSelect} />;
      case 'reports': return <ReportsManager />;
      case 'financial': return <FinancialDashboard />;
      case 'notifications': return <NotificationManager />;
      case 'webhooks': return <WebhooksManager />;
      case 'custom-fields': return <CustomFieldsManager />;
      case 'integrations': return <IntegrationsManager />;
      case 'sectors': return <SectorsManager />;
      case 'plan': return <PlanSelector />;
      case 'payments': return <CaktoAdminPanel />;
      case 'connections': return <EvolutionInstancesPanel />;
      case 'tags': return <TagsManager />;
      case 'schedules': return <BusinessHoursManager />;
      case 'company': return <CompanySettings />;
      case 'support': return <SupportTickets scope="admin" />;
      case 'quick-replies': return <QuickRepliesManager />;
      case 'campaigns': return <CampaignsManager />;
      case 'cadences': return <CadencesManager />;
      case 'capture-chatbot': return <ChatBotSection />;
      case 'capture-whatsapp': return <WhatsAppSection />;
      case 'capture-forms': return <FormsSection />;
      case 'capture-widget': return <WidgetSection />;
      case 'capture-quiz': return <QuizSection />;
      case 'capture-analytics':
        return <CaptureAnalyticsSection />;
      case 'capture-reports':
        return <CaptureReportsSection />;
      case 'capture-templates':
        return <CaptureTemplatesSection />;
      case 'capture-results':
        return <CaptureResultsSection />;
      default: return <OperationCenter />;
    }
  };

  // Renderiza TODAS as seções já visitadas, escondendo as inativas.
  // Resultado: revisitar uma seção é instantâneo (componente segue montado).
  const renderContent = () => (
    <>
      {Array.from(visitedRef.current).map((sectionId) => {
        const isActive = sectionId === activeSection;
        return (
          <div
            key={sectionId}
            // `hidden` remove do fluxo visual mas mantém o componente montado.
            hidden={!isActive}
            // Aria para acessibilidade quando a seção está oculta.
            aria-hidden={!isActive}
            style={!isActive ? { display: 'none' } : undefined}
          >
            <SectionErrorBoundary sectionName={sectionId}>
              {/* fallback={null} = nunca mostra spinner; useTransition mantém
                  a tela anterior visível enquanto o chunk novo baixa. */}
              <Suspense fallback={null}>{renderSection(sectionId)}</Suspense>
            </SectionErrorBoundary>
          </div>
        );
      })}
    </>
  );

  if (isMobile) {
    return (
      <MobileAdminLayout
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      >
        {renderContent()}
      </MobileAdminLayout>
    );
  }

  return (
    <div className="min-h-screen bg-background flex w-full">
      <AdminSidebar
        activeSection={activeSection}
        onSectionChange={handleSectionChange}
      />
      <main className="flex-1 overflow-auto">
        <AppTopBar title={allMenuItems.find((i) => i.id === activeSection)?.label ?? 'Administração'} />
        <div className="p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
}
