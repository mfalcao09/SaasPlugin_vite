import { useQuery } from '@tanstack/react-query'
import { Zap, Loader2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { formatDate } from '@/lib/utils'

export default function Cadencia() {
  const { empresaId } = useAuth()

  const { data: leads = [], isLoading: loadingLeads } = useQuery({
    queryKey: ['leads', empresaId],
    queryFn: async () => { const r = await db.leads.list(empresaId!); return r.data ?? [] },
    enabled: !!empresaId,
  })

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-white">Cadencia de Contato</h1>
        <p className="text-slate-400 text-sm mt-1">Acompanhe o follow-up dos seus leads</p>
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-700 flex items-center gap-2">
          <Zap className="h-4 w-4 text-orange-400" />
          <h2 className="font-semibold text-white">Leads para Follow-up</h2>
        </div>
        {loadingLeads ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : (leads as any[]).filter((l: any) => l.status !== 'convertido' && l.status !== 'perdido').length === 0 ? (
          <div className="py-12 text-center"><Zap className="h-10 w-10 text-slate-600 mx-auto mb-3" /><p className="text-slate-500 text-sm">Nenhum lead pendente de follow-up.</p></div>
        ) : (
          <div className="divide-y divide-slate-700/50">
            {(leads as any[]).filter((l: any) => l.status !== 'convertido' && l.status !== 'perdido').map((l: any) => (
              <div key={l.id} className="px-5 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-white">{l.nome}</p>
                  <p className="text-xs text-slate-400">{l.telefone ?? '-'} · {l.interesse ?? '-'}</p>
                </div>
                <div className="text-right">
                  <span className="text-xs px-2 py-0.5 rounded-full bg-orange-500/15 text-orange-400 font-medium">{l.status}</span>
                  <p className="text-xs text-slate-500 mt-1">{l.created_at ? formatDate(l.created_at) : '-'}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
