import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { Toaster } from 'sonner'
import { AuthProvider, useAuth } from '@/contexts/AuthContext'
import AppLayout from '@/components/layout/AppLayout'
import Login from '@/pages/auth/Login'
import Signup from '@/pages/auth/Signup'
import Onboarding from '@/pages/Onboarding'

// Placeholders para páginas ainda não portadas
const Placeholder = ({ title }: { title: string }) => (
  <div className="p-8 text-center text-muted-foreground">{title} — em construção</div>
)

const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 1000 * 60 * 5, retry: 1 } },
})

function PrivateRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth()
  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-muted-foreground">
        Carregando...
      </div>
    )
  }
  if (!user) return <Navigate to="/login" replace />
  return <>{children}</>
}

function AppRoutes() {
  return (
    <Routes>
      {/* ── Auth ── */}
      <Route path="/login" element={<Login />} />
      <Route path="/signup" element={<Signup />} />

      {/* ── Onboarding ── */}
      <Route
        path="/onboarding"
        element={<PrivateRoute><Onboarding /></PrivateRoute>}
      />

      {/* ── App protegido (nested sob AppLayout) ── */}
      <Route
        path="/"
        element={<PrivateRoute><AppLayout /></PrivateRoute>}
      >
        <Route index element={<Placeholder title="Dashboard" />} />
        <Route path="pedidos" element={<Placeholder title="Pedidos" />} />
        <Route path="cardapio" element={<Placeholder title="Cardápio" />} />
        <Route path="clientes" element={<Placeholder title="Clientes" />} />
        <Route path="entregas" element={<Placeholder title="Entregas" />} />
        <Route path="financeiro" element={<Placeholder title="Financeiro" />} />
        <Route path="relatorios" element={<Placeholder title="Relatórios" />} />
        <Route path="equipe" element={<Placeholder title="Equipe" />} />
        <Route path="configuracoes" element={<Placeholder title="Configurações" />} />
        <Route path="leads" element={<Placeholder title="Leads" />} />
        <Route path="cadencia" element={<Placeholder title="Cadência" />} />
        <Route path="metas" element={<Placeholder title="Metas" />} />
      </Route>

      {/* ── Pedido público ── */}
      <Route path="pedir/:slug" element={<Placeholder title="Pedido Público" />} />

      {/* ── Fallback ── */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </BrowserRouter>
    </QueryClientProvider>
  )
}
