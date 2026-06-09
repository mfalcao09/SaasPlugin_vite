import { useEffect, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { QrCode, Plus, Trash2, RefreshCw, Loader2, Power, RotateCw, Star } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import QuickRepliesManager from './QuickRepliesManager'
import OfficeHoursSettings from './OfficeHoursSettings'
import KeywordRulesManager from './KeywordRulesManager'

type SettingsTab = 'instances' | 'quick_replies' | 'office_hours' | 'auto_assign' | 'automations' | 'keywords'

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

interface AgentRow {
  user_id: string
  inbox_available: boolean
}

interface EmpresaSettings {
  auto_assign_enabled: boolean
  followup_enabled: boolean
  followup_delay_days: number
  followup_message: string
}

export default function EvolutionSettings() {
  const { empresaId } = useAuth()
  const [activeTab, setActiveTab] = useState<SettingsTab>('instances')
  const [instances, setInstances] = useState<Instance[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [qrTarget, setQrTarget] = useState<string | null>(null)
  const [qrCode, setQrCode] = useState<string | null>(null)
  const [qrLoading, setQrLoading] = useState(false)
  const [pollingId, setPollingId] = useState<ReturnType<typeof setInterval> | null>(null)

  // Sprint7 F3 + F4 — empresa settings
  const [empSettings, setEmpSettings] = useState<EmpresaSettings>({
    auto_assign_enabled: false,
    followup_enabled: false,
    followup_delay_days: 2,
    followup_message: 'Olá! Passando para verificar se ainda posso te ajudar. 😊',
  })
  const [agents, setAgents] = useState<AgentRow[]>([])
  const [settingsSaving, setSettingsSaving] = useState(false)

  // Sprint7 F3+F4 — carregar settings da empresa + agentes
  useEffect(() => {
    if (!empresaId) return
    supabase
      .from('empresas')
      .select('auto_assign_enabled,followup_enabled,followup_delay_days,followup_message')
      .eq('id', empresaId)
      .single()
      .then(({ data }) => {
        if (data) setEmpSettings({
          auto_assign_enabled: data.auto_assign_enabled ?? false,
          followup_enabled: data.followup_enabled ?? false,
          followup_delay_days: data.followup_delay_days ?? 2,
          followup_message: data.followup_message ?? 'Olá! Passando para verificar se ainda posso te ajudar. 😊',
        })
      })
    supabase
      .from('empresa_users')
      .select('user_id,inbox_available')
      .eq('empresa_id', empresaId)
      .then(({ data }) => {
        if (data) setAgents(data as AgentRow[])
      })
  }, [empresaId])

  async function saveEmpSettings(patch: Partial<EmpresaSettings>) {
    if (!empresaId || settingsSaving) return
    setSettingsSaving(true)
    const next = { ...empSettings, ...patch }
    setEmpSettings(next)
    await supabase.from('empresas').update(patch).eq('id', empresaId)
    setSettingsSaving(false)
  }

  async function toggleAgentAvailability(userId: string, current: boolean) {
    const next = !current
    setAgents(prev => prev.map(a => a.user_id === userId ? { ...a, inbox_available: next } : a))
    await supabase
      .from('empresa_users')
      .update({ inbox_available: next })
      .eq('empresa_id', empresaId)
      .eq('user_id', userId)
  }

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

  async function logoutInstance(instanceId: string) {
    if (!confirm('Desconectar este WhatsApp? A sessão será encerrada e você precisará escanear o QR novamente.')) return
    await supabase.functions.invoke('evolution-proxy', {
      body: { action: 'logout', instance_id: instanceId },
    })
    await loadInstances()
  }

  async function restartInstance(instanceId: string) {
    await supabase.functions.invoke('evolution-proxy', {
      body: { action: 'restart', instance_id: instanceId },
    })
    await loadInstances()
  }

  async function setDefault(instanceId: string) {
    await supabase.functions.invoke('evolution-proxy', {
      body: { action: 'set_default', instance_id: instanceId },
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
    <div className="flex flex-col h-full overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-slate-700 px-6 pt-4 shrink-0">
        <button
          onClick={() => setActiveTab('instances')}
          className={[
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'instances'
              ? 'text-orange-400 border-orange-500'
              : 'text-slate-400 border-transparent hover:text-slate-200',
          ].join(' ')}
        >
          Instâncias
        </button>
        <button
          onClick={() => setActiveTab('quick_replies')}
          className={[
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'quick_replies'
              ? 'text-orange-400 border-orange-500'
              : 'text-slate-400 border-transparent hover:text-slate-200',
          ].join(' ')}
        >
          Respostas Rápidas
        </button>
        <button
          onClick={() => setActiveTab('office_hours')}
          className={[
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'office_hours'
              ? 'text-orange-400 border-orange-500'
              : 'text-slate-400 border-transparent hover:text-slate-200',
          ].join(' ')}
        >
          Horários
        </button>
        <button
          onClick={() => setActiveTab('auto_assign')}
          className={[
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'auto_assign'
              ? 'text-orange-400 border-orange-500'
              : 'text-slate-400 border-transparent hover:text-slate-200',
          ].join(' ')}
        >
          Auto-assign
        </button>
        <button
          onClick={() => setActiveTab('automations')}
          className={[
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'automations'
              ? 'text-orange-400 border-orange-500'
              : 'text-slate-400 border-transparent hover:text-slate-200',
          ].join(' ')}
        >
          Automações
        </button>
        <button
          onClick={() => setActiveTab('keywords')}
          className={[
            'px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px',
            activeTab === 'keywords'
              ? 'text-orange-400 border-orange-500'
              : 'text-slate-400 border-transparent hover:text-slate-200',
          ].join(' ')}
        >
          Keywords
        </button>
      </div>

      {/* Conteúdo das abas */}
      {activeTab === 'office_hours' ? (
        <div className="flex-1 overflow-y-auto p-6">
          {empresaId && <OfficeHoursSettings empresaId={empresaId} />}
        </div>
      ) : activeTab === 'quick_replies' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <h2 className="text-white font-semibold text-lg mb-1">Respostas Rápidas</h2>
            <p className="text-slate-400 text-sm">Templates de mensagem para agilizar o atendimento.</p>
          </div>
          <QuickRepliesManager empresaId={empresaId} />
        </div>
      ) : activeTab === 'keywords' ? (
        <div className="flex-1 overflow-y-auto p-6">
          <div className="mb-4">
            <h2 className="text-white font-semibold text-lg mb-1">Respostas por Palavra-chave</h2>
            <p className="text-slate-400 text-sm">Resposta automática quando o contato enviar determinada palavra.</p>
          </div>
          {empresaId && <KeywordRulesManager empresaId={empresaId} />}
        </div>
      ) : activeTab === 'auto_assign' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-white font-semibold text-lg mb-1">Auto-assign Round-Robin</h2>
            <p className="text-slate-400 text-sm">Atribui automaticamente novas conversas aos agentes disponíveis.</p>
          </div>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">Auto-assign ativo</p>
                  <p className="text-slate-400 text-xs">Novas conversas são distribuídas automaticamente</p>
                </div>
                <button
                  onClick={() => saveEmpSettings({ auto_assign_enabled: !empSettings.auto_assign_enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${empSettings.auto_assign_enabled ? 'bg-orange-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${empSettings.auto_assign_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div>
                <p className="text-white text-sm font-medium mb-2">Agentes disponíveis</p>
                {agents.length === 0 && <p className="text-slate-500 text-sm">Nenhum agente encontrado.</p>}
                <div className="space-y-2">
                  {agents.map(agent => (
                    <div key={agent.user_id} className="flex items-center justify-between bg-slate-700/50 rounded-lg px-3 py-2">
                      <span className="text-slate-300 text-sm font-mono">{agent.user_id.slice(0, 12)}…</span>
                      <button
                        onClick={() => toggleAgentAvailability(agent.user_id, agent.inbox_available)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${agent.inbox_available ? 'bg-green-500' : 'bg-slate-600'}`}
                      >
                        <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${agent.inbox_available ? 'translate-x-5' : 'translate-x-1'}`} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : activeTab === 'automations' ? (
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <h2 className="text-white font-semibold text-lg mb-1">Follow-up Automático</h2>
            <p className="text-slate-400 text-sm">Envia mensagem automática para conversas inativas (máx. 3x por conversa).</p>
          </div>
          <Card className="bg-slate-800 border-slate-700">
            <CardContent className="pt-4 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-white text-sm font-medium">Follow-up automático</p>
                  <p className="text-slate-400 text-xs">Reativa conversas inativas</p>
                </div>
                <button
                  onClick={() => saveEmpSettings({ followup_enabled: !empSettings.followup_enabled })}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${empSettings.followup_enabled ? 'bg-orange-500' : 'bg-slate-600'}`}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${empSettings.followup_enabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div>
                <label className="text-slate-300 text-sm block mb-1">Após quantos dias de inatividade</label>
                <Input
                  type="number"
                  min={1}
                  max={7}
                  value={empSettings.followup_delay_days}
                  onChange={e => setEmpSettings(prev => ({ ...prev, followup_delay_days: Number(e.target.value) }))}
                  onBlur={() => saveEmpSettings({ followup_delay_days: empSettings.followup_delay_days })}
                  className="bg-slate-700 border-slate-600 text-white w-24"
                />
              </div>

              <div>
                <label className="text-slate-300 text-sm block mb-1">Mensagem de follow-up</label>
                <textarea
                  value={empSettings.followup_message}
                  onChange={e => setEmpSettings(prev => ({ ...prev, followup_message: e.target.value }))}
                  onBlur={() => saveEmpSettings({ followup_message: empSettings.followup_message })}
                  rows={3}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                  placeholder="Mensagem de follow-up..."
                />
              </div>

              {settingsSaving && (
                <p className="text-xs text-slate-500 flex items-center gap-1">
                  <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                <div className="flex items-center gap-1">
                  <Badge className={`${s.color} text-white text-xs mr-1`}>{s.label}</Badge>

                  {/* Star: marcar como padrão */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className={`h-8 w-8 ${inst.is_default ? 'text-yellow-400' : 'text-slate-500 hover:text-yellow-400'}`}
                    onClick={() => !inst.is_default && setDefault(inst.id)}
                    title={inst.is_default ? 'Instância padrão' : 'Marcar como padrão'}
                  >
                    <Star className={`h-4 w-4 ${inst.is_default ? 'fill-current' : ''}`} />
                  </Button>

                  {/* QR Code: gerar novo QR (reconectar quando desconectado) */}
                  {inst.status !== 'connected' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-white"
                      onClick={() => fetchQr(inst.id)}
                      title="Gerar QR Code para conectar"
                    >
                      <QrCode className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Logout: desconectar WhatsApp (só quando conectado) */}
                  {inst.status === 'connected' && (
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8 text-slate-400 hover:text-orange-400"
                      onClick={() => logoutInstance(inst.id)}
                      title="Desconectar WhatsApp"
                    >
                      <Power className="h-4 w-4" />
                    </Button>
                  )}

                  {/* Restart: reiniciar instância */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-400 hover:text-white"
                    onClick={() => restartInstance(inst.id)}
                    title="Reiniciar instância"
                  >
                    <RotateCw className="h-4 w-4" />
                  </Button>

                  {/* Delete: remover instância */}
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-8 w-8 text-slate-400 hover:text-red-400"
                    onClick={() => deleteInstance(inst.id)}
                    title="Remover instância"
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
      )}
    </div>
  )
}
