import { useRef, useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { Send, Paperclip, Mic, X, Loader2, Image as ImageIcon, Video, FileText, StickyNote } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { useMediaUpload, type MediaType } from '@/hooks/useMediaUpload'
import AudioRecorder from './AudioRecorder'
import { useQuickReplies } from '@/hooks/useQuickReplies'
import QuickReplyPicker from '@/components/inbox/QuickReplyPicker'
import ReplyPreviewBar from './ReplyPreviewBar'
import type { InboxMessage } from '../messages/MessageBubble'

type ComposerMode = 'message' | 'note'

interface Props {
  conversationId: string
  disabled?: boolean
  placeholder?: string
  /** F2 — mensagem sendo citada */
  replyingTo?: InboxMessage | null
  /** F2 — callback para cancelar a citação */
  onCancelReply?: () => void
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

export default function Composer({ conversationId, disabled = false, placeholder, replyingTo, onCancelReply }: Props) {
  const [text, setText] = useState('')
  const [caption, setCaption] = useState('')
  const [sending, setSending] = useState(false)
  const [recording, setRecording] = useState(false)
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [pendingMedia, setPendingMedia] = useState<PendingMedia | null>(null)
  const [composerMode, setComposerMode] = useState<ComposerMode>('message')
  const [showQuickReplies, setShowQuickReplies] = useState(false)
  const [quickReplyQuery, setQuickReplyQuery] = useState('')
  const { upload, state: uploadState } = useMediaUpload()
  const quickReplies = useQuickReplies()
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

  // Lida com mudanças no textarea — detecta "/" para quick replies
  const handleTextChange = useCallback((value: string) => {
    setText(value)
    if (composerMode === 'message' && value.startsWith('/')) {
      setShowQuickReplies(true)
      setQuickReplyQuery(value.slice(1))   // tudo após "/"
    } else {
      setShowQuickReplies(false)
      setQuickReplyQuery('')
    }
  }, [composerMode])

  function handleQuickReplySelect(content: string) {
    setText(content)
    setShowQuickReplies(false)
    setQuickReplyQuery('')
  }

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
    </div>
  )
}
