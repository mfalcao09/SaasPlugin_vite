import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { QrCode, Plus, Trash2, RefreshCw, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface Instance {
  id: string
  name: string
  instance_id: string | null
  phone_number: string | null
  status: string
  qr_code: string | null
  is_default: boolean
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  connected:    { label: 'Conectado',      color: 'bg-green-500' },
  connecting:   { label: 'Conectando...',  color: 'bg-yellow-500' },
  disconnected: { label: 'Desconectado',   color: 'bg-slate-500' },
  error:        { label: 'Erro',           color: 'bg-red-500' },
}

export default function EvolutionSettings() {
  const { empresaId } = useAuth()
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [qrTarget, setQrTarget] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null)

  const loadInstances = useCallback(async () => {
    const { data } = await supabase
      .from('evolution_instances')
      .select('id,name,instance_id,phone_number,status,qr_code,is_default')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: true })
    if (data) setInstances(data)
    setLoading(false)
  }, [empresaId])

  useEffect(() => {
    if (!empresaId) return
    loadInstances()
    const channel = supabase
      .channel(`evo-instances-${empresaId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'evolution_instances', filter: `empresa_id=eq.${empresaId}` },
        () => loadInstances(),
      )
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [empresaId, loadInstances])

  // Auto-stop QR polling when instance connects
  useEffect(() => {
    if (qrTarget && instances.find(i => i.id === qrTarget)?.status === 'connected') {
      if (pollingId) clearInterval(pollingId)
      setPollingId(null)
      setQrTarget(null)
      setQrCode(null)
    }
  }, [instances, qrTarget, pollingId])

  // Cleanup polling on unmount
  useEffect(() => () => { if (pollingId) clearInterval(pollingId) }, [pollingId])

  async function createInstance() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      await supabase.functions.invoke('evolution-proxy', {
        body: { action: 'create', name: newName.trim() },
      })
      setNewName('')
      await loadInstances()
    } finally {
      setCreating(false)
    }
  }

  async function fetchQr(instanceId: string) {
    if (pollingId) clearInterval(pollingId)
    setQrTarget(instanceId)
    setQrCode(null)
    setQrLoading(true)

    async function refresh() {
      const { data: row } = await supabase
        .from('evolution_instances')
        .select('qr_code,status')
        .eq('id', instanceId)
        .single()
      if (row?.qr_code) setQrCode(row.qr_code)
    }

    await supabase.functions.invoke('evolution-proxy', {
      body: { action: 'qrcode', instance_id: instanceId },
    })
    await refresh()
    setQrLoading(false)

    const id = setInterval(refresh, 4000)
    setPollingId(id)
  }

  async function deleteInstance(instanceId: string) {
    if (!confirm('Remover esta instância? O número será desconectado.')) return
    await supabase.functions.invoke('evolution-proxy', {
      body: { action: 'delete', instance_id: instanceId },
    })
    await loadInstances()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="p-6 space-y-6 overflow-y-auto h-full">
      <div>
        <h2 className="text-white font-semibold text-lg mb-1">Instâncias WhatsApp</h2>
        <p className="text-slate-400 text-sm">Cada instância conecta um número ao inbox desta empresa.</p>
      </div>

      {/* Create */}
      <Card className="bg-slate-800 border-slate-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-sm">Nova instância</CardTitle>
        </CardHeader>
        <CardContent className="flex gap-2">
          <Input
            value={newName}
            onChange={e => setNewName(e.target.value)}
            placeholder="Nome (ex: Atendimento)"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            onKeyDown={e => e.key === 'Enter' && createInstance()}
          />
          <Button
            onClick={createInstance}
            disabled={creating || !newName.trim()}
            className="bg-orange-600 hover:bg-orange-500 text-white shrink-0"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </CardContent>
      </Card>

      {/* Instances list */}
      {instances.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-8">Nenhuma instância criada ainda.</p>
      )}

      {instances.map(inst => {
        const s = STATUS_MAP[inst.status] ?? { label: inst.status, color: 'bg-slate-500' }
        const isTarget = qrTarget === inst.id
        return (
          <Card key={inst.id} className="bg-slate-800 border-slate-700">
            <CardContent className="pt-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white font-medium">{inst.name}</p>
                  {inst.phone_number && (
                    <p className="text-slate-400 text-xs">+{inst.phone_number}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={`${s.color} text-white text-xs`}>{s.label}</Badge>
                  {inst.status !== 'connected' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-white"
                      onClick={() => fetchQr(inst.id)}
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  )}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-400 hover:text-red-400"
                    onClick={() => deleteInstance(inst.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* QR Code panel */}
              {isTarget && (
                <div className="flex flex-col items-center gap-3 py-4">
                  {qrLoading && (
                    <div className="flex items-center gap-2 text-slate-400 text-sm">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Gerando QR Code...
                    </div>
                  )}
                  {!qrLoading && qrCode && (
                    <>
                      <img
                        src={qrCode.startsWith('data:') ? qrCode : `data:image/png;base64,${qrCode}`}
                        alt="QR Code WhatsApp"
                        className="w-48 h-48 rounded-lg bg-white p-2"
                      />
                      <p className="text-slate-400 text-xs text-center">
                        Abra o WhatsApp → Dispositivos conectados → Conectar dispositivo
                      </p>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-slate-400 hover:text-white text-xs"
                        onClick={() => fetchQr(inst.id)}
                      >
                        <RefreshCw className="h-3 w-3 mr-1" /> Atualizar QR
                      </Button>
                    </>
                  )}
                  {!qrLoading && !qrCode && (
                    <p className="text-slate-500 text-sm">Aguardando QR Code...</p>
                  )}
                </div>
              )}
            </CardContent>
          </Card>
        )
      })}
    </div>
  )
}
