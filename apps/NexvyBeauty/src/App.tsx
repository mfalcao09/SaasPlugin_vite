import { Component, Suspense, type ReactNode } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ThemeProvider } from "next-themes";
import { AuthProvider } from "@/hooks/useAuth";
import { SuperAdminViewProvider } from "@/hooks/useSuperAdminView";
import { SuperAdminViewChoiceDialog } from "@/components/auth/SuperAdminViewChoiceDialog";
import { FooterDecoration } from "@/components/layout/FooterDecoration";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import { SuperAdminRoute } from "@/components/auth/SuperAdminRoute";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { WheelLoader } from "@/components/brand/WheelLoader";
import { usePlatformBranding } from "@/hooks/usePlatformBranding";
import { lazyWithRetry } from "@/lib/lazyWithRetry";
import { isApexDomain, isGestaoHostname } from "@/lib/publicUrl";

// Lazy load all pages for code splitting
const Index = lazyWithRetry(() => import("./pages/Index"));
// Cockpit V1 — casca única da cabeleireira (substitui o ModuleHub no "/").
const CockpitShell = lazyWithRetry(() => import("./cockpit/CockpitShell"));
const HomeDeValor = lazyWithRetry(() => import("./cockpit/HomeDeValor")); // agora em /ai-growth
const CockpitInicio = lazyWithRetry(() => import("./cockpit/Inicio")); // novo Início (em branco, reconstruir)
const Relatorios = lazyWithRetry(() => import("./cockpit/Relatorios")); // Relatórios & Gestão
// Demo público da página Relatórios (dados de exemplo — orgs ainda sem dados reais).
const DemoRelatorios = lazyWithRetry(() => import("./cockpit/Relatorios").then(m => ({ default: () => <m.default demo={m.DEMO_RELATORIOS} /> })));
// AI Growth — motor MACRO (oportunidades de receita do histórico do negócio).
const AiGrowth = lazyWithRetry(() => import("./cockpit/AiGrowth"));
const DemoAiGrowth = lazyWithRetry(() => import("./cockpit/AiGrowth").then(m => ({ default: () => <m.default demo={m.DEMO_AIGROWTH} /> })));
// Comercial — páginas extraídas das abas do Conversas (Painel/Radar IA/Relatórios).
const CockpitPainel = lazyWithRetry(() => import("./cockpit/Painel"));
const CockpitRadar = lazyWithRetry(() => import("./cockpit/RadarIA"));
const RelatoriosAtendimento = lazyWithRetry(() => import("./cockpit/RelatoriosComercial"));
const CockpitTarefas = lazyWithRetry(() => import("./cockpit/Tarefas"));
const CaptacaoHub = lazyWithRetry(() => import("./cockpit/CaptacaoHub"));
const MinhaIAHub = lazyWithRetry(() => import("./cockpit/MinhaIAHub"));
const CockpitPacotes = lazyWithRetry(() => import("./cockpit/Pacotes")); // catálogo + vender/baixa presencial
// Reentrada no onboarding guiado (V3) para quem pulou o 1º acesso.
const ConfigurarOnboarding = lazyWithRetry(() => import("./cockpit/ConfigurarOnboarding"));
const CockpitConversas = lazyWithRetry(() => import("@/components/admin/InboxManager").then(m => ({ default: m.InboxManager })));
// CRM migrado do painel admin → Comercial (kanban de pipeline + central de leads).
const CockpitPipeline = lazyWithRetry(() => import("@/components/admin/kanban/KanbanBoard").then(m => ({ default: m.KanbanBoard })));
const CockpitLeads = lazyWithRetry(() => import("@/components/admin/leads/LeadsManager").then(m => ({ default: m.LeadsManager })));
// Gestão migrada do admin → cockpit (Produtos/Setores/Equipes).
const CockpitProdutos = lazyWithRetry(() => import("./cockpit/Produtos"));
const CockpitSetores = lazyWithRetry(() => import("./cockpit/Setores"));
const CockpitEquipes = lazyWithRetry(() => import("./cockpit/Equipes"));
// Configurações migradas do admin → cockpit (Gestão), como páginas individuais.
// Reusam os mesmos managers do admin (cada um já renderiza seu header).
const CockpitConexoes = lazyWithRetry(() => import("@/components/admin/integrations/EvolutionInstancesPanel").then(m => ({ default: m.EvolutionInstancesPanel })));
const CockpitWebhooks = lazyWithRetry(() => import("@/components/admin/webhooks/WebhooksManager").then(m => ({ default: m.WebhooksManager })));
const CockpitRespostas = lazyWithRetry(() => import("@/components/admin/QuickRepliesManager").then(m => ({ default: m.QuickRepliesManager })));
const CockpitCampos = lazyWithRetry(() => import("@/components/admin/CustomFieldsManager").then(m => ({ default: m.CustomFieldsManager })));
const CockpitEtiquetas = lazyWithRetry(() => import("@/components/admin/tags/TagsManager").then(m => ({ default: m.TagsManager })));
const CockpitNotificacoes = lazyWithRetry(() => import("@/components/admin/NotificationManager").then(m => ({ default: m.NotificationManager })));
const CockpitHorarios = lazyWithRetry(() => import("@/components/admin/schedules/BusinessHoursManager").then(m => ({ default: m.BusinessHoursManager })));
const CockpitEmpresa = lazyWithRetry(() => import("@/components/admin/company/CompanySettings").then(m => ({ default: m.CompanySettings })));
const CockpitPlano = lazyWithRetry(() => import("@/components/admin/plan/PlanSelector").then(m => ({ default: m.PlanSelector })));
const CockpitSuporte = lazyWithRetry(() => import("@/components/admin/support/SupportTickets").then(m => ({ default: m.SupportTickets })));
const Login = lazyWithRetry(() => import("./pages/Login"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const SuperAdmin = lazyWithRetry(() => import("./pages/SuperAdmin"));
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const PublicForm = lazyWithRetry(() => import("./pages/PublicForm"));
const PublicSalaoBooking = lazyWithRetry(() => import("./pages/PublicSalaoBooking"));
const PublicSalaoPacotes = lazyWithRetry(() => import("./pages/PublicSalaoPacotes"));
const PublicChat = lazyWithRetry(() => import("./pages/PublicChat"));
const PublicQuiz = lazyWithRetry(() => import("./pages/PublicQuiz"));

const SalesPage = lazyWithRetry(() => import("./pages/SalesPage"));

const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const HelpCenter = lazyWithRetry(() => import("./pages/HelpCenter"));
const HelpArticle = lazyWithRetry(() => import("./pages/HelpArticle"));
const Updates = lazyWithRetry(() => import("./pages/Updates"));
const Unsubscribe = lazyWithRetry(() => import("./pages/Unsubscribe"));
const Docs = lazyWithRetry(() => import("./pages/Docs"));
const Termos = lazyWithRetry(() => import("./pages/Termos"));
const Privacidade = lazyWithRetry(() => import("./pages/Privacidade"));

// ERP Salão (NexvyBeauty: Agenda, Profissionais, Serviços, Clientes, Financeiro)
const SalaoDashboard = lazyWithRetry(() => import("./pages/salao/Dashboard"));
const DemoSalaoDashboard = lazyWithRetry(() => import("./pages/salao/DemoDashboard"));
const DemoSalaoClientes = lazyWithRetry(() => import("./pages/salao/DemoClientes"));
const DemoSalaoServicos = lazyWithRetry(() => import("./pages/salao/DemoServicos"));
const DemoSalaoProfissionais = lazyWithRetry(() => import("./pages/salao/DemoProfissionais"));
const DemoSalaoFinanceiro = lazyWithRetry(() => import("./pages/salao/DemoFinanceiro"));
const DemoSalaoAgenda = lazyWithRetry(() => import("./pages/salao/DemoAgenda"));
const DemoCockpitHome = lazyWithRetry(() => import("./cockpit/DemoCockpitHome"));
const SalaoAgenda = lazyWithRetry(() => import("./pages/salao/Agenda"));
const SalaoProfissionais = lazyWithRetry(() => import("./pages/salao/Profissionais"));
const SalaoServicos = lazyWithRetry(() => import("./pages/salao/Servicos"));
const SalaoClientes = lazyWithRetry(() => import("./pages/salao/Clientes"));
const SalaoFinanceiro = lazyWithRetry(() => import("./pages/salao/Financeiro"));

// Global loading fallback
const PageLoader = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <WheelLoader size={64} />
  </div>
);

// Optimized QueryClient with global cache settings
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,
      gcTime: 1000 * 60 * 10,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      retry: 1,
      // 'online' (default) blocks queries while the browser thinks it is offline,
      // which on mobile can leave the UI stuck on a spinner. 'always' lets the
      // query run and surface a real error/empty state instead.
      networkMode: 'always',
    },
    mutations: {
      networkMode: 'always',
    },
  },
});

// Component to apply platform branding
function PlatformBrandingLoader() {
  usePlatformBranding();
  return null;
}

class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error) {
    console.error('[RouteErrorBoundary]', error);
  }

  handleReload = () => {
    if ('caches' in window) {
      caches.keys().then((keys) => keys.forEach((key) => caches.delete(key))).catch(() => {});
    }
    window.location.reload();
  };

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-6 text-center">
          <div className="max-w-sm space-y-4">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-6 w-6 text-destructive" />
            </div>
            <div className="space-y-2">
              <h1 className="text-lg font-semibold text-foreground">Não foi possível carregar a aplicação</h1>
              <p className="text-sm text-muted-foreground">A versão local ficou desatualizada. Recarregue para buscar a versão mais recente.</p>
            </div>
            <button
              type="button"
              onClick={this.handleReload}
              className="inline-flex h-10 items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
            >
              <RefreshCw className="mr-2 h-4 w-4" />
              Recarregar
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <AuthProvider>
        <TooltipProvider>
        <PlatformBrandingLoader />
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <SuperAdminViewProvider>
          <SuperAdminViewChoiceDialog />
          <FooterDecoration />
          <RouteErrorBoundary>
            <Suspense fallback={<PageLoader />}>
              <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/aceitar-convite" element={<AcceptInvite />} />

              <Route path="/install" element={<Install />} />
              <Route path="/f/:slug" element={<PublicForm />} />
              <Route path="/c/:slug" element={<PublicChat />} />
              <Route path="/q/:slug" element={<PublicQuiz />} />

              <Route path="/vendas" element={<SalesPage />} />
              {/* Demo público (sem login). /demo → Home de Valor (o pitch que vende);
                  o painel do salão fica em /demo/salao. */}
              <Route path="/demo" element={<Navigate to="/demo/cockpit" replace />} />
              <Route path="/demo/cockpit" element={<DemoCockpitHome />} />
              <Route path="/demo/salao" element={<DemoSalaoDashboard />} />
              <Route path="/demo/salao/clientes" element={<DemoSalaoClientes />} />
              <Route path="/demo/salao/servicos" element={<DemoSalaoServicos />} />
              <Route path="/demo/salao/profissionais" element={<DemoSalaoProfissionais />} />
              <Route path="/demo/salao/financeiro" element={<DemoSalaoFinanceiro />} />
              <Route path="/demo/salao/agenda" element={<DemoSalaoAgenda />} />
              <Route path="/demo/relatorios" element={<DemoRelatorios />} />
              <Route path="/demo/ai-growth" element={<DemoAiGrowth />} />
              {/* Onda 2 — booking público de salão (por-org, slug) */}
              <Route path="/s/:slug" element={<PublicSalaoBooking />} />
              <Route path="/s/:slug/pacotes" element={<PublicSalaoPacotes />} />
              <Route path="/whitelabel" element={<Navigate to="/" replace />} />
              <Route path="/unsubscribe" element={<Unsubscribe />} />

              {/* Jurídico público (sem login) */}
              <Route path="/termos" element={<Termos />} />
              <Route path="/privacidade" element={<Privacidade />} />

              {/* Documentação pública (sem login) */}
              <Route path="/docs" element={<Docs />} />
              <Route path="/docs/:track" element={<Docs />} />
              <Route path="/docs/:track/:slug" element={<Docs />} />

              {/* Home: no apex (marketing) mostra a LP de vendas; no app.*
                  mostra o hub autenticado. Visitante anônimo no apex NÃO cai
                  mais no login. */}
              <Route
                path="/"
                element={
                  isGestaoHostname() ? (
                    // gestao.nexvybeauty.com.br → painel de gestão da plataforma
                    // (super-admin), isolado do app do salão.
                    <SuperAdminRoute>
                      <SuperAdmin />
                    </SuperAdminRoute>
                  ) : isApexDomain() ? (
                    <SalesPage />
                  ) : (
                    // app.* → Cockpit (casca única de 7 itens). As rotas-filhas
                    // abaixo renderizam no <Outlet/> do CockpitShell; no gestao/apex
                    // o element não tem Outlet, então elas simplesmente não aparecem.
                    <ProtectedRoute>
                      <CockpitShell />
                    </ProtectedRoute>
                  )
                }
              >
                <Route index element={<CockpitInicio />} />
                <Route path="ai-growth" element={<AiGrowth />} />
                <Route path="painel" element={<CockpitPainel />} />
                <Route path="conversas" element={<CockpitConversas />} />
                <Route path="pipeline" element={<CockpitPipeline />} />
                <Route path="leads" element={<CockpitLeads />} />
                <Route path="produtos" element={<CockpitProdutos />} />
                <Route path="setores" element={<CockpitSetores />} />
                <Route path="equipes" element={<CockpitEquipes />} />
                {/* Configurações (migradas do admin → páginas individuais no Gestão). */}
                <Route path="conexoes" element={<div className="p-6"><CockpitConexoes /></div>} />
                <Route path="webhooks" element={<div className="p-6"><CockpitWebhooks /></div>} />
                <Route path="respostas-rapidas" element={<div className="p-6"><CockpitRespostas /></div>} />
                <Route path="campos-personalizados" element={<div className="p-6"><CockpitCampos /></div>} />
                <Route path="etiquetas" element={<div className="p-6"><CockpitEtiquetas /></div>} />
                <Route path="notificacoes" element={<div className="p-6"><CockpitNotificacoes /></div>} />
                <Route path="horarios" element={<div className="p-6"><CockpitHorarios /></div>} />
                <Route path="empresa" element={<div className="p-6"><CockpitEmpresa /></div>} />
                <Route path="plano" element={<div className="p-6"><CockpitPlano /></div>} />
                <Route path="suporte" element={<div className="p-6"><CockpitSuporte scope="admin" /></div>} />
                <Route path="radar" element={<CockpitRadar />} />
                <Route path="tarefas" element={<CockpitTarefas />} />
                <Route path="relatorios-comerciais" element={<RelatoriosAtendimento />} />
                <Route path="clientes" element={<SalaoClientes bare />} />
                <Route path="servicos" element={<SalaoServicos bare />} />
                <Route path="pacotes" element={<CockpitPacotes />} />
                <Route path="atrair" element={<CaptacaoHub />} />
                <Route path="minha-ia" element={<MinhaIAHub />} />
                <Route path="agenda" element={<SalaoAgenda bare />} />
                <Route path="relatorios" element={<Relatorios />} />
                <Route path="faturamento" element={<SalaoFinanceiro bare />} />
                {/* Reentrada no onboarding guiado (quem pulou o 1º acesso). */}
                <Route path="configurar" element={<ConfigurarOnboarding />} />
              </Route>
              {/* CRM de Vendas (app do vendedor — antigo "/") */}
              <Route
                path="/crm"
                element={
                  <ProtectedRoute>
                    <Index />
                  </ProtectedRoute>
                }
              />
              {/* PWA / atalhos antigos podem abrir em /index ou /home — redireciona */}
              <Route path="/index" element={<Navigate to="/" replace />} />
              <Route path="/home" element={<Navigate to="/" replace />} />
              <Route 
                path="/ajuda" 
                element={<ProtectedRoute><HelpCenter /></ProtectedRoute>} 
              />
              <Route 
                path="/ajuda/:slug" 
                element={<ProtectedRoute><HelpArticle /></ProtectedRoute>} 
              />
              <Route 
                path="/novidades" 
                element={<ProtectedRoute><Updates /></ProtectedRoute>} 
              />
              <Route 
                path="/admin" 
                element={
                  <ProtectedRoute>
                    <Admin />
                  </ProtectedRoute>
                } 
              />
              {/* ERP Salão (NexvyBeauty) */}
              <Route path="/salao" element={<ProtectedRoute><SalaoDashboard /></ProtectedRoute>} />
              <Route path="/salao/agenda" element={<ProtectedRoute><SalaoAgenda /></ProtectedRoute>} />
              <Route path="/salao/profissionais" element={<ProtectedRoute><SalaoProfissionais /></ProtectedRoute>} />
              <Route path="/salao/servicos" element={<ProtectedRoute><SalaoServicos /></ProtectedRoute>} />
              <Route path="/salao/clientes" element={<ProtectedRoute><SalaoClientes /></ProtectedRoute>} />
              <Route path="/salao/financeiro" element={<ProtectedRoute><SalaoFinanceiro /></ProtectedRoute>} />
              <Route
                path="/perfil"
                element={
                  <ProtectedRoute>
                    <Profile />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/configuracoes" 
                element={
                  <ProtectedRoute>
                    <Settings />
                  </ProtectedRoute>
                } 
              />
              <Route 
                path="/super-admin" 
                element={
                  <SuperAdminRoute>
                    <SuperAdmin />
                  </SuperAdminRoute>
                } 
              />
              <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
          </RouteErrorBoundary>
          </SuperAdminViewProvider>
        </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
