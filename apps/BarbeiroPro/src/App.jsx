import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';

// Guards
import PrivateRoute from '@/components/guards/PrivateRoute';
import SuperAdminRoute from '@/components/guards/SuperAdminRoute';
import OnboardingGuard from '@/components/guards/OnboardingGuard';
import AdminRoute from '@/components/guards/AdminRoute';

// Public pages
import LandingPage from './pages/LandingPage';
import PublicBooking from './pages/PublicBooking';
import Onboarding from './pages/Onboarding';
import MasterPanel from './pages/MasterPanel';

// Master pages
import ListaBarbearias from './pages/master/ListaBarbearias';
import NovaBarbearia from './pages/master/NovaBarbearia';

// Admin (barbearia internal auth) pages
import AdminLogin from './pages/admin/AdminLogin';
import AdminTrocarSenha from './pages/admin/AdminTrocarSenha';
import AdminSuspenso from './pages/admin/AdminSuspenso';

// Demo pages (public)
import DemoDashboard from './pages/demo/DemoDashboard';
import DemoAgenda from './pages/demo/DemoAgenda';
import DemoClientes from './pages/demo/DemoClientes';
import DemoServicos from './pages/demo/DemoServicos';
import DemoProfissionais from './pages/demo/DemoProfissionais';
import DemoFinanceiro from './pages/demo/DemoFinanceiro';
import DemoRelatorios from './pages/demo/DemoRelatorios';
import DemoAIGrowth from './pages/demo/DemoAIGrowth';

// Private app pages
import AppDashboard from './pages/app/AppDashboard';
import AppAgenda from './pages/app/AppAgenda';
import AppClientes from './pages/app/AppClientes';
import AppServicos from './pages/app/AppServicos';
import AppProfissionais from './pages/app/AppProfissionais';
import AppFinanceiro from './pages/app/AppFinanceiro';
import AppRelatorios from './pages/app/AppRelatorios';
import AppAIGrowth from './pages/app/AppAIGrowth';
import AppEquipe from './pages/app/AppEquipe';
import AppConfiguracoes from './pages/app/AppConfiguracoes';

function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <Routes>
            {/* ── PUBLIC ROUTES ── */}
            <Route path="/" element={<LandingPage />} />
            <Route path="/agendar/:slug" element={<PublicBooking />} />

            {/* ── DEMO ROUTES (public, no login required) ── */}
            <Route path="/demo/dashboard" element={<DemoDashboard />} />
            <Route path="/demo/agenda" element={<DemoAgenda />} />
            <Route path="/demo/clientes" element={<DemoClientes />} />
            <Route path="/demo/servicos" element={<DemoServicos />} />
            <Route path="/demo/profissionais" element={<DemoProfissionais />} />
            <Route path="/demo/financeiro" element={<DemoFinanceiro />} />
            <Route path="/demo/relatorios" element={<DemoRelatorios />} />
            <Route path="/demo/ai-growth" element={<DemoAIGrowth />} />

            {/* ── ONBOARDING (authenticated, not yet completed) ── */}
            <Route path="/onboarding" element={
              <OnboardingGuard>
                <Onboarding />
              </OnboardingGuard>
            } />

            {/* ── MASTER PANEL (super admin only) ── */}
            <Route path="/master" element={<SuperAdminRoute><MasterPanel /></SuperAdminRoute>} />
            <Route path="/master/barbearias" element={<SuperAdminRoute><ListaBarbearias /></SuperAdminRoute>} />
            <Route path="/master/barbearias/nova" element={<SuperAdminRoute><NovaBarbearia /></SuperAdminRoute>} />

            {/* ── ADMIN (barbearia internal auth) ── */}
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin/trocar-senha" element={<AdminTrocarSenha />} />
            <Route path="/admin/reset-senha" element={<AdminTrocarSenha />} />
            <Route path="/admin/suspenso" element={<AdminSuspenso />} />
            <Route path="/admin/dashboard" element={<AdminRoute><AppDashboard /></AdminRoute>} />

            {/* ── PRIVATE APP ROUTES (authenticated users only) ── */}
            <Route path="/app/dashboard" element={<PrivateRoute><AppDashboard /></PrivateRoute>} />
            <Route path="/app/agenda" element={<PrivateRoute><AppAgenda /></PrivateRoute>} />
            <Route path="/app/clientes" element={<PrivateRoute><AppClientes /></PrivateRoute>} />
            <Route path="/app/servicos" element={<PrivateRoute><AppServicos /></PrivateRoute>} />
            <Route path="/app/profissionais" element={<PrivateRoute><AppProfissionais /></PrivateRoute>} />
            <Route path="/app/financeiro" element={<PrivateRoute><AppFinanceiro /></PrivateRoute>} />
            <Route path="/app/relatorios" element={<PrivateRoute><AppRelatorios /></PrivateRoute>} />
            <Route path="/app/ai-growth" element={<PrivateRoute><AppAIGrowth /></PrivateRoute>} />
            <Route path="/app/equipe" element={<PrivateRoute><AppEquipe /></PrivateRoute>} />
            <Route path="/app/configuracoes" element={<PrivateRoute><AppConfiguracoes /></PrivateRoute>} />

            <Route path="*" element={<PageNotFound />} />
          </Routes>
        </Router>
        <Toaster />
      </QueryClientProvider>
    </AuthProvider>
  );
}

export default App;