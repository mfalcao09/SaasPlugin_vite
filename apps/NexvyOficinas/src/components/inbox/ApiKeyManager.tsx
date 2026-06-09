// Sprint9 F6 — Gerenciador de API Keys para integrações externas
// SECURITY (Seção 11.1 CLAUDE.md): plaintext NUNCA persiste no banco.
// Hash SHA-256 + prefix visível são gravados. Plaintext exibido UMA vez no UI.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Key, Plus, Trash2, Loader2, Copy, Check, AlertCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Props {
  empresaId: string | null
}

interface ApiKeyRow {
  id: string
  name: string
  key_prefix: string
  last_used_at: string | null
  revoked_at: string | null
  created_at: string
}

async function sha256Hex(text: string): Promise<string> {
  const buf = new TextEncoder().encode(text)
  const digest = await crypto.subtle.digest('SHA-256', buf)
  return Array.from(new Uint8Array(digest))
    .map(b => b.toString(16).padStart(2, '0'))
    .join('')
}

function generateApiKey(): string {
  const arr = new Uint8Array(24)
  crypto.getRandomValues(arr)
  const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('')
  return `nxv_${hex}`
}

function formatDate(iso: string | null): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  })
}

export default function ApiKeyManager({ empresaId }: Props) {
  const { user } = useAuth()
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [showForm, setShowForm] = useState(false)
  const [newKeyName, setNewKeyName] = useState('')
  const [creating, setCreating] = useState(false)
  const [justCreated, setJustCreated] = useState<{ key: string; name: string } | null>(null)
  const [copied, setCopied] = useState(false)

  async function load() {
    if (!empresaId) return
    const { data } = await supabase
      .from('empresa_api_keys')
      .select('id,name,key_prefix,last_used_at,revoked_at,created_at')
      .eq('empresa_id', empresaId)
      .order('created_at', { ascending: false })
    if (data) setKeys(data as ApiKeyRow[])
    setLoading(false)
  }

  useEffect(() => { load() }, [empresaId])

  async function handleCreate() {
    if (!empresaId || !user || !newKeyName.trim()) return
    setCreating(true)
    try {
      const plain = generateApiKey()
      const hash = await sha256Hex(plain)
      const prefix = plain.slice(0, 12)

      const { error } = await supabase.from('empresa_api_keys').insert({
        empresa_id: empresaId,
        name: newKeyName.trim(),
        key_hash: hash,
        key_prefix: prefix,
        created_by: user.id,
      })
      if (error) throw error

      setJustCreated({ key: plain, name: newKeyName.trim() })
      setShowForm(false)
      setNewKeyName('')
      await load()
    } finally {
      setCreating(false)
    }
  }

  async function handleRevoke(id: string) {
    if (!confirm('Revogar esta API key? Ela deixará de funcionar imediatamente.')) return
    await supabase
      .from('empresa_api_keys')
      .update({ revoked_at: new Date().toISOString() })
      .eq('id', id)
    await load()
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir permanentemente esta API key?')) return
    await supabase.from('empresa_api_keys').delete().eq('id', id)
    await load()
  }

  async function copyKey(plain: string) {
    await navigator.clipboard.writeText(plain)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4 max-w-3xl">
      {/* Aviso de segurança */}
      <div className="bg-amber-900/20 border border-amber-600/40 rounded-xl p-3 flex items-start gap-2">
        <AlertCircle className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <div className="text-xs text-amber-200">
          <p className="font-medium">A chave completa é exibida apenas uma vez.</p>
          <p className="text-amber-200/80 mt-0.5">
            Copie e guarde em local seguro. Se perder, revogue e gere uma nova — nunca armazenamos o valor original.
          </p>
        </div>
      </div>

      {/* Chave recém-criada (banner one-time) */}
      {justCreated && (
        <div className="bg-green-900/20 border border-green-600/40 rounded-xl p-4 space-y-2">
          <p className="text-sm font-medium text-green-200">
            Chave "{justCreated.name}" criada. Copie agora:
          </p>
          <div className="flex gap-2">
            <code className="flex-1 bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-xs text-green-300 font-mono break-all">
              {justCreated.key}
            </code>
            <Button
              size="sm"
              onClick={() => copyKey(justCreated.key)}
              className="bg-orange-600 hover:bg-orange-500 text-white shrink-0"
            >
              {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            </Button>
          </div>
          <button
            onClick={() => setJustCreated(null)}
            className="text-xs text-slate-400 hover:text-white underline"
          >
            Já copiei, ocultar
          </button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Chaves de API</h3>
        {!showForm && (
          <Button
            size="sm"
            onClick={() => setShowForm(true)}
            className="bg-orange-600 hover:bg-orange-500 text-white text-xs"
          >
            <Plus className="h-3 w-3 mr-1" /> Nova chave
          </Button>
        )}
      </div>

      {showForm && (
        <div className="bg-slate-800 border border-slate-700 rounded-xl p-4 space-y-3">
          <label className="text-sm text-slate-300 block">Nome da chave</label>
          <Input
            value={newKeyName}
            onChange={e => setNewKeyName(e.target.value)}
            placeholder="Ex: Integração CRM Salesforce"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
            autoFocus
          />
          <div className="flex gap-2">
            <Button
              size="sm"
              onClick={handleCreate}
              disabled={creating || !newKeyName.trim()}
              className="bg-orange-600 hover:bg-orange-500 text-white"
            >
              {creating ? <Loader2 className="h-3 w-3 animate-spin" /> : 'Gerar chave'}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => { setShowForm(false); setNewKeyName('') }}
              className="text-slate-400"
            >
              Cancelar
            </Button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {keys.length === 0 && !showForm && (
          <p className="text-xs text-slate-500 text-center py-8">Nenhuma chave criada.</p>
        )}
        {keys.map(k => {
          const revoked = k.revoked_at !== null
          return (
            <div
              key={k.id}
              className={`flex items-center gap-3 p-3 rounded-xl border ${
                revoked ? 'bg-slate-800/50 border-slate-700/50 opacity-60' : 'bg-slate-800 border-slate-700'
              }`}
            >
              <Key className={`h-4 w-4 shrink-0 ${revoked ? 'text-slate-600' : 'text-orange-400'}`} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className={`text-sm font-medium truncate ${revoked ? 'text-slate-500 line-through' : 'text-white'}`}>
                    {k.name}
                  </p>
                  {revoked && (
                    <span className="text-[10px] bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded">
                      revogada
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 font-mono mt-0.5">
                  {k.key_prefix}…
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Criada {formatDate(k.created_at)}
                  {k.last_used_at && ` · último uso ${formatDate(k.last_used_at)}`}
                </p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!revoked && (
                  <button
                    onClick={() => handleRevoke(k.id)}
                    className="text-slate-400 hover:text-red-400 p-1 text-xs"
                    title="Revogar"
                  >
                    Revogar
                  </button>
                )}
                <button
                  onClick={() => handleDelete(k.id)}
                  className="text-slate-500 hover:text-red-400 p-1"
                  title="Excluir"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
