// Sprint 7 F5 — Keyword Auto-responder Manager
// CRUD de regras de resposta automática por palavra-chave.

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Trash2, Pencil, Check, X, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Badge } from '@/components/ui/badge'

type MatchType = 'contains' | 'exact' | 'starts_with'

interface KeywordRule {
  id: string
  keyword: string
  response: string
  match_type: MatchType
  is_active: boolean
  priority: number
}

const MATCH_LABELS: Record<MatchType, string> = {
  contains: 'Contém',
  exact: 'Exato',
  starts_with: 'Inicia com',
}

const MATCH_OPTIONS: { value: MatchType; label: string }[] = [
  { value: 'contains', label: 'Contém' },
  { value: 'exact', label: 'Exato' },
  { value: 'starts_with', label: 'Inicia com' },
]

interface Props {
  empresaId: string
}

interface EditState {
  keyword: string
  response: string
  match_type: MatchType
  priority: number
}

const emptyEdit = (): EditState => ({
  keyword: '',
  response: '',
  match_type: 'contains',
  priority: 0,
})

export default function KeywordRulesManager({ empresaId }: Props) {
  const [rules, setRules] = useState<KeywordRule[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)

  // Form para nova regra
  const [newRule, setNewRule] = useState<EditState>(emptyEdit())
  const [showForm, setShowForm] = useState(false)

  // Edição inline
  const [editId, setEditId] = useState<string | null>(null)
  const [editState, setEditState] = useState<EditState>(emptyEdit())

  async function loadRules() {
    setLoading(true)
    const { data } = await supabase
      .from('inbox_keyword_rules')
      .select('id,keyword,response,match_type,is_active,priority')
      .eq('empresa_id', empresaId)
      .order('priority', { ascending: false })
      .order('created_at', { ascending: true })
    if (data) setRules(data as KeywordRule[])
    setLoading(false)
  }

  useEffect(() => {
    loadRules()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  async function addRule() {
    if (!newRule.keyword.trim() || !newRule.response.trim()) return
    setSaving(true)
    const { error } = await supabase.from('inbox_keyword_rules').insert({
      empresa_id: empresaId,
      keyword: newRule.keyword.trim(),
      response: newRule.response.trim(),
      match_type: newRule.match_type,
      priority: newRule.priority,
      is_active: true,
    })
    if (!error) {
      setNewRule(emptyEdit())
      setShowForm(false)
      await loadRules()
    }
    setSaving(false)
  }

  async function deleteRule(id: string) {
    if (!confirm('Remover esta regra?')) return
    await supabase.from('inbox_keyword_rules').delete().eq('id', id)
    setRules(prev => prev.filter(r => r.id !== id))
  }

  async function toggleActive(rule: KeywordRule) {
    const next = !rule.is_active
    setRules(prev => prev.map(r => r.id === rule.id ? { ...r, is_active: next } : r))
    await supabase
      .from('inbox_keyword_rules')
      .update({ is_active: next })
      .eq('id', rule.id)
  }

  function startEdit(rule: KeywordRule) {
    setEditId(rule.id)
    setEditState({
      keyword: rule.keyword,
      response: rule.response,
      match_type: rule.match_type,
      priority: rule.priority,
    })
  }

  async function saveEdit(id: string) {
    setSaving(true)
    const { error } = await supabase
      .from('inbox_keyword_rules')
      .update({
        keyword: editState.keyword.trim(),
        response: editState.response.trim(),
        match_type: editState.match_type,
        priority: editState.priority,
      })
      .eq('id', id)
    if (!error) {
      setEditId(null)
      await loadRules()
    }
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Lista de regras */}
      {rules.length === 0 && !showForm && (
        <p className="text-slate-500 text-sm text-center py-6">
          Nenhuma regra criada. Adicione a primeira abaixo.
        </p>
      )}

      {rules.map(rule => (
        <div
          key={rule.id}
          className="bg-slate-800 border border-slate-700 rounded-lg p-3 space-y-2"
        >
          {editId === rule.id ? (
            // ── Modo edição inline ──
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Palavra-chave</label>
                  <Input
                    value={editState.keyword}
                    onChange={e => setEditState(prev => ({ ...prev, keyword: e.target.value }))}
                    className="bg-slate-700 border-slate-600 text-white h-8 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs text-slate-400 mb-1 block">Tipo de match</label>
                  <select
                    value={editState.match_type}
                    onChange={e => setEditState(prev => ({ ...prev, match_type: e.target.value as MatchType }))}
                    className="w-full bg-slate-700 border border-slate-600 rounded-md px-2 h-8 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
                  >
                    {MATCH_OPTIONS.map(o => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="text-xs text-slate-400 mb-1 block">Resposta automática</label>
                <textarea
                  value={editState.response}
                  onChange={e => setEditState(prev => ({ ...prev, response: e.target.value }))}
                  rows={2}
                  className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
                />
              </div>
              <div className="flex items-center gap-2 justify-between">
                <div className="flex items-center gap-2">
                  <label className="text-xs text-slate-400">Prioridade</label>
                  <Input
                    type="number"
                    value={editState.priority}
                    onChange={e => setEditState(prev => ({ ...prev, priority: Number(e.target.value) }))}
                    className="bg-slate-700 border-slate-600 text-white h-7 w-20 text-sm"
                  />
                </div>
                <div className="flex gap-1">
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-green-400 hover:text-green-300"
                    onClick={() => saveEdit(rule.id)}
                    disabled={saving}
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-7 w-7 text-slate-400 hover:text-slate-200"
                    onClick={() => setEditId(null)}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          ) : (
            // ── Modo leitura ──
            <div className="flex items-start gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className="text-white text-sm font-medium truncate">{rule.keyword}</span>
                  <Badge className="bg-slate-600 text-slate-300 text-xs px-1.5 py-0">
                    {MATCH_LABELS[rule.match_type]}
                  </Badge>
                  {rule.priority > 0 && (
                    <Badge className="bg-orange-900/40 text-orange-300 text-xs px-1.5 py-0">
                      p{rule.priority}
                    </Badge>
                  )}
                </div>
                <p className="text-slate-400 text-xs line-clamp-2">{rule.response}</p>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Toggle ativo */}
                <button
                  onClick={() => toggleActive(rule)}
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${rule.is_active ? 'bg-green-500' : 'bg-slate-600'}`}
                  title={rule.is_active ? 'Ativo' : 'Inativo'}
                >
                  <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${rule.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
                </button>
                {/* Editar */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-slate-400 hover:text-white"
                  onClick={() => startEdit(rule)}
                >
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                {/* Deletar */}
                <Button
                  size="icon"
                  variant="ghost"
                  className="h-7 w-7 text-slate-400 hover:text-red-400"
                  onClick={() => deleteRule(rule.id)}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          )}
        </div>
      ))}

      {/* Formulário nova regra */}
      {showForm ? (
        <div className="bg-slate-800 border border-orange-500/30 rounded-lg p-4 space-y-3">
          <p className="text-white text-sm font-medium">Nova regra</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Palavra-chave *</label>
              <Input
                value={newRule.keyword}
                onChange={e => setNewRule(prev => ({ ...prev, keyword: e.target.value }))}
                placeholder="ex: orçamento"
                className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
              />
            </div>
            <div>
              <label className="text-xs text-slate-400 mb-1 block">Tipo de match</label>
              <select
                value={newRule.match_type}
                onChange={e => setNewRule(prev => ({ ...prev, match_type: e.target.value as MatchType }))}
                className="w-full bg-slate-700 border border-slate-600 rounded-md px-2 h-10 text-sm text-white focus:outline-none focus:ring-1 focus:ring-orange-500"
              >
                {MATCH_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-slate-400 mb-1 block">Resposta automática *</label>
            <textarea
              value={newRule.response}
              onChange={e => setNewRule(prev => ({ ...prev, response: e.target.value }))}
              rows={3}
              placeholder="Mensagem enviada automaticamente quando o contato usar esta palavra..."
              className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
            />
          </div>
          <div className="flex items-center gap-3 justify-between">
            <div className="flex items-center gap-2">
              <label className="text-xs text-slate-400">Prioridade</label>
              <Input
                type="number"
                min={0}
                value={newRule.priority}
                onChange={e => setNewRule(prev => ({ ...prev, priority: Number(e.target.value) }))}
                className="bg-slate-700 border-slate-600 text-white h-8 w-20 text-sm"
              />
            </div>
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => { setShowForm(false); setNewRule(emptyEdit()) }}
                className="text-slate-400 hover:text-slate-200"
              >
                Cancelar
              </Button>
              <Button
                size="sm"
                onClick={addRule}
                disabled={saving || !newRule.keyword.trim() || !newRule.response.trim()}
                className="bg-orange-600 hover:bg-orange-500 text-white"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Salvar'}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <Button
          onClick={() => setShowForm(true)}
          variant="outline"
          className="w-full border-dashed border-slate-600 text-slate-400 hover:text-white hover:border-slate-500 bg-transparent"
        >
          <Plus className="h-4 w-4 mr-2" />
          Adicionar regra
        </Button>
      )}
    </div>
  )
}
