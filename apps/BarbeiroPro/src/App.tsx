import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/auth/Login'
import Signup from '@/pages/auth/Signup'
import Onboarding from '@/pages/Onboarding'

// App pages
import Dashboard from '@/pages/app/Dashboard'
import Agenda from '@/pages/app/Agenda'
import Clientes from '@/pages/app/Clientes'
import Profissionais from '@/pages/app/Profissionais'
import Servicos from '@/pages/app/Servicos'
import Financeiro from '@/pages/app/Financeiro'
import Relatorios from '@/pages/app/Relatorios'
import AIAssistant from '@/pages/app/AIAssistant'
import Equipe from '@/pages/app/Equipe'
import Configuracoes from '@/pages/app/Configuracoes'
import Leads from '@/pages/app/Leads'
import Cadencia from '@/pages/app/Cadencia'
import Metas from '@/pages/app/Metas'
import AgendarPublico from '@/pages/public/AgendarPublico'

const queryClient = new QueryClient()

function PrivateRoutes() {
  const { user, loading, barbeariaId } = useAuth()

  if (loading) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
        <div className="w-8 h-8 border-4 border-muted border-t-primary rounded-full animate-spin" />
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace />
  if (!barbeariaId) return <Navigate to="/onboarding" replace />

  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="clientes" element={<Clientes />} />
        <Route path="profissionais" element={<Profissionais />} />
        <Route path="servicos" element={<Servicos />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="ai" element={<AIAssistant />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="leads" element={<Leads />} />
        <Route path="cadencia" element={<Cadencia />} />
        <Route path="metas" element={<Metas />} />
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
            <Route path="/agendar/:slug" element={<AgendarPublico />} />
            <Route path="/*" element={<PrivateRoutes />} />
          </Routes>
        </BrowserRouter>
        <Toaster richColors position="top-right" />
      </AuthProvider>
    </QueryClientProvider>
  )
}
