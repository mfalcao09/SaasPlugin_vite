import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Plus, Pencil, Trash2, Loader2, Check, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

interface Template {
  id: string
  title: string
  content: string
  shortcut: string | null
  is_active: boolean
  created_at: string
}

interface Props {
  empresaId: string | null
}

const EMPTY_FORM = { title: '', content: '', shortcut: '' }

export default function MessageTemplatesManager({ empresaId }: Props) {
  const [templates, setTemplates] = useState<Template[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(EMPTY_FORM)
  const [searchQuery, setSearchQuery] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function loadTemplates() {
    if (!empresaId) return
    const { data } = await supabase
      .from('inbox_message_templates')
      .select('id,title,content,shortcut,is_active,created_at')
      .eq('empresa_id', empresaId)
      .order('title', { ascending: true })
    if (data) setTemplates(data as Template[])
    setLoading(false)
  }

  useEffect(() => {
    loadTemplates()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [empresaId])

  function openCreate() {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
    setShowForm(true)
  }

  function openEdit(t: Template) {
    setEditingId(t.id)
    setForm({ title: t.title, content: t.content, shortcut: t.shortcut ?? '' })
    setError(null)
    setShowForm(true)
  }

  function closeForm() {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
    setError(null)
  }

  async function handleSave() {
    if (!empresaId || !form.title.trim() || !form.content.trim()) return
    if (form.shortcut && !form.shortcut.startsWith('/')) {
      setError('O atalho deve começar com "/"')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const shortcut = form.shortcut.trim() || null
      if (editingId) {
        const { error: err } = await supabase
          .from('inbox_message_templates')
          .update({ title: form.title.trim(), content: form.content.trim(), shortcut })
          .eq('id', editingId)
        if (err) { setError(err.message); return }
      } else {
        const { error: err } = await supabase
          .from('inbox_message_templates')
          .insert({
            empresa_id: empresaId,
            title: form.title.trim(),
            content: form.content.trim(),
            shortcut,
            is_active: true,
          })
        if (err) { setError(err.message); return }
      }
      await loadTemplates()
      closeForm()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    if (!confirm('Excluir este template?')) return
    await supabase.from('inbox_message_templates').delete().eq('id', id)
    setTemplates(prev => prev.filter(t => t.id !== id))
  }

  async function toggleActive(t: Template) {
    const next = !t.is_active
    setTemplates(prev => prev.map(x => x.id === t.id ? { ...x, is_active: next } : x))
    await supabase
      .from('inbox_message_templates')
      .update({ is_active: next })
      .eq('id', t.id)
  }

  const filtered = templates.filter(t =>
    t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    (t.shortcut ?? '').toLowerCase().includes(searchQuery.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-5 w-5 animate-spin text-orange-400" />
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2">
        <Input
          value={searchQuery}
          onChange={e => setSearchQuery(e.target.value)}
          placeholder="Buscar por título ou atalho..."
          className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
        />
        <Button
          onClick={openCreate}
          className="bg-orange-600 hover:bg-orange-500 text-white shrink-0"
        >
          <Plus className="h-4 w-4 mr-1" />
          Novo
        </Button>
      </div>

      {/* Form inline */}
      {showForm && (
        <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 space-y-3">
          <h3 className="text-white font-medium text-sm">
            {editingId ? 'Editar Template' : 'Novo Template'}
          </h3>
          <Input
            value={form.title}
            onChange={e => setForm(prev => ({ ...prev, title: e.target.value }))}
            placeholder="Título (ex: Confirmação de Agendamento)"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
          />
          <textarea
            value={form.content}
            onChange={e => setForm(prev => ({ ...prev, content: e.target.value }))}
            placeholder="Conteúdo da mensagem..."
            rows={4}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:ring-1 focus:ring-orange-500 resize-none"
          />
          <Input
            value={form.shortcut}
            onChange={e => setForm(prev => ({ ...prev, shortcut: e.target.value }))}
            placeholder="Atalho opcional (ex: /confirmacao)"
            className="bg-slate-700 border-slate-600 text-white placeholder:text-slate-500"
          />
          {error && <p className="text-red-400 text-xs">{error}</p>}
          <div className="flex gap-2">
            <Button
              onClick={handleSave}
              disabled={saving || !form.title.trim() || !form.content.trim()}
              className="bg-orange-600 hover:bg-orange-500 text-white"
            >
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Check className="h-4 w-4 mr-1" />}
              Salvar
            </Button>
            <Button variant="ghost" onClick={closeForm} className="text-slate-400 hover:text-white">
              <X className="h-4 w-4 mr-1" />
              Cancelar
            </Button>
          </div>
        </div>
      )}

      {/* Empty state */}
      {filtered.length === 0 && (
        <p className="text-slate-500 text-sm text-center py-6">
          {searchQuery ? 'Nenhum template encontrado para esta busca.' : 'Nenhum template criado ainda.'}
        </p>
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.map(t => (
          <div
            key={t.id}
            className={[
              'flex items-start gap-3 p-3 rounded-lg border transition-opacity',
              t.is_active
                ? 'bg-slate-800 border-slate-700'
                : 'bg-slate-800/40 border-slate-700/40 opacity-60',
            ].join(' ')}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                <p className="text-white text-sm font-medium">{t.title}</p>
                {t.shortcut && (
                  <span className="text-xs bg-orange-600/20 text-orange-400 border border-orange-600/30 rounded px-1.5 py-0.5 font-mono shrink-0">
                    {t.shortcut}
                  </span>
                )}
              </div>
              <p className="text-slate-400 text-xs line-clamp-2">{t.content}</p>
            </div>

            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => toggleActive(t)}
                className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${t.is_active ? 'bg-orange-500' : 'bg-slate-600'}`}
                title={t.is_active ? 'Ativo — clique para desativar' : 'Inativo — clique para ativar'}
              >
                <span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${t.is_active ? 'translate-x-5' : 'translate-x-1'}`} />
              </button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-slate-400 hover:text-white"
                onClick={() => openEdit(t)}
                title="Editar"
              >
                <Pencil className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="icon"
                variant="ghost"
                className="h-7 w-7 text-slate-400 hover:text-red-400"
                onClick={() => handleDelete(t.id)}
                title="Excluir"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
