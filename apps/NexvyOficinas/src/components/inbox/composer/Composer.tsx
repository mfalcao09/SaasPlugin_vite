import { useRef, useState, useCallback, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Send, Paperclip, Mic, X, Loader2, Image as ImageIcon, Video, FileText, StickyNote, Sparkles, Clock } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMediaUpload, type MediaType } from '@/hooks/useMediaUpload'
import AudioRecorder from './AudioRecorder'
import { useQuickReplies } from '@/hooks/useQuickReplies'
import QuickReplyPicker from '@/components/inbox/QuickReplyPicker'
import ReplyPreviewBar from './ReplyPreviewBar'
import ScheduleMessageDialog from '../ScheduleMessageDialog'
import type { InboxMessage } from '../messages/MessageBubble'

interface MessageTemplate {
  id: string
  title: string
  content: string
  shortcut: string | null
  is_active: boolean
}

type ComposerMode = 'message' | 'note'

interface Props {
  conversationId: string
  disabled?: boolean
  placeholder?: string
  /** F2 — mensagem sendo citada */
  replyingTo?: InboxMessage | null
  /** F2 — callback para cancelar a citação */
  onCancelReply?: () => void
  /** Sprint4 F1 — callback chamado ao digitar (typing indicator) */
  onTyping?: () => void
}

interface PendingMedia {
  file: File
  type: MediaType
  previewUrl: string  // object URL para preview local
}

function inferType(file: File): MediaType {
  const m = file.type
  if (m.startsWith('image/')) return 'image'
  if (m.startsWith('video/')) return 'video'
  if (m.startsWith('audio/')) return 'audio'
  return 'document'
}

export default function Composer({ conversationId, disabled = false, placeholder, replyingTo, onCancelReply, onTyping }: Props) {
  const { empresaId } = useAuth()
  const [text, setText] = useState('')
  const [caption, setCaption] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [composerMode, setComposerMode] = useState<ComposerMode>('message')
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplyQuery, setQuickReplyQuery] = useState('')
  // Sprint6 F4 — AI Copilot
  const [suggestingCopilot, setSuggestingCopilot] = useState(false)
  // Sprint6 F5 — Mensagem agendada
  const [showScheduleDialog, setShowScheduleDialog] = useState(false)
  // Sprint8 F1 — Templates de resposta rápida
  const [showTemplatePopover, setShowTemplatePopover] = useState(false)
  const [templates, setTemplates] = useState<MessageTemplate[]>([])
  const [templateQuery, setTemplateQuery] = useState('')
  const { upload, state: uploadState } = useMediaUpload()
  const quickReplies = useQuickReplies()

  // Sprint8 F1 — carregar templates ativos da empresa
  useEffect(() => {
    if (!empresaId) return
    supabase
      .from('inbox_message_templates')
      .select('id,title,content,shortcut,is_active')
      .eq('empresa_id', empresaId)
      .eq('is_active', true)
      .order('title', { ascending: true })
      .then(({ data }) => {
        if (data) setTemplates(data as MessageTemplate[])
      })
  }, [empresaId])

  const imageInputRef = useRef<HTMLInputElement>(null)
  const videoInputRef = useRef<HTMLInputElement>(null)
  const documentInputRef = useRef<HTMLInputElement>(null)

  function clearPending() {
    if (pendingMedia) URL.revokeObjectURL(pendingMedia.previewUrl)
    setPendingMedia(null)
    setCaption('')
  }

  function handleFileSelected(file: File | undefined, forcedType?: MediaType) {
    if (!file) return
    setAttachMenuOpen(false)
    const type = forcedType ?? inferType(file)
    setPendingMedia({
      file,
      type,
      previewUrl: URL.createObjectURL(file),
    })
  }

  // Lida com mudanças no textarea — detecta "/" para quick replies/templates + emite typing indicator
  const handleTextChange = useCallback((value: string) => {
    setText(value)
    if (composerMode === 'message' && value.startsWith('/')) {
      setShowQuickReplies(true)
      setQuickReplyQuery(value.slice(1))   // tudo após "/"
      // Sprint8 F1 — também filtra templates pelo shortcut
      setTemplateQuery(value.slice(1))
    } else {
      setShowQuickReplies(false)
      setQuickReplyQuery('')
      setTemplateQuery('')
    }
    // Sprint4 F1 — typing indicator (só emite quando há texto e não está desabilitado)
    if (value.trim() && !disabled) onTyping?.()
  }, [composerMode, disabled, onTyping])

  function handleQuickReplySelect(content: string) {
    setText(content)
    setShowQuickReplies(false)
    setQuickReplyQuery('')
  }

  // Sprint8 F1 — selecionar template substitui conteúdo do textarea
  function handleTemplateSelect(content: string) {
    setText(content)
    setShowTemplatePopover(false)
    setShowQuickReplies(false)
    setTemplateQuery('')
  }

  // Sprint8 F1 — templates filtrados pelo shortcut/query atual (fuzzy match por shortcut)
  const filteredTemplates = templateQuery
    ? templates.filter(t =>
        (t.shortcut ?? '').toLowerCase().includes(templateQuery.toLowerCase()) ||
        t.title.toLowerCase().includes(templateQuery.toLowerCase())
      )
    : templates

  async function sendText() {
    if (!text.trim() || sending) return
    setSending(true)
    try {
      if (composerMode === 'note') {
        // Nota interna: INSERT direto no DB, sem chamar evolution-send
        await supabase.from('inbox_messages').insert({
          conversation_id: conversationId,
          direction: 'outbound',
          sender_type: 'agent',
          content: text.trim(),
          content_type: 'text',
          metadata: { is_internal: true },
          reply_to_message_id: replyingTo?.id ?? null,
        })
      } else {
        await supabase.functions.invoke('evolution-send', {
          body: {
            conversation_id: conversationId,
            type: 'text',
            content: text.trim(),
            reply_to_message_id: replyingTo?.id ?? null,
          },
        })
      }
      setText('')
      setShowQuickReplies(false)
      onCancelReply?.()
    } finally {
      setSending(false)
    }
  }

  async function sendMedia() {
    if (!pendingMedia || sending) return
    setSending(true)
    try {
      const result = await upload(pendingMedia.file, conversationId, pendingMedia.type)
      await supabase.functions.invoke('evolution-send', {
        body: {
          conversation_id: conversationId,
          type: pendingMedia.type,
          url: result.url,
          caption: caption.trim() || undefined,
          mime: result.metadata.mime,
          name: result.metadata.name,
          size: result.metadata.size,
          duration: result.metadata.duration,
          width: result.metadata.width,
          height: result.metadata.height,
        },
      })
      clearPending()
    } finally {
      setSending(false)
    }
  }

  async function sendAudio(file: File) {
    setRecording(false)
    setSending(true)
    try {
      const result = await upload(file, conversationId, 'audio')
      await supabase.functions.invoke('evolution-send', {
        body: {
          conversation_id: conversationId,
          type: 'audio',
          url: result.url,
          mime: result.metadata.mime,
          size: result.metadata.size,
          duration: result.metadata.duration,
        },
      })
    } finally {
      setSending(false)
    }
  }

  // Sprint6 F4 — AI Copilot: solicita sugestão de resposta e preenche o textarea
  async function handleCopilot() {
    if (suggestingCopilot || !empresaId) return
    setSuggestingCopilot(true)
    try {
      const { data, error } = await supabase.functions.invoke('inbox-copilot', {
        body: { conversation_id: conversationId, empresa_id: empresaId },
      })
      if (!error && data?.suggestion) {
        setText(data.suggestion as string)
        setShowQuickReplies(false)
      }
    } finally {
      setSuggestingCopilot(false)
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape' && showQuickReplies) {
      e.preventDefault()
      setShowQuickReplies(false)
      return
    }
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      if (pendingMedia) sendMedia()
      else sendText()
    }
  }

  // Modo: gravação de áudio
  if (recording) {
    return (
      <div className="px-4 py-3 bg-slate-900 border-t border-slate-700">
        <AudioRecorder onComplete={sendAudio} onCancel={() => setRecording(false)} />
      </div>
    )
  }

  // Modo: preview de mídia selecionada
  if (pendingMedia) {
    return (
      <div className="px-4 py-3 bg-slate-900 border-t border-slate-700 space-y-3">
        <div className="flex items-start gap-3 p-3 bg-slate-800 rounded-lg">
          <div className="h-16 w-16 rounded-lg overflow-hidden bg-slate-700 flex items-center justify-center shrink-0">
            {pendingMedia.type === 'image' && (
              <img src={pendingMedia.previewUrl} alt="preview" className="h-full w-full object-cover" />
            )}
            {pendingMedia.type === 'video' && (
              <video src={pendingMedia.previewUrl} className="h-full w-full object-cover" />
            )}
            {pendingMedia.type === 'document' && <FileText className="h-7 w-7 text-slate-400" />}
            {pendingMedia.type === 'audio' && <Mic className="h-7 w-7 text-slate-400" />}
          </div>

          <div className="flex-1 min-w-0">
            <p className="text-sm text-white truncate" title={pendingMedia.file.name}>
              {pendingMedia.file.name}
            </p>
            <p className="text-xs text-slate-400">
              {(pendingMedia.file.size / 1024 / 1024).toFixed(2)} MB · {pendingMedia.type}
            </p>
            {uploadState.uploading && (
              <p className="text-xs text-orange-400 mt-1">Enviando... {uploadState.progress}%</p>
            )}
            {uploadState.error && (
              <p className="text-xs text-red-400 mt-1">{uploadState.error}</p>
            )}
          </div>

          <button
            onClick={clearPending}
            disabled={sending}
            className="text-slate-400 hover:text-white p-1 rounded shrink-0 disabled:opacity-50"
            aria-label="Cancelar envio"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <Input
            value={caption}
            onChange={e => setCaption(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Adicionar legenda (opcional)"
            className="flex-1 bg-slate-800 border-slate-600 text-white placeholder:text-slate-500"
            disabled={sending}
          />
          <Button
            onClick={sendMedia}
            disabled={sending}
            size="icon"
            className="bg-orange-600 hover:bg-orange-500 text-white shrink-0"
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    )
  }

  // Modo normal
  const isNote = composerMode === 'note'
  return (
    <div className={[
      'bg-slate-900 border-t relative',
      isNote ? 'border-amber-700/60' : 'border-slate-700',
    ].join(' ')}>
      {/* F2 — Reply preview bar */}
      {replyingTo && onCancelReply && !disabled && (
        <ReplyPreviewBar replyingTo={replyingTo} onCancel={onCancelReply} />
      )}
      {/* Tabs: Mensagem | Nota Interna */}
      {!disabled && (
        <div className="flex border-b border-slate-700/60">
          <button
            onClick={() => { setComposerMode('message'); setShowQuickReplies(false) }}
            className={[
              'flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors',
              !isNote
                ? 'text-orange-400 border-b-2 border-orange-500 -mb-px'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            <Send className="h-3 w-3" />
            Mensagem
          </button>
          <button
            onClick={() => { setComposerMode('note'); setShowQuickReplies(false) }}
            className={[
              'flex items-center gap-1.5 px-4 py-1.5 text-xs font-medium transition-colors',
              isNote
                ? 'text-amber-400 border-b-2 border-amber-500 -mb-px'
                : 'text-slate-400 hover:text-slate-200',
            ].join(' ')}
          >
            <StickyNote className="h-3 w-3" />
            Nota Interna
          </button>
        </div>
      )}

      <div className="px-4 py-3 relative">
      {/* Attach menu popover */}
      {attachMenuOpen && (
        <div className="absolute bottom-full left-4 mb-2 bg-slate-800 border border-slate-600 rounded-lg shadow-xl p-2 grid grid-cols-3 gap-1 min-w-[220px]">
          <button
            onClick={() => imageInputRef.current?.click()}
            className="flex flex-col items-center gap-1 px-3 py-3 rounded hover:bg-slate-700 text-slate-200"
          >
            <ImageIcon className="h-5 w-5 text-blue-400" />
            <span className="text-xs">Imagem</span>
          </button>
          <button
            onClick={() => videoInputRef.current?.click()}
            className="flex flex-col items-center gap-1 px-3 py-3 rounded hover:bg-slate-700 text-slate-200"
          >
            <Video className="h-5 w-5 text-pink-400" />
            <span className="text-xs">Vídeo</span>
          </button>
          <button
            onClick={() => documentInputRef.current?.click()}
            className="flex flex-col items-center gap-1 px-3 py-3 rounded hover:bg-slate-700 text-slate-200"
          >
            <FileText className="h-5 w-5 text-orange-400" />
            <span className="text-xs">Documento</span>
          </button>
        </div>
      )}

      <input
        ref={imageInputRef} type="file" accept="image/*" className="hidden"
        onChange={e => handleFileSelected(e.target.files?.[0], 'image')}
      />
      <input
        ref={videoInputRef} type="file" accept="video/*" className="hidden"
        onChange={e => handleFileSelected(e.target.files?.[0], 'video')}
      />
      <input
        ref={documentInputRef} type="file"
        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.csv,.txt,.zip,.rar"
        className="hidden"
        onChange={e => handleFileSelected(e.target.files?.[0], 'document')}
      />

      {/* Quick Reply Picker — aparece quando texto começa com "/" */}
      {showQuickReplies && !disabled && (
        <QuickReplyPicker
          replies={quickReplies}
          query={quickReplyQuery}
          onSelect={handleQuickReplySelect}
          onClose={() => setShowQuickReplies(false)}
        />
      )}

      {/* Sprint8 F1 — Template Picker: auto-suggest por "/" + popover manual */}
      {(showTemplatePopover || (templateQuery && filteredTemplates.length > 0)) && !isNote && !disabled && (
        <div className="absolute bottom-full left-0 right-0 mb-1 bg-slate-800 border border-slate-600 rounded-lg shadow-xl overflow-hidden z-30 max-h-56 overflow-y-auto">
          <div className="flex items-center justify-between px-3 py-1.5 border-b border-slate-700">
            <span className="text-xs text-slate-400 font-medium">Templates de resposta</span>
            <button
              onClick={() => { setShowTemplatePopover(false); setTemplateQuery('') }}
              className="text-slate-500 hover:text-white"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
          {filteredTemplates.length === 0 ? (
            <p className="text-slate-500 text-xs px-3 py-2">Nenhum template encontrado.</p>
          ) : (
            filteredTemplates.map(t => (
              <button
                key={t.id}
                onClick={() => handleTemplateSelect(t.content)}
                className="w-full flex items-start gap-2 px-3 py-2 hover:bg-slate-700 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-white text-xs font-medium">{t.title}</span>
                    {t.shortcut && (
                      <span className="text-[10px] font-mono text-orange-400">{t.shortcut}</span>
                    )}
                  </div>
                  <p className="text-slate-400 text-xs truncate">{t.content}</p>
                </div>
              </button>
            ))
          )}
        </div>
      )}

      <div className="flex items-center gap-2">
        {/* Botão de anexo: só no modo mensagem */}
        {!isNote && (
          <Button
            type="button"
            onClick={() => setAttachMenuOpen(prev => !prev)}
            disabled={disabled || sending}
            size="icon"
            variant="ghost"
            className="text-slate-400 hover:text-white shrink-0"
            aria-label="Anexar arquivo"
          >
            <Paperclip className="h-4 w-4" />
          </Button>
        )}

        <Input
          value={text}
          onChange={e => handleTextChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={
            disabled
              ? (placeholder ?? 'Conversa encerrada')
              : isNote
                ? 'Escreva uma nota interna... (visível apenas para operadores)'
                : 'Digite uma mensagem... (Enter para enviar)'
          }
          className={[
            'flex-1 border text-white placeholder:text-slate-500',
            isNote
              ? 'bg-amber-950/30 border-amber-700/50 focus-visible:ring-amber-600/50'
              : 'bg-slate-800 border-slate-600',
          ].join(' ')}
          disabled={disabled || sending}
        />

        {/* Sprint6 F4 — AI Copilot (só no modo mensagem, não fechada) */}
        {!isNote && !disabled && (
          <Button
            type="button"
            onClick={handleCopilot}
            disabled={suggestingCopilot || sending}
            size="icon"
            variant="ghost"
            className="text-slate-400 hover:text-orange-400 shrink-0 transition-colors"
            aria-label="Sugestão de resposta (AI Copilot)"
            title="Sugestão de resposta com IA"
          >
            {suggestingCopilot
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : <Sparkles className="h-4 w-4" />
            }
          </Button>
        )}

        {/* Sprint8 F1 — Botão de templates (só no modo mensagem, não fechada) */}
        {!isNote && !disabled && (
          <Button
            type="button"
            onClick={() => setShowTemplatePopover(prev => !prev)}
            disabled={sending}
            size="icon"
            variant="ghost"
            className={`shrink-0 transition-colors ${showTemplatePopover ? 'text-orange-400' : 'text-slate-400 hover:text-orange-400'}`}
            aria-label="Templates de resposta"
            title="Templates de resposta"
          >
            <FileText className="h-4 w-4" />
          </Button>
        )}

        {/* Sprint6 F5 — Agendar mensagem (só no modo mensagem, não fechada) */}
        {!isNote && !disabled && (
          <Button
            type="button"
            onClick={() => setShowScheduleDialog(true)}
            disabled={sending}
            size="icon"
            variant="ghost"
            className="text-slate-400 hover:text-orange-400 shrink-0 transition-colors"
            aria-label="Agendar mensagem"
            title="Agendar mensagem"
          >
            <Clock className="h-4 w-4" />
          </Button>
        )}

        {text.trim() ? (
          <Button
            onClick={sendText}
            disabled={sending || disabled}
            size="icon"
            className={[
              'text-white shrink-0',
              isNote
                ? 'bg-amber-600 hover:bg-amber-500'
                : 'bg-orange-600 hover:bg-orange-500',
            ].join(' ')}
          >
            {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </Button>
        ) : !isNote ? (
          <Button
            type="button"
            onClick={() => setRecording(true)}
            disabled={disabled || sending}
            size="icon"
            className="bg-orange-600 hover:bg-orange-500 text-white shrink-0"
            aria-label="Gravar áudio"
          >
            <Mic className="h-4 w-4" />
          </Button>
        ) : null}
      </div>
      </div>

      {/* Sprint6 F5 — ScheduleMessageDialog */}
      {showScheduleDialog && (
        <ScheduleMessageDialog
          conversationId={conversationId}
          onClose={() => setShowScheduleDialog(false)}
        />
      )}
    </div>
  )
}
