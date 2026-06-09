import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/auth/Login'
import Signup from '@/pages/auth/Signup'
import Onboarding from '@/pages/Onboarding'
import Dashboard from '@/pages/app/Dashboard'
import Clientes from '@/pages/app/Clientes'
import Veiculos from '@/pages/app/Veiculos'
import Ordens from '@/pages/app/Ordens'
import Orcamentos from '@/pages/app/Orcamentos'
import Financeiro from '@/pages/app/Financeiro'
import Relatorios from '@/pages/app/Relatorios'
import AIGrowth from '@/pages/app/AIGrowth'
import Equipe from '@/pages/app/Equipe'
import Configuracoes from '@/pages/app/Configuracoes'
import Leads from '@/pages/app/Leads'
import Cadencia from '@/pages/app/Cadencia'
import Metas from '@/pages/app/Metas'
import Inbox from '@/pages/app/Inbox'
import InboxMetrics from '@/pages/app/InboxMetrics'
import MyStats from '@/pages/app/MyStats'

const queryClient = new QueryClient()

function PrivateRoutes() {
  const { user, loading, empresaId } = useAuth()

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-4 border-slate-700 border-t-orange-500 rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!empresaId) return <Navigate to="/onboarding" replace />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="veiculos" element={<Veiculos />} />
        <Route path="ordens" element={<Ordens />} />
        <Route path="orcamentos" element={<Orcamentos />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="ai" element={<AIGrowth />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="leads" element={<Leads />} />
        <Route path="cadencia" element={<Cadencia />} />
        <Route path="metas" element={<Metas />} />
        <Route path="inbox/metrics" element={<InboxMetrics />} />
        <Route path="inbox/my-stats" element={<MyStats />} />
        <Route path="inbox" element={<Inbox />} />
        <Route path="inbox/:conversationId" element={<Inbox />} />
      </Route>
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/onboarding" element={<Onboarding />} />
            <Route path="/*" element={<PrivateRoutes />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
