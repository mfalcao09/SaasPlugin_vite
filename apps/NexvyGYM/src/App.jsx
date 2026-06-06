import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

// Private app
import AppLayout from '@/components/layout/AppLayout';
import Onboarding from '@/pages/Onboarding';
import Dashboard from '@/pages/Dashboard';
import Alunos from '@/pages/Alunos';
import Planos from '@/pages/Planos';
import Checkins from '@/pages/Checkins';
import Agenda from '@/pages/Agenda';
import Financeiro from '@/pages/Financeiro';
import Relatorios from '@/pages/Relatorios';
import Equipe from '@/pages/Equipe';
import AIGrowth from '@/pages/AIGrowth.jsx';
import Configuracoes from '@/pages/Configuracoes.jsx';
import MasterPanel from '@/pages/MasterPanel.jsx';
import AdminConfig from '@/pages/AdminConfig.jsx';
import AdminMaster from '@/pages/AdminMaster.jsx';
import TenantLogin from '@/pages/tenant/Login.jsx';
import TrocarSenha from '@/pages/tenant/TrocarSenha.jsx';
import EsqueciSenha from '@/pages/tenant/EsqueciSenha.jsx';
import ResetSenha from '@/pages/tenant/ResetSenha.jsx';
import TenantAuthGuard from '@/components/TenantAuthGuard.jsx';

// Public
import LandingPage from '@/pages/LandingPage';
import DemoLayout from '@/components/demo/DemoLayout';
import DemoDashboard from '@/pages/demo/DemoDashboard';
import DemoAlunos from '@/pages/demo/DemoAlunos';
import DemoPlanos from '@/pages/demo/DemoPlanos';
import DemoCheckins from '@/pages/demo/DemoCheckins';
import DemoFinanceiro from '@/pages/demo/DemoFinanceiro';
import DemoRelatorios from '@/pages/demo/DemoRelatorios';
import DemoAIGrowth from '@/pages/demo/DemoAIGrowth';

const AuthenticatedApp = () => {
  console.log('[App] AuthenticatedApp render');
  const { isLoadingAuth, isLoadingPublicSettings, authError, isAuthenticated, navigateToLogin } = useAuth();

  // Loading spinner — never show blank screen while checking auth
  if (isLoadingPublicSettings || isLoadingAuth) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 bg-gym-orange rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-xl">G</span>
          </div>
          <div className="w-6 h-6 border-2 border-gym-orange/30 border-t-gym-orange rounded-full animate-spin"></div>
        </div>
      </div>
    );
  }

  if (authError) {
    if (authError.type === 'user_not_registered') return <UserNotRegisteredError />;
    if (authError.type === 'auth_required') {
      navigateToLogin();
      return (
        <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
          <div className="flex flex-col items-center gap-6 text-center p-6">
            <div className="w-14 h-14 bg-gym-orange rounded-xl flex items-center justify-center shadow-md">
              <span className="text-white font-bold text-2xl">G</span>
            </div>
            <div>
              <h2 className="text-xl font-bold text-gym-text mb-2">Acesso restrito</h2>
              <p className="text-gym-muted text-sm mb-4">Faça login para acessar o GymBoss AI.</p>
              <button onClick={navigateToLogin}
                className="bg-gym-orange hover:bg-gym-orange-light text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-sm">
                Entrar
              </button>
            </div>
          </div>
        </div>
      );
    }
  }

  // Not authenticated and no specific error — show login prompt
  if (!isAuthenticated) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-gym-surface">
        <div className="flex flex-col items-center gap-6 text-center p-6">
          <div className="w-14 h-14 bg-gym-orange rounded-xl flex items-center justify-center shadow-md">
            <span className="text-white font-bold text-2xl">G</span>
          </div>
          <div>
            <h2 className="text-xl font-bold text-gym-text mb-2">Acesso restrito</h2>
            <p className="text-gym-muted text-sm mb-4">Faça login para acessar o GymBoss AI.</p>
            <button onClick={navigateToLogin}
              className="bg-gym-orange hover:bg-gym-orange-light text-white font-semibold px-6 py-3 rounded-xl transition-all shadow-sm">
              Entrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="alunos" element={<Alunos />} />
        <Route path="planos" element={<Planos />} />
        <Route path="checkins" element={<Checkins />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="ai-growth" element={<AIGrowth />} />
        <Route path="configuracoes" element={<Configuracoes />} />
      </Route>
    </Routes>
  );
};

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* === PUBLIC ROUTES (no auth required) === */}
            <Route path="/" element={<LandingPage />} />
            <Route element={<DemoLayout />}>
              <Route path="/demo" element={<Navigate to="/demo/dashboard" replace />} />
              <Route path="/demo/dashboard" element={<DemoDashboard />} />
              <Route path="/demo/alunos" element={<DemoAlunos />} />
              <Route path="/demo/planos" element={<DemoPlanos />} />
              <Route path="/demo/checkins" element={<DemoCheckins />} />
              <Route path="/demo/financeiro" element={<DemoFinanceiro />} />
              <Route path="/demo/relatorios" element={<DemoRelatorios />} />
              <Route path="/demo/ai-growth" element={<DemoAIGrowth />} />
            </Route>

            {/* === PRIVATE ROUTES (auth required) === */}
            <Route path="/app/*" element={<AuthenticatedApp />} />
            {/* Super admin — User Base44 Auth */}
            <Route path="/master" element={<MasterPanel />} />
            <Route path="/admin-config" element={<AdminConfig />} />
            <Route path="/adminmaster" element={<AdminMaster />} />

            {/* Tenant auth — sessão local (AcademyUser) */}
            <Route path="/login" element={<TenantLogin />} />
            <Route path="/esqueci-senha" element={<EsqueciSenha />} />
            <Route path="/reset-senha" element={<ResetSenha />} />
            <Route path="/onboarding" element={<AuthenticatedApp />} />
            <Route path="/trocar-senha" element={<TrocarSenha />} />
            {/* Legacy redirects — old routes point to /app/* */}
            <Route path="/dashboard" element={<Navigate to="/app/dashboard" replace />} />
            <Route path="/alunos" element={<Navigate to="/app/alunos" replace />} />
            <Route path="/planos" element={<Navigate to="/app/planos" replace />} />
            <Route path="/checkins" element={<Navigate to="/app/checkins" replace />} />
            <Route path="/agenda" element={<Navigate to="/app/agenda" replace />} />
            <Route path="/financeiro" element={<Navigate to="/app/financeiro" replace />} />
            <Route path="/relatorios" element={<Navigate to="/app/relatorios" replace />} />
            <Route path="/equipe" element={<Navigate to="/app/equipe" replace />} />
            <Route path="/ai-growth" element={<Navigate to="/app/ai-growth" replace />} />
            <Route path="/configuracoes" element={<Navigate to="/app/configuracoes" replace />} />
            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;