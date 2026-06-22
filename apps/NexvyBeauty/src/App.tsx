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
const ModuleHub = lazyWithRetry(() => import("./pages/ModuleHub"));
const Login = lazyWithRetry(() => import("./pages/Login"));
const ResetPassword = lazyWithRetry(() => import("./pages/ResetPassword"));
const Admin = lazyWithRetry(() => import("./pages/Admin"));
const SuperAdmin = lazyWithRetry(() => import("./pages/SuperAdmin"));
const AcceptInvite = lazyWithRetry(() => import("./pages/AcceptInvite"));
const NotFound = lazyWithRetry(() => import("./pages/NotFound"));
const Install = lazyWithRetry(() => import("./pages/Install"));
const PublicForm = lazyWithRetry(() => import("./pages/PublicForm"));
const PublicChat = lazyWithRetry(() => import("./pages/PublicChat"));
const PublicQuiz = lazyWithRetry(() => import("./pages/PublicQuiz"));

const SalesPage = lazyWithRetry(() => import("./pages/SalesPage"));

const PublicBooking = lazyWithRetry(() => import("./pages/PublicBooking"));
const BookingConfirmation = lazyWithRetry(() => import("./pages/BookingConfirmation"));
const Profile = lazyWithRetry(() => import("./pages/Profile"));
const Settings = lazyWithRetry(() => import("./pages/Settings"));
const HelpCenter = lazyWithRetry(() => import("./pages/HelpCenter"));
const HelpArticle = lazyWithRetry(() => import("./pages/HelpArticle"));
const Updates = lazyWithRetry(() => import("./pages/Updates"));
const Unsubscribe = lazyWithRetry(() => import("./pages/Unsubscribe"));
const Docs = lazyWithRetry(() => import("./pages/Docs"));
const Termos = lazyWithRetry(() => import("./pages/Termos"));
const Privacidade = lazyWithRetry(() => import("./pages/Privacidade"));

// ERP Oficina (Clientes, Veículos, OS, Orçamentos, Financeiro)
const OficinaDashboard = lazyWithRetry(() => import("./pages/oficina/Dashboard"));
const OficinaClientes = lazyWithRetry(() => import("./pages/oficina/Clientes"));
const OficinaVeiculos = lazyWithRetry(() => import("./pages/oficina/Veiculos"));
const OficinaOrdens = lazyWithRetry(() => import("./pages/oficina/Ordens"));
const OficinaOrcamentos = lazyWithRetry(() => import("./pages/oficina/Orcamentos"));
const OficinaFinanceiro = lazyWithRetry(() => import("./pages/oficina/Financeiro"));

// ERP Salão (NexvyBeauty: Agenda, Profissionais, Serviços, Clientes, Financeiro)
const SalaoDashboard = lazyWithRetry(() => import("./pages/salao/Dashboard"));
const DemoSalaoDashboard = lazyWithRetry(() => import("./pages/salao/DemoDashboard"));
const DemoSalaoClientes = lazyWithRetry(() => import("./pages/salao/DemoClientes"));
const DemoSalaoServicos = lazyWithRetry(() => import("./pages/salao/DemoServicos"));
const DemoSalaoProfissionais = lazyWithRetry(() => import("./pages/salao/DemoProfissionais"));
const DemoSalaoFinanceiro = lazyWithRetry(() => import("./pages/salao/DemoFinanceiro"));
const DemoSalaoAgenda = lazyWithRetry(() => import("./pages/salao/DemoAgenda"));
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
              
              <Route path="/agendar/:userSlug" element={<PublicBooking />} />
              <Route path="/agendar/:userSlug/:eventSlug" element={<PublicBooking />} />
              <Route path="/confirmar/:token" element={<BookingConfirmation />} />
              <Route path="/vendas" element={<SalesPage />} />
              {/* Demo público do salão (sem login) — estilo beauty-flow */}
              <Route path="/demo" element={<Navigate to="/demo/salao" replace />} />
              <Route path="/demo/salao" element={<DemoSalaoDashboard />} />
              <Route path="/demo/salao/clientes" element={<DemoSalaoClientes />} />
              <Route path="/demo/salao/servicos" element={<DemoSalaoServicos />} />
              <Route path="/demo/salao/profissionais" element={<DemoSalaoProfissionais />} />
              <Route path="/demo/salao/financeiro" element={<DemoSalaoFinanceiro />} />
              <Route path="/demo/salao/agenda" element={<DemoSalaoAgenda />} />
              <Route path="/whitelabel" element={<Navigate to="/" replace />} />
              <Route path="/reagendar/:token" element={<BookingConfirmation />} />
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
                    <ProtectedRoute>
                      <ModuleHub />
                    </ProtectedRoute>
                  )
                }
              />
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
              {/* ERP Oficina */}
              <Route path="/oficina" element={<ProtectedRoute><OficinaDashboard /></ProtectedRoute>} />
              <Route path="/oficina/clientes" element={<ProtectedRoute><OficinaClientes /></ProtectedRoute>} />
              <Route path="/oficina/veiculos" element={<ProtectedRoute><OficinaVeiculos /></ProtectedRoute>} />
              <Route path="/oficina/ordens" element={<ProtectedRoute><OficinaOrdens /></ProtectedRoute>} />
              <Route path="/oficina/orcamentos" element={<ProtectedRoute><OficinaOrcamentos /></ProtectedRoute>} />
              <Route path="/oficina/financeiro" element={<ProtectedRoute><OficinaFinanceiro /></ProtectedRoute>} />

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
