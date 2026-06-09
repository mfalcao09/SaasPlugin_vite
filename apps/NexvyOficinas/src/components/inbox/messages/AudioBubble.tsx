import { useEffect, useRef, useState } from 'react'
import { Play, Pause, FileText, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'

interface Props {
  url: string
  duration?: number
  isOutbound: boolean
  /** Sprint6 F3 — para transcrição de áudio */
  messageId?: string
  storageUrl?: string | null
  transcript?: string | null
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function AudioBubble({ url, duration, isOutbound, messageId, storageUrl, transcript: initialTranscript }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState<number>(duration ?? 0)
  // Sprint6 F3 — transcrição
  const [transcribing, setTranscribing] = useState(false)
  const [transcriptText, setTranscriptText] = useState<string | null>(initialTranscript ?? null)

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)
    const onTime = () => setCurrentTime(audio.currentTime)
    const onMeta = () => {
      if (isFinite(audio.duration)) setTotalDuration(audio.duration)
    }
    const onEnd = () => {
      setPlaying(false)
      setCurrentTime(0)
    }

    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)

    return () => {
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
    }
  }, [])

  function toggle() {
    const audio = audioRef.current
    if (!audio) return
    if (playing) audio.pause()
    else audio.play().catch(() => setPlaying(false))
  }

  function seek(e: React.ChangeEvent<HTMLInputElement>) {
    const audio = audioRef.current
    if (!audio) return
    audio.currentTime = Number(e.target.value)
  }

  // Sprint6 F3 — chama edge function transcribe-audio
  async function handleTranscribe() {
    if (!messageId || !storageUrl || transcribing) return
    setTranscribing(true)
    try {
      const { data, error } = await supabase.functions.invoke('transcribe-audio', {
        body: { storage_url: storageUrl, message_id: messageId },
      })
      if (!error && data?.transcript) {
        setTranscriptText(data.transcript as string)
      }
    } finally {
      setTranscribing(false)
    }
  }

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0
  const buttonBg = isOutbound ? 'bg-orange-500 hover:bg-orange-400' : 'bg-slate-700 hover:bg-slate-600'
  const canTranscribe = !!storageUrl && !!messageId

  return (
    <div className="flex flex-col gap-1.5 min-w-[200px]">
      <div className="flex items-center gap-2">
        <audio ref={audioRef} src={url} preload="metadata" />
        <button
          type="button"
          onClick={toggle}
          className={`h-8 w-8 rounded-full ${buttonBg} text-white flex items-center justify-center shrink-0`}
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
        >
          {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5 ml-0.5" />}
        </button>
        <div className="flex-1 flex flex-col gap-1">
          <input
            type="range"
            min={0}
            max={totalDuration || 100}
            value={currentTime}
            onChange={seek}
            step={0.1}
            className="w-full h-1 accent-current cursor-pointer"
            aria-label="Posição do áudio"
            style={{ background: `linear-gradient(to right, currentColor ${progress}%, rgba(255,255,255,0.2) ${progress}%)` }}
          />
          <span className="text-xs opacity-70 tabular-nums">
            {formatDuration(currentTime)} / {formatDuration(totalDuration)}
          </span>
        </div>
      </div>

      {/* Sprint6 F3 — Botão transcrição (só quando storage_url disponível) */}
      {canTranscribe && !transcriptText && (
        <button
          type="button"
          onClick={handleTranscribe}
          disabled={transcribing}
          className={`flex items-center gap-1 text-[10px] px-2 py-0.5 rounded transition-colors self-start ${
            isOutbound
              ? 'text-orange-200 hover:text-white disabled:opacity-50'
              : 'text-slate-400 hover:text-slate-200 disabled:opacity-50'
          }`}
          title="Transcrever áudio"
        >
          {transcribing
            ? <><Loader2 className="h-3 w-3 animate-spin" /> Transcrevendo...</>
            : <><FileText className="h-3 w-3" /> Transcrever</>
          }
        </button>
      )}

      {/* Sprint6 F3 — Texto da transcrição */}
      {transcriptText && (
        <p className="text-xs text-slate-400 italic mt-0.5 max-w-[240px] break-words">
          {transcriptText}
        </p>
      )}
    </div>
  )
}
