import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Users, Plus, Search, Loader2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export default function Clientes() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [nome, setNome] = useState('')
  const [telefone, setTelefone] = useState('')
  const [email, setEmail] = useState('')

  const { data: clientes = [], isLoading } = useQuery({
    queryKey: ['clientes', empresaId],
    queryFn: async () => { const r = await db.clientes.list(empresaId!); return r.data ?? [] },
    enabled: !!empresaId,
  })

  const criar = useMutation({
    mutationFn: async () => await db.clientes.create({ empresa_id: empresaId!, nome, telefone, email, status: 'ativo' } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['clientes', empresaId] })
      toast.success('Cliente cadastrado!')
      setShowForm(false); setNome(''); setTelefone(''); setEmail('')
    },
    onError: () => toast.error('Erro ao cadastrar cliente.'),
  })

  const filtered = (clientes as any[]).filter(c =>
    c.nome?.toLowerCase().includes(search.toLowerCase()) ||
    c.telefone?.includes(search) ||
    c.email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Clientes</h1>
          <p className="text-slate-400 text-sm mt-1">{(clientes as any[]).length} clientes cadastrados</p>
        </div>
        <button
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors"
        >
          <Plus className="h-4 w-4" />
          Novo Cliente
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-white">Novo Cliente</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <input value={nome} onChange={e => setNome(e.target.value)} placeholder="Nome *" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <input value={telefone} onChange={e => setTelefone(e.target.value)} placeholder="Telefone" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <input value={email} onChange={e => setEmail(e.target.value)} placeholder="Email" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!nome.trim() || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por nome, telefone ou email..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Users className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">{search ? 'Nenhum cliente encontrado.' : 'Nenhum cliente cadastrado ainda.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr className="text-left text-slate-400">
                <th className="px-5 py-3 font-medium">Nome</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Telefone</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Email</th>
                <th className="px-5 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filtered.map((c: any) => (
                <tr key={c.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3 text-white font-medium">{c.nome}</td>
                  <td className="px-5 py-3 text-slate-400 hidden sm:table-cell">{c.telefone ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-400 hidden md:table-cell">{c.email ?? '—'}</td>
                  <td className="px-5 py-3">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.status === 'ativo' ? 'bg-green-500/15 text-green-400' : 'bg-slate-500/15 text-slate-400'}`}>{c.status ?? 'ativo'}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
