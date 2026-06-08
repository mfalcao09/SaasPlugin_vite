import { useEffect, useRef, useState } from 'react'
import { Mic, X, Send } from 'lucide-react'

interface Props {
  /** Chamado quando user clica enviar (arquivo .webm/.ogg gerado em memória) */
  onComplete: (file: File) => void
  /** Chamado quando user cancela (descarta gravação) */
  onCancel: () => void
}

/** MIME types testados em ordem de preferência — primeiro suportado vence */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/ogg;codecs=opus',
  'audio/ogg',
  'audio/mp4',
]

function pickSupportedMime(): string {
  if (typeof MediaRecorder === 'undefined') return ''
  for (const mime of MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(mime)) return mime
  }
  return ''
}

function formatTimer(ms: number): string {
  const totalSec = Math.floor(ms / 1000)
  const m = Math.floor(totalSec / 60)
  const s = totalSec % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

const MIN_DURATION_MS = 500

/**
 * Gravador de áudio inline. Solicita permissão de microfone,
 * grava com MediaRecorder, exibe timer mm:ss e botões cancelar/enviar.
 * Libera o microfone automaticamente ao desmontar.
 */
export default function AudioRecorder({ onComplete, onCancel }: Props) {
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const streamRef = useRef<MediaStream | null>(null)
  const startTimeRef = useRef<number>(0)
  const [elapsed, setElapsed] = useState(0)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    async function start() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        if (cancelled) {
          stream.getTracks().forEach(t => t.stop())
          return
        }
        streamRef.current = stream

        const mime = pickSupportedMime()
        const recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined)
        mediaRecorderRef.current = recorder

        recorder.ondataavailable = e => {
          if (e.data && e.data.size > 0) chunksRef.current.push(e.data)
        }

        recorder.start()
        startTimeRef.current = Date.now()
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Permissão de microfone negada'
        setError(msg)
      }
    }

    start()

    return () => {
      cancelled = true
      stopAndCleanup()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const interval = setInterval(() => {
      if (startTimeRef.current > 0) {
        setElapsed(Date.now() - startTimeRef.current)
      }
    }, 100)
    return () => clearInterval(interval)
  }, [])

  function stopAndCleanup(): Blob | null {
    const recorder = mediaRecorderRef.current
    if (recorder && recorder.state !== 'inactive') {
      try { recorder.stop() } catch { /* ignore */ }
    }
    const stream = streamRef.current
    if (stream) stream.getTracks().forEach(t => t.stop())
    streamRef.current = null
    mediaRecorderRef.current = null

    if (chunksRef.current.length === 0) return null
    const mime = recorder?.mimeType ?? 'audio/webm'
    return new Blob(chunksRef.current, { type: mime })
  }

  function handleCancel() {
    stopAndCleanup()
    chunksRef.current = []
    onCancel()
  }

  function handleSend() {
    if (elapsed < MIN_DURATION_MS) {
      setError(`Áudio muito curto (mín ${MIN_DURATION_MS}ms)`)
      return
    }
    const recorder = mediaRecorderRef.current
    const finalize = () => {
      const blob = stopAndCleanup()
      if (!blob || blob.size === 0) {
        setError('Falha ao capturar áudio')
        return
      }
      const ext = blob.type.includes('ogg') ? 'ogg' : 'webm'
      const file = new File([blob], `audio-${Date.now()}.${ext}`, { type: blob.type })
      onComplete(file)
    }
    if (recorder && recorder.state === 'recording') {
      recorder.onstop = finalize
      try { recorder.stop() } catch { finalize() }
    } else {
      finalize()
    }
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 bg-red-900/30 border border-red-700 rounded-lg text-red-200 text-sm">
        <span className="flex-1">{error}</span>
        <button
          onClick={onCancel}
          className="text-red-200 hover:text-white p-1 rounded"
          aria-label="Fechar"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex items-center gap-3 px-3 py-2 bg-slate-800 border border-slate-600 rounded-lg">
      <span className="relative flex h-2.5 w-2.5">
        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-500 opacity-75"></span>
        <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-600"></span>
      </span>
      <Mic className="h-4 w-4 text-red-400" />
      <span className="text-sm text-white font-mono tabular-nums flex-1">
        {formatTimer(elapsed)}
      </span>
      <button
        type="button"
        onClick={handleCancel}
        className="h-8 w-8 rounded-full bg-slate-700 hover:bg-slate-600 text-white flex items-center justify-center"
        aria-label="Cancelar gravação"
      >
        <X className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={handleSend}
        className="h-8 w-8 rounded-full bg-orange-600 hover:bg-orange-500 text-white flex items-center justify-center"
        aria-label="Enviar áudio"
      >
        <Send className="h-4 w-4" />
      </button>
    </div>
  )
}
