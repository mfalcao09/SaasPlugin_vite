import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

interface Props {
  url: string
  duration?: number
  isOutbound: boolean
}

function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function AudioBubble({ url, duration, isOutbound }: Props) {
  const audioRef = useRef<HTMLAudioElement>(null)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [totalDuration, setTotalDuration] = useState<number>(duration ?? 0)

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

  const progress = totalDuration > 0 ? (currentTime / totalDuration) * 100 : 0
  const buttonBg = isOutbound ? 'bg-orange-500 hover:bg-orange-400' : 'bg-slate-700 hover:bg-slate-600'

  return (
    <div className="flex items-center gap-2 min-w-[200px]">
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
  )
}
