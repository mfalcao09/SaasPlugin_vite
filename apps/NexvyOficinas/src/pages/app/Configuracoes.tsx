import { useQuery } from '@tanstack/react-query'
import { Settings, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function Configuracoes() {
  const { empresaId, user } = useAuth()

  const { data: empresa, isLoading } = useQuery({
    queryKey: ['empresa', empresaId],
    queryFn: async () => {
      const { data } = await supabase.from('empresas').select('*').eq('id', empresaId!).single()
      return data
    },
    enabled: !!empresaId,
  })

  return (
    <div className="p-6 space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold text-white">Configuracoes</h1>
        <p className="text-slate-400 text-sm mt-1">Dados da sua oficina</p>
      </div>

      {isLoading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
      ) : empresa ? (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-6 space-y-4">
          <div className="flex items-center gap-3 pb-4 border-b border-slate-700">
            <div className="h-12 w-12 rounded-xl bg-orange-600 flex items-center justify-center shrink-0">
              <Settings className="h-6 w-6 text-white" />
            </div>
            <div>
              <p className="font-bold text-white text-lg">{empresa.nome}</p>
              <p className="text-xs text-slate-400 font-mono">{empresa.slug}</p>
            </div>
          </div>
          {[
            { label: 'CNPJ', value: empresa.cnpj },
            { label: 'Telefone', value: empresa.telefone },
            { label: 'Email', value: empresa.email },
            { label: 'Plano', value: empresa.plano },
            { label: 'Status', value: empresa.status },
          ].map(({ label, value }) => value ? (
            <div key={label} className="flex items-center justify-between py-2 border-b border-slate-700/50">
              <span className="text-sm text-slate-400">{label}</span>
              <span className="text-sm text-white">{value}</span>
            </div>
          ) : null)}
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-slate-400">Usuario logado</span>
            <span className="text-sm text-white">{user?.email}</span>
          </div>
        </div>
      ) : (
        <p className="text-slate-500">Dados nao encontrados.</p>
      )}
    </div>
  )
}
