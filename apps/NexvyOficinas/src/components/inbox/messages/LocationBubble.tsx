import { MapPin } from 'lucide-react'

interface Props {
  lat: number
  lng: number
  name?: string
  time: string
  isOutbound: boolean
}

export default function LocationBubble({ lat, lng, name, time, isOutbound }: Props) {
  const mapsUrl = `https://maps.google.com/?q=${lat},${lng}`

  return (
    <div className="flex flex-col gap-1" style={{ width: '200px' }}>
      <a
        href={mapsUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-2 rounded-xl px-3 bg-slate-700 transition-opacity hover:opacity-90"
        style={{ minHeight: '80px' }}
        aria-label="Abrir localização no Google Maps"
      >
        {/* Fallback sem API key — pin emoji + coordenadas */}
        <MapPin className="h-6 w-6 text-red-400 shrink-0" />
        <div className="flex-1 min-w-0 py-3">
          {name && (
            <p className="text-sm font-medium text-white truncate">{name}</p>
          )}
          <p className="text-xs text-slate-400 tabular-nums">
            {lat.toFixed(5)}, {lng.toFixed(5)}
          </p>
          <p className="text-xs text-blue-400 mt-0.5">Abrir no Maps →</p>
        </div>
      </a>
      <p className={`text-xs self-end ${isOutbound ? 'text-orange-200' : 'text-slate-500'}`}>
        {time}
      </p>
    </div>
  )
}
