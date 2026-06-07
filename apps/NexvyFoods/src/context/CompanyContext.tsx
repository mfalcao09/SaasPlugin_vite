/**
 * CompanyContext (Supabase) — substitui o CompanyContext.jsx legado (base44).
 * Resolve por precedência .tsx > .jsx, então as páginas que importam
 * `@/context/CompanyContext` passam a usar este sem nenhuma edição.
 *
 * Deriva o tenant (company) a partir do companyId já resolvido pelo
 * AuthContext (Supabase). Mantém a mesma shape pública do legado
 * ({ company, user, appConfig, isSuperAdmin, loading, authChecked })
 * para compatibilidade drop-in com as páginas existentes.
 */
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react'
import { useAuth } from '@/contexts/AuthContext'
import { supabase } from '@/lib/supabase'

export interface Company {
  id: string
  name: string
  slug?: string
  logo_url?: string
  address?: string
  average_prep_time?: number
  // demais colunas da tabela `companies` (primary_color, phone, plano, etc.)
  [key: string]: unknown
}

interface CompanyContextValue {
  company: Company | null
  user: ReturnType<typeof useAuth>['user']
  appConfig: null
  isSuperAdmin: boolean
  loading: boolean
  authChecked: boolean
  refreshCompany: () => Promise<void>
}

const CompanyContext = createContext<CompanyContextValue>({
  company: null,
  user: null,
  appConfig: null,
  isSuperAdmin: false,
  loading: true,
  authChecked: false,
  refreshCompany: async () => {},
})

export function CompanyProvider({ children }: { children: ReactNode }) {
  const { user, companyId, loading: authLoading } = useAuth()
  const [company, setCompany] = useState<Company | null>(null)
  const [loadingCompany, setLoadingCompany] = useState(true)

  async function fetchCompany(id: string) {
    const { data, error } = await supabase
      .from('companies')
      .select('*')
      .eq('id', id)
      .single()
    if (error) {
      console.error('CompanyContext: falha ao buscar company', error.message)
      setCompany(null)
    } else {
      setCompany(data as Company)
    }
  }

  useEffect(() => {
    if (authLoading) return
    if (companyId) {
      setLoadingCompany(true)
      fetchCompany(companyId).finally(() => setLoadingCompany(false))
    } else {
      setCompany(null)
      setLoadingCompany(false)
    }
  }, [companyId, authLoading])

  const refreshCompany = async () => {
    if (companyId) await fetchCompany(companyId)
  }

  const loading = authLoading || loadingCompany

  return (
    <CompanyContext.Provider
      value={{
        company,
        user,
        appConfig: null,
        isSuperAdmin: false,
        loading,
        authChecked: !loading,
        refreshCompany,
      }}
    >
      {children}
    </CompanyContext.Provider>
  )
}

export function useCompanyContext() {
  return useContext(CompanyContext)
}
