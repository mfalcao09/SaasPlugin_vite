import { useQuery } from '@tanstack/react-query'
import { Users2, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export default function Equipe() {
  const { empresaId } = useAuth()

  const { data: membros = [], isLoading } = useQuery({
    queryKey: ['empresa_users', empresaId],
    queryFn: async () => {
      const { data } = await supabase.from('empresa_users').select('*').eq('empresa_id', empresaId!)
      return data ?? []
    },
    enabled: !!empresaId,
  })

  const ROLE_LABEL: Record<string, string> = { owner: 'Dono', admin: 'Admin', tecnico: 'Tecnico', recepcao: 'Recepcao', financeiro: 'Financeiro' }

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Equipe</h1>
        <p className="text-slate-400 text-sm mt-1">{(membros as any[]).length} membros</p>
      </div>
      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : (membros as any[]).length === 0 ? (
          <div className="py-12 text-center"><Users2 className="h-10 w-10 text-slate-600 mx-auto mb-3" /><p className="text-slate-500 text-sm">Nenhum membro cadastrado.</p></div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700"><tr className="text-left text-slate-400"><th className="px-5 py-3 font-medium">Email</th><th className="px-5 py-3 font-medium">Funcao</th></tr></thead>
            <tbody className="divide-y divide-slate-700/50">
              {(membros as any[]).map((m: any) => (
                <tr key={m.id} className="hover:bg-slate-800/50">
                  <td className="px-5 py-3 text-white">{m.email ?? m.user_id?.slice(0,8)}</td>
                  <td className="px-5 py-3"><span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">{ROLE_LABEL[m.role] ?? m.role}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
