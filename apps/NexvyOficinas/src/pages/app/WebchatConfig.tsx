// Sprint 10 F4 — Webchat config page
// Gera/exibe snippet de incorporação + personalização visual + preview

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Loader2, Copy, Check, Globe, Palette, MessageCircle, RefreshCw } from 'lucide-react'
import { toast } from 'sonner'

interface WebchatSettings {
  webchat_enabled: boolean
  webchat_greeting: string
  webchat_primary_color: string
  webchat_agent_name: string
}

const SUPABASE_PROJECT_URL = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ??
  'https://gpxmkximudukbljrvtxj.supabase.co'

function genRandomKey(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  return Array.from(arr).map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function WebchatConfig() {
  const { empresaId } = useAuth()
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [settings, setSettings] = useState<WebchatSettings>({
    webchat_enabled: false,
    webchat_greeting: 'Olá! Como posso ajudar?',
    webchat_primary_color: '#ea580c',
    webchat_agent_name: 'Suporte',
  })
  const [apiKey, setApiKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!empresaId) return
    let cancelled = false

    async function load() {
      setLoading(true)
      try {
        const { data: emp } = await supabase
          .from('empresas')
          .select('webchat_enabled, webchat_greeting, webchat_primary_color, webchat_agent_name')
          .eq('id', empresaId)
          .single()
        if (cancelled) return
        if (emp) {
          setSettings({
            webchat_enabled: !!emp.webchat_enabled,
            webchat_greeting: emp.webchat_greeting ?? 'Olá! Como posso ajudar?',
            webchat_primary_color: emp.webchat_primary_color ?? '#ea580c',
            webchat_agent_name: emp.webchat_agent_name ?? 'Suporte',
          })
        }

        const { data: keyRow } = await supabase
          .from('empresa_api_keys')
          .select('api_key')
          .eq('empresa_id', empresaId)
          .is('revoked_at', null)
          .order('created_at', { ascending: false })
          .limit(1)
          .single()
        if (cancelled) return
        if (keyRow) setApiKey(keyRow.api_key as string)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [empresaId])

  async function handleSave() {
    if (!empresaId) return
    setSaving(true)
    try {
      const { error } = await supabase
        .from('empresas')
        .update({
          webchat_enabled: settings.webchat_enabled,
          webchat_greeting: settings.webchat_greeting,
          webchat_primary_color: settings.webchat_primary_color,
          webchat_agent_name: settings.webchat_agent_name,
        })
        .eq('id', empresaId)
      if (error) throw error
      toast.success('Configurações salvas')
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Erro desconhecido'
      toast.error('Falha ao salvar: ' + msg)
    } finally {
      setSaving(false)
    }
  }

  async function handleGenerateKey() {
    if (!empresaId) return
    const newKey = genRandomKey()
    const { error } = await supabase
      .from('empresa_api_keys')
      .insert({ empresa_id: empresaId, api_key: newKey, label: 'Webchat widget' })
    if (error) {
      toast.error('Erro ao gerar chave: ' + error.message)
      return
    }
    setApiKey(newKey)
    toast.success('Chave gerada')
  }

  function handleCopy() {
    if (!apiKey) return
    const snippet = `<script src="${SUPABASE_PROJECT_URL}/functions/v1/webchat-widget?key=${apiKey}"></script>`
    navigator.clipboard.writeText(snippet).then(() => {
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    })
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    )
  }

  const snippet = apiKey
    ? `<script src="${SUPABASE_PROJECT_URL}/functions/v1/webchat-widget?key=${apiKey}"></script>`
    : ''

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Globe className="w-7 h-7 text-orange-500" />
        <div>
          <h1 className="text-2xl font-bold text-white">Webchat</h1>
          <p className="text-slate-400 text-sm">Widget de chat embeddable para seu site</p>
        </div>
      </div>

      {/* Toggle de ativação */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 mb-5">
        <label className="flex items-center gap-3 cursor-pointer">
          <input
            type="checkbox"
            checked={settings.webchat_enabled}
            onChange={(e) => setSettings({ ...settings, webchat_enabled: e.target.checked })}
            className="w-5 h-5 accent-orange-600"
          />
          <span className="text-white font-medium">Habilitar widget no site</span>
        </label>
        <p className="text-slate-400 text-xs mt-1 ml-8">
          Quando desativado, o widget não carrega mesmo se o script estiver no site.
        </p>
      </div>

      {/* Snippet */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 mb-5">
        <h2 className="text-white font-semibold mb-3 flex items-center gap-2">
          <MessageCircle className="w-4 h-4 text-orange-400" />
          Snippet de incorporação
        </h2>
        {apiKey ? (
          <>
            <textarea
              readOnly
              value={snippet}
              className="w-full bg-slate-950 border border-slate-800 rounded p-3 text-xs font-mono text-slate-300 resize-none"
              rows={3}
              onClick={(e) => (e.target as HTMLTextAreaElement).select()}
            />
            <div className="flex gap-2 mt-3">
              <button
                onClick={handleCopy}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copiado!' : 'Copiar snippet'}
              </button>
              <button
                onClick={handleGenerateKey}
                className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-sm font-medium transition-colors"
              >
                <RefreshCw className="w-4 h-4" />
                Gerar nova chave
              </button>
            </div>
            <p className="text-slate-500 text-xs mt-2">
              Cole este script antes de <code>&lt;/body&gt;</code> em todas as páginas do seu site.
            </p>
          </>
        ) : (
          <div>
            <p className="text-slate-400 text-sm mb-3">
              Você ainda não gerou uma chave de API para o webchat.
            </p>
            <button
              onClick={handleGenerateKey}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 text-white rounded-lg text-sm font-medium"
            >
              <RefreshCw className="w-4 h-4" />
              Gerar chave de API
            </button>
          </div>
        )}
      </div>

      {/* Personalização */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5 mb-5">
        <h2 className="text-white font-semibold mb-4 flex items-center gap-2">
          <Palette className="w-4 h-4 text-orange-400" />
          Personalização
        </h2>
        <div className="grid md:grid-cols-2 gap-4">
          <div>
            <label className="block text-slate-300 text-sm mb-1">Cor primária</label>
            <div className="flex gap-2 items-center">
              <input
                type="color"
                value={settings.webchat_primary_color}
                onChange={(e) =>
                  setSettings({ ...settings, webchat_primary_color: e.target.value })
                }
                className="w-12 h-10 rounded border border-slate-700 bg-slate-950 cursor-pointer"
              />
              <input
                type="text"
                value={settings.webchat_primary_color}
                onChange={(e) =>
                  setSettings({ ...settings, webchat_primary_color: e.target.value })
                }
                className="flex-1 bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white font-mono"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-300 text-sm mb-1">Nome do atendente</label>
            <input
              type="text"
              value={settings.webchat_agent_name}
              onChange={(e) => setSettings({ ...settings, webchat_agent_name: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white"
              maxLength={40}
            />
          </div>
          <div className="md:col-span-2">
            <label className="block text-slate-300 text-sm mb-1">Mensagem de boas-vindas</label>
            <textarea
              value={settings.webchat_greeting}
              onChange={(e) => setSettings({ ...settings, webchat_greeting: e.target.value })}
              className="w-full bg-slate-950 border border-slate-800 rounded px-3 py-2 text-sm text-white resize-none"
              rows={3}
              maxLength={300}
            />
          </div>
        </div>
        <button
          onClick={handleSave}
          disabled={saving}
          className="mt-4 flex items-center gap-2 px-4 py-2 bg-orange-600 hover:bg-orange-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          Salvar configurações
        </button>
      </div>

      {/* Preview */}
      <div className="bg-slate-900 border border-slate-800 rounded-lg p-5">
        <h2 className="text-white font-semibold mb-4">Preview visual</h2>
        <div className="relative bg-slate-100 rounded-lg h-80 overflow-hidden">
          <div
            className="absolute bottom-4 right-4 w-72 max-w-full rounded-2xl shadow-2xl bg-white flex flex-col overflow-hidden"
            style={{ maxHeight: 280 }}
          >
            <div
              className="px-4 py-3 text-white font-semibold text-sm"
              style={{ backgroundColor: settings.webchat_primary_color }}
            >
              {settings.webchat_agent_name || 'Suporte'}
            </div>
            <div className="flex-1 p-3 space-y-2 bg-slate-50">
              <div className="text-xs bg-white border border-slate-200 rounded-xl px-3 py-2 max-w-[80%] text-slate-800">
                {settings.webchat_greeting || 'Olá! Como posso ajudar?'}
              </div>
              <div
                className="text-xs rounded-xl px-3 py-2 max-w-[80%] ml-auto text-white"
                style={{ backgroundColor: settings.webchat_primary_color }}
              >
                Quero saber sobre os serviços
              </div>
            </div>
            <div className="border-t border-slate-200 p-2 flex gap-2 bg-white">
              <input
                disabled
                placeholder="Digite sua mensagem..."
                className="flex-1 text-xs border border-slate-300 rounded px-2 py-1 bg-slate-50"
              />
              <button
                disabled
                className="text-xs text-white rounded px-3 py-1"
                style={{ backgroundColor: settings.webchat_primary_color }}
              >
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
