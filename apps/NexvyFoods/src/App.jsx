import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { TenantAuthProvider } from '@/context/TenantAuthContext';
import { CompanyProvider } from '@/context/CompanyContext';

// Public pages
import Home from './pages/Home';
import PublicOrder from './pages/PublicOrder';

// Auth pages (internal tenant)
import TenantLogin from './pages/TenantLogin';
import TrocarSenha from './pages/TrocarSenha';
import EsqueciSenha from './pages/EsqueciSenha';
import ResetSenha from './pages/ResetSenha';

// Admin Master (Base44 OAuth)
import AdminMaster from './pages/AdminMaster';

// Demo pages
import DemoDashboard from './pages/DemoDashboard';
import DemoPedidos from './pages/DemoPedidos';
import DemoCardapio from './pages/DemoCardapio';
import DemoClientes from './pages/DemoClientes';
import DemoEntregas from './pages/DemoEntregas';
import DemoFinanceiro from './pages/DemoFinanceiro';
import DemoRelatorios from './pages/DemoRelatorios';
import DemoAIGrowth from './pages/DemoAIGrowth';

// Onboarding
import Onboarding from './pages/Onboarding';

// App pages (private — protected via AppLayout)
import AppLayout from './pages/AppLayout.jsx';
import AppDashboard from './pages/AppDashboard';
import AppPedidos from './pages/AppPedidos';
import AppCardapio from './pages/AppCardapio';
import AppClientes from './pages/AppClientes';
import AppEntregas from './pages/AppEntregas';
import AppFinanceiro from './pages/AppFinanceiro';
import AppRelatorios from './pages/AppRelatorios';
import AppAIGrowth from './pages/AppAIGrowth';
import AppEquipe from './pages/AppEquipe';
import AppConfiguracoes from './pages/AppConfiguracoes';

function App() {
  return (
    <QueryClientProvider client={queryClientInstance}>
      <Router>
        <TenantAuthProvider>
          <CompanyProvider>
            <Routes>
              {/* ===== PUBLIC ===== */}
              <Route path="/" element={<Home />} />
              <Route path="/pedido/:slug" element={<PublicOrder />} />

              {/* ===== AUTH INTERNO ===== */}
              <Route path="/login" element={<TenantLogin />} />
              <Route path="/trocar-senha" element={<TrocarSenha />} />
              <Route path="/esqueci-senha" element={<EsqueciSenha />} />
              <Route path="/reset-senha" element={<ResetSenha />} />

              {/* ===== ADMIN MASTER (Base44 OAuth) ===== */}
              <Route path="/adminmaster" element={<AdminMaster />} />

              {/* ===== DEMO ===== */}
              <Route path="/demo/dashboard" element={<DemoDashboard />} />
              <Route path="/demo/pedidos" element={<DemoPedidos />} />
              <Route path="/demo/cardapio" element={<DemoCardapio />} />
              <Route path="/demo/clientes" element={<DemoClientes />} />
              <Route path="/demo/entregas" element={<DemoEntregas />} />
              <Route path="/demo/financeiro" element={<DemoFinanceiro />} />
              <Route path="/demo/relatorios" element={<DemoRelatorios />} />
              <Route path="/demo/ai-growth" element={<DemoAIGrowth />} />

              {/* ===== ONBOARDING ===== */}
              <Route path="/onboarding" element={<Onboarding />} />

              {/* ===== APP (private — AppLayout já verifica sessão via useTenantAuth) ===== */}
              <Route element={<AppLayout />}>
                <Route path="/app/dashboard" element={<AppDashboard />} />
                <Route path="/app/pedidos" element={<AppPedidos />} />
                <Route path="/app/cardapio" element={<AppCardapio />} />
                <Route path="/app/clientes" element={<AppClientes />} />
                <Route path="/app/entregas" element={<AppEntregas />} />
                <Route path="/app/financeiro" element={<AppFinanceiro />} />
                <Route path="/app/relatorios" element={<AppRelatorios />} />
                <Route path="/app/ai-growth" element={<AppAIGrowth />} />
                <Route path="/app/equipe" element={<AppEquipe />} />
                <Route path="/app/configuracoes" element={<AppConfiguracoes />} />
              </Route>

              {/* 404 */}
              <Route path="*" element={<PageNotFound />} />
            </Routes>
          </CompanyProvider>
        </TenantAuthProvider>
        <Toaster />
      </Router>
    </QueryClientProvider>
  );
}

export default App;