import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Car, Plus, Search, Loader2 } from 'lucide-react'
import { db } from '@/lib/db'
import { useAuth } from '@/contexts/AuthContext'
import { toast } from 'sonner'

export default function Veiculos() {
  const { empresaId } = useAuth()
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [clienteId, setClienteId] = useState('')
  const [marca, setMarca] = useState('')
  const [modelo, setModelo] = useState('')
  const [placa, setPlaca] = useState('')
  const [ano, setAno] = useState('')
  const [cor, setCor] = useState('')

  const { data: veiculos = [], isLoading } = useQuery({
    queryKey: ['veiculos', empresaId],
    queryFn: () => db.veiculos.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const { data: clientes = [] } = useQuery({
    queryKey: ['clientes', empresaId],
    queryFn: () => db.clientes.list(empresaId!).then(r => r.data ?? []),
    enabled: !!empresaId,
  })

  const criar = useMutation({
    mutationFn: () => db.veiculos.create({
      empresa_id: empresaId!, cliente_id: clienteId, marca, modelo, placa,
      ano: ano ? Number(ano) : undefined, cor,
    } as any),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['veiculos', empresaId] })
      toast.success('Veículo cadastrado!')
      setShowForm(false); setClienteId(''); setMarca(''); setModelo(''); setPlaca(''); setAno(''); setCor('')
    },
    onError: () => toast.error('Erro ao cadastrar veículo.'),
  })

  const filtered = (veiculos as any[]).filter(v =>
    v.placa?.toLowerCase().includes(search.toLowerCase()) ||
    v.marca?.toLowerCase().includes(search.toLowerCase()) ||
    v.modelo?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Veículos</h1>
          <p className="text-slate-400 text-sm mt-1">{(veiculos as any[]).length} veículos cadastrados</p>
        </div>
        <button onClick={() => setShowForm(!showForm)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-sm font-semibold transition-colors">
          <Plus className="h-4 w-4" />Novo Veículo
        </button>
      </div>

      {showForm && (
        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 space-y-3">
          <h2 className="font-semibold text-white">Novo Veículo</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white text-sm focus:outline-none focus:border-orange-500">
              <option value="">Selecionar cliente *</option>
              {(clientes as any[]).map((c: any) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <input value={marca} onChange={e => setMarca(e.target.value)} placeholder="Marca *" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <input value={modelo} onChange={e => setModelo(e.target.value)} placeholder="Modelo *" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <input value={placa} onChange={e => setPlaca(e.target.value.toUpperCase())} placeholder="Placa *" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <input value={ano} onChange={e => setAno(e.target.value)} placeholder="Ano" type="number" min="1950" max="2030" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
            <input value={cor} onChange={e => setCor(e.target.value)} placeholder="Cor" className="px-3 py-2 rounded-lg bg-slate-800 border border-slate-600 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
          </div>
          <div className="flex gap-2">
            <button onClick={() => criar.mutate()} disabled={!clienteId || !marca || !modelo || !placa || criar.isPending} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors">
              {criar.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}Salvar
            </button>
            <button onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-white text-sm transition-colors">Cancelar</button>
          </div>
        </div>
      )}

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar por placa, marca ou modelo..." className="w-full pl-9 pr-4 py-2.5 rounded-lg bg-slate-900 border border-slate-700 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-orange-500" />
      </div>

      <div className="bg-slate-900 border border-slate-700 rounded-xl overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-orange-500" /></div>
        ) : filtered.length === 0 ? (
          <div className="py-12 text-center">
            <Car className="h-10 w-10 text-slate-600 mx-auto mb-3" />
            <p className="text-slate-500 text-sm">{search ? 'Nenhum veículo encontrado.' : 'Nenhum veículo cadastrado ainda.'}</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-slate-700">
              <tr className="text-left text-slate-400">
                <th className="px-5 py-3 font-medium">Placa</th>
                <th className="px-5 py-3 font-medium">Veículo</th>
                <th className="px-5 py-3 font-medium hidden sm:table-cell">Cliente</th>
                <th className="px-5 py-3 font-medium hidden md:table-cell">Ano / Cor</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {filtered.map((v: any) => (
                <tr key={v.id} className="hover:bg-slate-800/50 transition-colors">
                  <td className="px-5 py-3 text-orange-400 font-mono font-semibold">{v.placa}</td>
                  <td className="px-5 py-3 text-white">{v.marca} {v.modelo}</td>
                  <td className="px-5 py-3 text-slate-400 hidden sm:table-cell">{(v as any).clientes?.nome ?? '—'}</td>
                  <td className="px-5 py-3 text-slate-400 hidden md:table-cell">{v.ano ?? '—'}{v.cor ? ` · ${v.cor}` : ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
