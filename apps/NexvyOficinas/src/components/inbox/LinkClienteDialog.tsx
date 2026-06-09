import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Search, Loader2, X, Link2 } from 'lucide-react'

interface ClienteItem {
  id: string
  nome: string
  telefone: string
}

interface VeiculoItem {
  id: string
  marca: string
  modelo: string
  placa: string
}

interface OsItem {
  id: string
  status: string
  created_at: string
}

interface Props {
  conversationId: string
  currentClienteId: string | null
  onClose: () => void
  onLinked: (clienteId: string | null, veiculoId: string | null, osId: string | null) => void
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

export default function LinkClienteDialog({ conversationId, currentClienteId, onClose, onLinked }: Props) {
  const { empresaId } = useAuth()
  const [query, setQuery] = useState('')
  const [clientes, setClientes] = useState<ClienteItem[]>([])
  const [searching, setSearching] = useState(false)
  const [selectedCliente, setSelectedCliente] = useState<ClienteItem | null>(null)
  const [veiculos, setVeiculos] = useState<VeiculoItem[]>([])
  const [selectedVeiculo, setSelectedVeiculo] = useState<string>('')
  const [ordens, setOrdens] = useState<OsItem[]>([])
  const [selectedOs, setSelectedOs] = useState<string>('')
  const [linking, setLinking] = useState(false)

  // Busca clientes enquanto digita (debounce 300ms)
  useEffect(() => {
    if (!empresaId || query.trim().length < 2) {
      setClientes([])
      return
    }
    const timer = setTimeout(async () => {
      setSearching(true)
      const { data } = await supabase
        .from('clientes')
        .select('id,nome,telefone')
        .eq('empresa_id', empresaId)
        .or(`nome.ilike.%${query}%,telefone.ilike.%${query}%`)
        .limit(10)
      setClientes(data ?? [])
      setSearching(false)
    }, 300)
    return () => clearTimeout(timer)
  }, [query, empresaId])

  // Ao selecionar cliente: carrega seus veículos
  async function handleSelectCliente(cliente: ClienteItem) {
    setSelectedCliente(cliente)
    setClientes([])
    setQuery(cliente.nome)
    setSelectedVeiculo('')
    setOrdens([])
    setSelectedOs('')

    const { data } = await supabase
      .from('veiculos')
      .select('id,marca,modelo,placa')
      .eq('cliente_id', cliente.id)
    setVeiculos(data ?? [])
  }

  // Ao selecionar veículo: carrega OS abertas/em andamento
  async function handleVeiculoChange(veiculoId: string) {
    setSelectedVeiculo(veiculoId)
    setSelectedOs('')
    if (!veiculoId || !selectedCliente) {
      setOrdens([])
      return
    }
    const { data } = await supabase
      .from('ordens_servico')
      .select('id,status,created_at')
      .eq('cliente_id', selectedCliente.id)
      .eq('veiculo_id', veiculoId)
      .in('status', ['aberta', 'em_andamento'])
      .order('created_at', { ascending: false })
    setOrdens(data ?? [])
  }

  async function handleVincular() {
    if (!selectedCliente || linking) return
    setLinking(true)
    try {
      const updates = {
        cliente_id: selectedCliente.id,
        veiculo_id: selectedVeiculo || null,
        os_id: selectedOs || null,
      }
      await supabase
        .from('inbox_conversations')
        .update(updates)
        .eq('id', conversationId)
      onLinked(updates.cliente_id, updates.veiculo_id, updates.os_id)
    } finally {
      setLinking(false)
    }
  }

  return (
    <>
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/60 z-40" onClick={onClose} aria-hidden="true" />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Vincular cliente à conversa"
        className="fixed inset-0 z-50 flex items-center justify-center p-4"
      >
        <div className="bg-slate-800 border border-slate-600 rounded-xl shadow-2xl w-full max-w-md">
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700">
            <div className="flex items-center gap-2">
              <Link2 className="h-4 w-4 text-orange-400" />
              <h2 className="font-semibold text-white text-sm">Vincular Conversa a Cliente</h2>
            </div>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white p-1 rounded transition-colors"
              aria-label="Fechar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="px-5 py-4 space-y-4">
            {/* Campo busca de cliente */}
            <div>
              <label className="block text-xs font-medium text-slate-400 mb-1.5">
                Buscar cliente (nome ou telefone)
              </label>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500" />
                <input
                  value={query}
                  onChange={e => {
                    setQuery(e.target.value)
                    if (selectedCliente && e.target.value !== selectedCliente.nome) {
                      setSelectedCliente(null)
                      setVeiculos([])
                      setOrdens([])
                      setSelectedVeiculo('')
                      setSelectedOs('')
                    }
                  }}
                  placeholder="Digite nome ou telefone..."
                  className="w-full pl-9 pr-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
                />
                {searching && (
                  <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 animate-spin text-slate-400" />
                )}
              </div>

              {/* Dropdown de resultados */}
              {clientes.length > 0 && !selectedCliente && (
                <div className="mt-1 bg-slate-700 border border-slate-600 rounded-lg shadow-xl max-h-48 overflow-y-auto">
                  {clientes.map(c => (
                    <button
                      key={c.id}
                      onClick={() => handleSelectCliente(c)}
                      className="w-full flex items-start gap-2 px-3 py-2 hover:bg-slate-600 text-left transition-colors"
                    >
                      <div>
                        <p className="text-sm text-white">{c.nome}</p>
                        <p className="text-xs text-slate-400">{c.telefone}</p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Seleção de veículo */}
            {selectedCliente && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Veículo (opcional)
                </label>
                <select
                  value={selectedVeiculo}
                  onChange={e => handleVeiculoChange(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">Selecione um veículo...</option>
                  {veiculos.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.marca} {v.modelo} — {v.placa}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Seleção de OS */}
            {selectedVeiculo && ordens.length > 0 && (
              <div>
                <label className="block text-xs font-medium text-slate-400 mb-1.5">
                  Ordem de Serviço (opcional)
                </label>
                <select
                  value={selectedOs}
                  onChange={e => setSelectedOs(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-700 border border-slate-600 rounded-lg text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                >
                  <option value="">Selecione uma OS...</option>
                  {ordens.map(o => (
                    <option key={o.id} value={o.id}>
                      {formatDate(o.created_at)} — {o.status}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Confirmação */}
            {selectedCliente && (
              <div className="bg-orange-950/30 border border-orange-700/40 rounded-lg px-3 py-2">
                <p className="text-xs text-orange-300">
                  Vinculando: <span className="font-medium text-white">{selectedCliente.nome}</span>
                  {currentClienteId && currentClienteId !== selectedCliente.id && (
                    <span className="text-orange-400"> (substituirá vínculo anterior)</span>
                  )}
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex gap-2 px-5 pb-4">
            <button
              onClick={onClose}
              className="flex-1 px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-200 transition-colors"
            >
              Cancelar
            </button>
            <button
              onClick={handleVincular}
              disabled={!selectedCliente || linking}
              className="flex-1 px-4 py-2 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-sm text-white font-medium transition-colors flex items-center justify-center gap-2"
            >
              {linking ? (
                <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Vinculando...</>
              ) : (
                <><Link2 className="h-3.5 w-3.5" /> Vincular</>
              )}
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
