import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/auth/Login'
import Signup from '@/pages/auth/Signup'
import Onboarding from '@/pages/Onboarding'

// Páginas do app (stubs — serão implementadas em etapa seguinte)
import Dashboard from '@/pages/app/Dashboard'
import Alunos from '@/pages/app/Alunos'
import Planos from '@/pages/app/Planos'
import Agenda from '@/pages/app/Agenda'
import Checkins from '@/pages/app/Checkins'
import Financeiro from '@/pages/app/Financeiro'
import Relatorios from '@/pages/app/Relatorios'
import Equipe from '@/pages/app/Equipe'
import Configuracoes from '@/pages/app/Configuracoes'
import Leads from '@/pages/app/Leads'
import Cadencia from '@/pages/app/Cadencia'
import Metas from '@/pages/app/Metas'
import AIAssistant from '@/pages/app/AIAssistant'

const queryClient = new QueryClient()

function PrivateRoutes() {
  const { user, loading, academiaId } = useAuth()
  if (loading) return (
    <div className="fixed inset-0 flex items-center justify-center bg-slate-950">
      <div className="flex flex-col items-center gap-4">
        <div className="h-12 w-12 rounded-2xl bg-violet-600 flex items-center justify-center shadow-lg shadow-violet-600/25">
          <span className="text-white font-bold text-xl">G</span>
        </div>
        <div className="w-6 h-6 border-2 border-violet-600/30 border-t-violet-600 rounded-full animate-spin" />
      </div>
    </div>
  )
  if (!user) return <Navigate to="/login" replace />
  if (!academiaId) return <Navigate to="/onboarding" replace />
  return (
    <Routes>
      <Route element={<AppLayout />}>
        <Route index element={<Dashboard />} />
        <Route path="alunos" element={<Alunos />} />
        <Route path="planos" element={<Planos />} />
        <Route path="agenda" element={<Agenda />} />
        <Route path="checkins" element={<Checkins />} />
        <Route path="financeiro" element={<Financeiro />} />
        <Route path="relatorios" element={<Relatorios />} />
        <Route path="equipe" element={<Equipe />} />
        <Route path="configuracoes" element={<Configuracoes />} />
        <Route path="leads" element={<Leads />} />
        <Route path="cadencia" element={<Cadencia />} />
        <Route path="metas" element={<Metas />} />
        <Route path="ai" element={<AIAssistant />} />
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
