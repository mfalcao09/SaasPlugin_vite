import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import { EmpresaConfigProvider } from '@/hooks/useEmpresaConfig.jsx';
import { TenantAuthProvider } from '@/lib/TenantAuthContext';
import Onboarding from '@/pages/app/Onboarding';

// Auth pages (tenant)
import LoginTenant from '@/pages/auth/LoginTenant';
import TrocarSenha from '@/pages/auth/TrocarSenha';
import EsqueciSenha from '@/pages/auth/EsqueciSenha';
import ResetSenha from '@/pages/auth/ResetSenha';

// Admin Master
import AdminMaster from '@/pages/app/AdminMaster';
import SuperAdminGuard from '@/components/app/SuperAdminGuard';

// Public pages
import LandingPage from '@/pages/LandingPage';

// Demo layout + pages
import DemoLayout from '@/components/layout/DemoLayout';
import DemoDashboard from '@/pages/demo/DemoDashboard';
import DemoClientes from '@/pages/demo/DemoClientes';
import DemoVeiculos from '@/pages/demo/DemoVeiculos';
import DemoOrcamentos from '@/pages/demo/DemoOrcamentos';
import DemoOrdens from '@/pages/demo/DemoOrdens';
import DemoFinanceiro from '@/pages/demo/DemoFinanceiro';
import DemoRelatorios from '@/pages/demo/DemoRelatorios';
import DemoAIGrowth from '@/pages/demo/DemoAIGrowth';

// App layout + pages (tenant — usa TenantLayout)
import TenantLayout from '@/components/layout/TenantLayout';
import AppLayout from '@/components/layout/AppLayout';
import Dashboard from '@/pages/app/Dashboard';
import Clientes from '@/pages/app/Clientes';
import Veiculos from '@/pages/app/Veiculos';
import Orcamentos from '@/pages/app/Orcamentos';
import Ordens from '@/pages/app/Ordens';
import Financeiro from '@/pages/app/Financeiro';
import Relatorios from '@/pages/app/Relatorios';
import AIGrowth from '@/pages/app/AIGrowth';
import Equipe from '@/pages/app/Equipe';
import Configuracoes from '@/pages/app/Configuracoes';
import MasterPanelReal from '@/pages/app/MasterPanelReal';
import Leads from '@/pages/app/Leads';
import Metas from '@/pages/app/Metas';

const AuthenticatedApp = () => {
  const { isLoadingAuth, isLoadingPublicSettings, authError, navigateToLogin } = useAuth();

  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ backgroundColor: "var(--surface)" }}>
        <div className="w-6 h-6 border-2 rounded-full animate-spin" style={{ borderColor: "var(--line)", borderTopColor: "var(--brand)" }}></div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') {
      return <UserNotRegisteredError />;
    } else if (authError.type === 'auth_required') {
      navigateToLogin();
      return null;
    }
  }

  return (
    <Routes>
      {/* LP Pública */}
      <Route path="/" element={<LandingPage />} />

      {/* Demo pública — sem login */}
      <Route path="/demo/*" element={
        <DemoLayout>
          <Routes>
            <Route path="dashboard" element={<DemoDashboard />} />
            <Route path="clientes" element={<DemoClientes />} />
            <Route path="veiculos" element={<DemoVeiculos />} />
            <Route path="orcamentos" element={<DemoOrcamentos />} />
            <Route path="ordens" element={<DemoOrdens />} />
            <Route path="financeiro" element={<DemoFinanceiro />} />
            <Route path="relatorios" element={<DemoRelatorios />} />
            <Route path="ai-growth" element={<DemoAIGrowth />} />
          </Routes>
        </DemoLayout>
      } />

      {/* Auth tenant (sem layout) */}
      <Route path="/login" element={<LoginTenant />} />
      <Route path="/trocar-senha" element={<TrocarSenha />} />
      <Route path="/esqueci-senha" element={<EsqueciSenha />} />
      <Route path="/reset-senha" element={<ResetSenha />} />

      {/* Sistema real — requer sessão local tenant */}
      <Route path="/dashboard" element={<TenantLayout><Dashboard /></TenantLayout>} />
      <Route path="/clientes" element={<TenantLayout><Clientes /></TenantLayout>} />
      <Route path="/veiculos" element={<TenantLayout><Veiculos /></TenantLayout>} />
      <Route path="/orcamentos" element={<TenantLayout><Orcamentos /></TenantLayout>} />
      <Route path="/ordens" element={<TenantLayout><Ordens /></TenantLayout>} />
      <Route path="/financeiro" element={<TenantLayout><Financeiro /></TenantLayout>} />
      <Route path="/relatorios" element={<TenantLayout><Relatorios /></TenantLayout>} />
      <Route path="/ai-growth" element={<TenantLayout><AIGrowth /></TenantLayout>} />
      <Route path="/equipe" element={<TenantLayout><Equipe /></TenantLayout>} />
      <Route path="/configuracoes" element={<TenantLayout><Configuracoes /></TenantLayout>} />
      <Route path="/leads" element={<TenantLayout><Leads /></TenantLayout>} />
      <Route path="/metas" element={<TenantLayout><Metas /></TenantLayout>} />
      <Route path="/master" element={<AppLayout><SuperAdminGuard><MasterPanelReal /></SuperAdminGuard></AppLayout>} />
      <Route path="/adminmaster" element={<AppLayout><AdminMaster /></AppLayout>} />
      <Route path="/onboarding" element={<Onboarding />} />

      <Route path="*" element={<PageNotFound />} />
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <TenantAuthProvider>
        <EmpresaConfigProvider>
          <QueryClientProvider client={queryClientInstance}>
            <Router>
              <AuthenticatedApp />
            </Router>
            <Toaster />
          </QueryClientProvider>
        </EmpresaConfigProvider>
      </TenantAuthProvider>
    </AuthProvider>
  )
}

export default App