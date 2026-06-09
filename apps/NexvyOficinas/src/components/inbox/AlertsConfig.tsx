// Sprint9 F5 — Configuração de Alertas WhatsApp para o dono da empresa
// Lê/escreve colunas: empresas.alert_phone, alert_new_conversation,
// alert_low_csat, alert_queue_threshold. Os DISPAROS ficam no webhook (S10 F2).

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Bell, Loader2, Save, MessageSquarePlus, Star, Users } from 'lucide-react'
import { Input } from '@/components/ui/input'

interface Props {
  empresaId: string | null
}

interface AlertSettings {
  alert_phone: string | null
  alert_new_conversation: boolean
  alert_low_csat: boolean
  alert_queue_threshold: number | null
}

const DEFAULTS: AlertSettings = {
  alert_phone: null,
  alert_new_conversation: false,
  alert_low_csat: false,
  alert_queue_threshold: null,
}

function normalizePhone(raw: string): string {
  return raw.replace(/\D/g, '')
}

export default function AlertsConfig({ empresaId }: Props) {
  const [settings, setSettings] = useState<AlertSettings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [savedFeedback, setSavedFeedback] = useState(false)
  const [phoneInput, setPhoneInput] = useState('')
  const [thresholdInput, setThresholdInput] = useState('')

  useEffect(() => {
    if (!empresaId) return
    supabase
      .from('empresas')
      .select('alert_phone,alert_new_conversation,alert_low_csat,alert_queue_threshold')
      .eq('id', empresaId)
      .single()
      .then(({ data }) => {
        if (data) {
          setSettings({
            alert_phone: data.alert_phone ?? null,
            alert_new_conversation: data.alert_new_conversation ?? false,
            alert_low_csat: data.alert_low_csat ?? false,
            alert_queue_threshold: data.alert_queue_threshold ?? null,
          })
          setPhoneInput(data.alert_phone ?? '')
          setThresholdInput(data.alert_queue_threshold ? String(data.alert_queue_threshold) : '')
        }
        setLoading(false)
      })
  }, [empresaId])

  async function save(patch: Partial<AlertSettings>) {
    if (!empresaId || saving) return
    setSaving(true)
    const next = { ...settings, ...patch }
    setSettings(next)
    await supabase.from('empresas').update(patch).eq('id', empresaId)
    setSaving(false)
    setSavedFeedback(true)
    setTimeout(() => setSavedFeedback(false), 1500)
  }

  function handlePhoneBlur() {
    const normalized = normalizePhone(phoneInput)
    const valueToSave = normalized || null
    if (valueToSave !== settings.alert_phone) {
      save({ alert_phone: valueToSave })
    }
  }

  function handleThresholdBlur() {
    const parsed = thresholdInput ? parseInt(thresholdInput, 10) : null
    const valueToSave = parsed && !isNaN(parsed) && parsed > 0 ? parsed : null
    if (valueToSave !== settings.alert_queue_threshold) {
      save({ alert_queue_threshold: valueToSave })
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    )
  }

  const phoneValid = settings.alert_phone !== null && settings.alert_phone.length >= 10

  return (
    <div className="space-y-5 max-w-2xl">
      {/* Phone destino */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl p-4">
        <label className="flex items-center gap-2 text-sm font-semibold text-white mb-2">
          <Bell className="h-4 w-4 text-orange-400" />
          Telefone do dono (WhatsApp)
        </label>
        <p className="text-xs text-slate-400 mb-3">
          Número que receberá os alertas. Formato internacional sem o "+": ex. 5511987654321
        </p>
        <Input
          value={phoneInput}
          onChange={e => setPhoneInput(e.target.value)}
          onBlur={handlePhoneBlur}
          placeholder="5511987654321"
          className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500 max-w-xs"
        />
        {!phoneValid && phoneInput.length > 0 && (
          <p className="text-xs text-yellow-400 mt-1">Número precisa ter ao menos 10 dígitos.</p>
        )}
      </div>

      {/* Triggers */}
      <div className="bg-slate-800 border border-slate-700 rounded-xl divide-y divide-slate-700">
        <ToggleRow
          icon={MessageSquarePlus}
          title="Nova conversa atribuída"
          description="Receber alerta sempre que o auto-assign atribuir uma nova conversa."
          enabled={settings.alert_new_conversation}
          onToggle={() => save({ alert_new_conversation: !settings.alert_new_conversation })}
          disabled={!phoneValid}
        />
        <ToggleRow
          icon={Star}
          title="CSAT baixo (≤ 2)"
          description="Receber alerta quando um cliente responder CSAT 1 ou 2."
          enabled={settings.alert_low_csat}
          onToggle={() => save({ alert_low_csat: !settings.alert_low_csat })}
          disabled={!phoneValid}
        />
        <div className="flex items-start justify-between gap-3 p-4">
          <div className="flex gap-3 flex-1 min-w-0">
            <Users className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-sm font-medium text-white">Fila acima do limite</p>
              <p className="text-xs text-slate-400 mt-0.5">
                Alerta quando houver muitas conversas aguardando atendimento humano.
              </p>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1 shrink-0">
            <Input
              type="number"
              min={1}
              max={500}
              value={thresholdInput}
              onChange={e => setThresholdInput(e.target.value)}
              onBlur={handleThresholdBlur}
              placeholder="∞"
              className="bg-slate-700 border-slate-600 text-white w-20 text-center"
              disabled={!phoneValid}
            />
            <span className="text-[10px] text-slate-500">limite</span>
          </div>
        </div>
      </div>

      {savedFeedback && (
        <p className="text-xs text-green-400 flex items-center gap-1">
          <Save className="h-3 w-3" /> Configuração salva
        </p>
      )}
      {saving && (
        <p className="text-xs text-slate-500 flex items-center gap-1">
          <Loader2 className="h-3 w-3 animate-spin" /> Salvando...
        </p>
      )}
    </div>
  )
}

function ToggleRow({
  icon: Icon,
  title,
  description,
  enabled,
  onToggle,
  disabled,
}: {
  icon: React.ElementType
  title: string
  description: string
  enabled: boolean
  onToggle: () => void
  disabled?: boolean
}) {
  return (
    <div className="flex items-start justify-between gap-3 p-4">
      <div className="flex gap-3 flex-1 min-w-0">
        <Icon className="h-4 w-4 text-orange-400 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-white">{title}</p>
          <p className="text-xs text-slate-400 mt-0.5">{description}</p>
        </div>
      </div>
      <button
        onClick={onToggle}
        disabled={disabled}
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${
          disabled
            ? 'bg-slate-700 opacity-50 cursor-not-allowed'
            : enabled
              ? 'bg-orange-500'
              : 'bg-slate-600'
        }`}
      >
        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          enabled ? 'translate-x-6' : 'translate-x-1'
        }`} />
      </button>
    </div>
  )
}
