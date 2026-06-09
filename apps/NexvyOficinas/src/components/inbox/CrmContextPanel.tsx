import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { User, Car, Wrench, ExternalLink, Loader2, X } from 'lucide-react'

interface Cliente {
  id: string
  nome: string
  email: string | null
  telefone: string
  status: string
}

interface Veiculo {
  id: string
  marca: string
  modelo: string
  placa: string
}

interface OrdemServico {
  id: string
  status: string
  valor_total: number | null
  created_at: string
}

interface Props {
  /** phone do contato da conversa (ex: "5511999991234") */
  contactPhone: string
  /** Se a conversa já tem cliente vinculado, usar direto sem lookup por telefone */
  clienteId?: string | null
  onClose: () => void
}

const STATUS_COLORS: Record<string, string> = {
  ativo: 'bg-green-500',
  inativo: 'bg-slate-500',
  prospecto: 'bg-blue-500',
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })
}

function formatCurrency(value: number | null): string {
  if (value == null) return '—'
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

function normalizePhone(phone: string): string {
  // Remove +55, espaços, hífens, parênteses antes de comparar
  return phone.replace(/^\+?55/, '').replace(/[\s\-()]/g, '')
}

export default function CrmContextPanel({ contactPhone, clienteId, onClose }: Props) {
  const { empresaId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [cliente, setCliente] = useState<Cliente | null>(null)
  const [veiculos, setVeiculos] = useState<Veiculo[]>([])
  const [ordens, setOrdens] = useState<OrdemServico[]>([])

  useEffect(() => {
    if (!empresaId) return
    setLoading(true)
    setCliente(null)
    setVeiculos([])
    setOrdens([])

    async function load() {
      let foundCliente: Cliente | null = null

      if (clienteId) {
        // Conversa já vinculada — busca direto por ID
        const { data } = await supabase
          .from('clientes')
          .select('id,nome,email,telefone,status')
          .eq('id', clienteId)
          .single()
        foundCliente = data ?? null
      } else {
        // Lookup por telefone normalizado
        const normalizado = normalizePhone(contactPhone)
        const { data } = await supabase
          .from('clientes')
          .select('id,nome,email,telefone,status')
          .eq('empresa_id', empresaId)
          .ilike('telefone', `%${normalizado}%`)
          .limit(1)
          .maybeSingle()
        foundCliente = data ?? null
      }

      setCliente(foundCliente)

      if (foundCliente) {
        const [{ data: veics }, { data: oss }] = await Promise.all([
          supabase
            .from('veiculos')
            .select('id,marca,modelo,placa')
            .eq('cliente_id', foundCliente.id),
          supabase
            .from('ordens_servico')
            .select('id,status,valor_total,created_at')
            .eq('cliente_id', foundCliente.id)
            .order('created_at', { ascending: false })
            .limit(5),
        ])
        setVeiculos(veics ?? [])
        setOrdens(oss ?? [])
      }

      setLoading(false)
    }

    load()
  }, [empresaId, contactPhone, clienteId])

  // LTV: soma das OS concluídas
  const ltv = ordens
    .filter(o => o.status === 'concluida')
    .reduce((acc, o) => acc + (o.valor_total ?? 0), 0)

  return (
    <div className="w-[280px] flex-shrink-0 bg-slate-900 border-l border-slate-700 flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
        <p className="text-sm font-semibold text-white">CRM do Contato</p>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-white p-1 rounded transition-colors"
          aria-label="Fechar painel CRM"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Conteúdo */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
          </div>
        ) : !cliente ? (
          <div className="text-center py-8">
            <User className="h-8 w-8 text-slate-600 mx-auto mb-2" />
            <p className="text-sm text-slate-400">Cliente não encontrado</p>
            <p className="text-xs text-slate-500 mt-1">Nenhum cliente com este telefone</p>
          </div>
        ) : (
          <>
            {/* Seção Cliente */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <User className="h-3.5 w-3.5 text-orange-400" />
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">Cliente</p>
              </div>
              <div className="bg-slate-800 rounded-lg p-3 space-y-1.5">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-medium text-white">{cliente.nome}</p>
                  <span className={`${STATUS_COLORS[cliente.status] ?? 'bg-slate-500'} text-white text-[9px] px-1.5 py-0.5 rounded-full`}>
                    {cliente.status}
                  </span>
                </div>
                {cliente.email && (
                  <p className="text-xs text-slate-400 truncate">{cliente.email}</p>
                )}
                <p className="text-xs text-slate-400">{cliente.telefone}</p>
                {ltv > 0 && (
                  <p className="text-xs text-green-400 font-medium">LTV: {formatCurrency(ltv)}</p>
                )}
              </div>
            </section>

            {/* Seção Veículos */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Car className="h-3.5 w-3.5 text-orange-400" />
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  Veículos ({veiculos.length})
                </p>
              </div>
              {veiculos.length === 0 ? (
                <p className="text-xs text-slate-500 pl-1">Nenhum veículo cadastrado</p>
              ) : (
                <div className="space-y-1.5">
                  {veiculos.map(v => (
                    <div key={v.id} className="bg-slate-800 rounded-lg px-3 py-2">
                      <p className="text-sm text-white">{v.marca} {v.modelo}</p>
                      <p className="text-xs text-slate-400 font-mono">{v.placa}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* Seção OS Recentes */}
            <section>
              <div className="flex items-center gap-2 mb-2">
                <Wrench className="h-3.5 w-3.5 text-orange-400" />
                <p className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                  OS Recentes
                </p>
              </div>
              {ordens.length === 0 ? (
                <p className="text-xs text-slate-500 pl-1">Nenhuma OS encontrada</p>
              ) : (
                <div className="space-y-1.5">
                  {ordens.map(o => (
                    <div key={o.id} className="bg-slate-800 rounded-lg px-3 py-2">
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-xs text-slate-400">{formatDate(o.created_at)}</span>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full text-white ${
                          o.status === 'concluida'     ? 'bg-green-600' :
                          o.status === 'aberta'        ? 'bg-blue-600' :
                          o.status === 'em_andamento'  ? 'bg-yellow-600' :
                          'bg-slate-600'
                        }`}>{o.status}</span>
                      </div>
                      <p className="text-sm text-white font-medium">{formatCurrency(o.valor_total)}</p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* CTA */}
      {cliente && (
        <div className="px-4 py-3 border-t border-slate-700">
          <a
            href="/clientes"
            className="flex items-center justify-center gap-2 w-full py-2 bg-orange-600 hover:bg-orange-500 text-white text-xs font-medium rounded-lg transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
            Ver cliente completo
          </a>
        </div>
      )}
    </div>
  )
}
