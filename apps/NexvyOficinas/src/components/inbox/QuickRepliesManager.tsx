import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { Pencil, Trash2, Plus, Check, X } from 'lucide-react'

interface QuickReply {
  id: string
  shortcut: string
  content: string
}

interface Props {
  empresaId: string
}

interface ToastItem {
  id: number
  message: string
  type: 'success' | 'error'
}

let toastCounter = 0

export default function QuickRepliesManager({ empresaId }: Props) {
  const [replies, setReplies] = useState<QuickReply[]>([])
  const [loading, setLoading] = useState(true)
  const [toasts, setToasts] = useState<ToastItem[]>([])

  // Formulário de criação/edição
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [formShortcut, setFormShortcut] = useState('')
  const [formContent, setFormContent] = useState('')
  const [saving, setSaving] = useState(false)

  // Confirmação de exclusão inline
  const [deletingId, setDeletingId] = useState<string | null>(null)

  function addToast(message: string, type: ToastItem['type'] = 'success') {
    const id = ++toastCounter
    setToasts(prev => [...prev, { id, message, type }])
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 3000)
  }

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('inbox_quick_replies')
      .select('id,shortcut,content')
      .eq('empresa_id', empresaId)
      .order('shortcut', { ascending: true })
    if (data) setReplies(data)
    setLoading(false)
  }, [empresaId])

  useEffect(() => {
    if (empresaId) load()
  }, [empresaId, load])

  function openCreate() {
    setEditingId(null)
    setFormShortcut('')
    setFormContent('')
    setShowForm(true)
  }

  function openEdit(reply: QuickReply) {
    setEditingId(reply.id)
    setFormShortcut(reply.shortcut)
    setFormContent(reply.content)
    setShowForm(true)
  }

  function cancelForm() {
    setShowForm(false)
    setEditingId(null)
    setFormShortcut('')
    setFormContent('')
  }

  async function handleSave() {
    if (!formShortcut.trim() || !formContent.trim()) return
    setSaving(true)
    try {
      // Validação de shortcut único (client-side)
      const isDuplicate = replies.some(
        r => r.shortcut.toLowerCase() === formShortcut.trim().toLowerCase() && r.id !== editingId
      )
      if (isDuplicate) {
        addToast(`Atalho "/${formShortcut}" já existe`, 'error')
        return
      }

      if (editingId) {
        const { error } = await supabase
          .from('inbox_quick_replies')
          .update({ shortcut: formShortcut.trim(), content: formContent.trim() })
          .eq('id', editingId)
        if (error) { addToast('Erro ao salvar', 'error'); return }
        addToast('Resposta rápida atualizada')
      } else {
        const { error } = await supabase
          .from('inbox_quick_replies')
          .insert({
            empresa_id: empresaId,
            shortcut: formShortcut.trim(),
            content: formContent.trim(),
            title: formShortcut.trim(),
            is_active: true,
          })
        if (error) { addToast('Erro ao criar', 'error'); return }
        addToast('Resposta rápida criada')
      }

      cancelForm()
      await load()
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete(id: string) {
    const { error } = await supabase
      .from('inbox_quick_replies')
      .delete()
      .eq('id', id)
    if (error) {
      addToast('Erro ao excluir', 'error')
    } else {
      addToast('Resposta rápida excluída')
      setDeletingId(null)
      await load()
    }
  }

  return (
    <div className="space-y-4 relative">
      {/* Header + botão Nova */}
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-400">
          Use{' '}
          <code className="bg-slate-800 px-1 rounded text-orange-400">/atalho</code>
          {' '}no compositor para inserir rapidamente
        </p>
        <button
          onClick={openCreate}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 text-white text-sm font-medium transition-colors"
        >
          <Plus className="h-3.5 w-3.5" />
          Nova
        </button>
      </div>

      {/* Formulário inline de criação/edição */}
      {showForm && (
        <div className="bg-slate-800 border border-slate-600 rounded-xl p-4 space-y-3">
          <p className="text-sm font-medium text-white">
            {editingId ? 'Editar resposta rápida' : 'Nova resposta rápida'}
          </p>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 text-sm">/</span>
            <input
              type="text"
              value={formShortcut}
              onChange={e => setFormShortcut(e.target.value.replace(/\s/g, '').slice(0, 20))}
              placeholder="atalho"
              maxLength={20}
              className="flex-1 bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500"
            />
          </div>
          <textarea
            value={formContent}
            onChange={e => setFormContent(e.target.value.slice(0, 500))}
            placeholder="Olá! Em que posso ajudar?"
            maxLength={500}
            rows={3}
            className="w-full bg-slate-700 border border-slate-600 rounded-lg px-3 py-1.5 text-sm text-white placeholder:text-slate-500 focus:outline-none focus:border-orange-500 resize-none"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-slate-500">{formContent.length}/500</span>
            <div className="flex gap-2">
              <button
                onClick={cancelForm}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-700 hover:bg-slate-600 text-sm text-slate-300 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Cancelar
              </button>
              <button
                onClick={handleSave}
                disabled={saving || !formShortcut.trim() || !formContent.trim()}
                className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 text-sm text-white font-medium transition-colors"
              >
                <Check className="h-3.5 w-3.5" />
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lista */}
      {loading ? (
        <p className="text-sm text-slate-500 text-center py-4">Carregando...</p>
      ) : replies.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-8">
          Nenhuma resposta rápida. Clique em &quot;Nova&quot; para criar.
        </p>
      ) : (
        <div className="space-y-2">
          {replies.map(reply => (
            <div
              key={reply.id}
              className="flex items-start gap-3 bg-slate-800 border border-slate-700 rounded-xl px-4 py-3"
            >
              <span className="shrink-0 mt-0.5 px-2 py-0.5 rounded-full bg-orange-600/20 text-orange-400 text-xs font-mono border border-orange-600/30">
                /{reply.shortcut}
              </span>
              <p className="flex-1 text-sm text-slate-300 min-w-0">
                {reply.content.length > 80 ? `${reply.content.slice(0, 80)}...` : reply.content}
              </p>
              <div className="flex gap-1 shrink-0">
                <button
                  onClick={() => openEdit(reply)}
                  className="p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
                  title="Editar"
                >
                  <Pencil className="h-3.5 w-3.5" />
                </button>
                {deletingId === reply.id ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-red-400">Excluir?</span>
                    <button
                      onClick={() => handleDelete(reply.id)}
                      className="p-1 rounded text-red-400 hover:text-red-300 hover:bg-red-900/20 transition-colors"
                      title="Confirmar exclusão"
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setDeletingId(null)}
                      className="p-1 rounded text-slate-400 hover:text-white transition-colors"
                      title="Cancelar"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setDeletingId(reply.id)}
                    className="p-1.5 rounded text-slate-400 hover:text-red-400 hover:bg-slate-700 transition-colors"
                    title="Excluir"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Toasts */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(t => (
          <div
            key={t.id}
            className={[
              'px-4 py-2 rounded-lg text-sm font-medium shadow-lg pointer-events-auto',
              t.type === 'success' ? 'bg-green-600 text-white' : 'bg-red-600 text-white',
            ].join(' ')}
          >
            {t.message}
          </div>
        ))}
      </div>
    </div>
  )
}
