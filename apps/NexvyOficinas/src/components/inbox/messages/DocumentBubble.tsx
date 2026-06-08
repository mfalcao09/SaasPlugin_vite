import { FileText, FileSpreadsheet, FileImage, FileVideo, FileAudio, FileArchive, Download } from 'lucide-react'

interface Props {
  url: string
  name?: string
  size?: number
  mime?: string
  isOutbound: boolean
}

function formatSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function pickIcon(mime?: string, name?: string) {
  const m = (mime ?? '').toLowerCase()
  const n = (name ?? '').toLowerCase()
  if (m.includes('spreadsheet') || n.endsWith('.xlsx') || n.endsWith('.xls') || n.endsWith('.csv')) return FileSpreadsheet
  if (m.startsWith('image')) return FileImage
  if (m.startsWith('video')) return FileVideo
  if (m.startsWith('audio')) return FileAudio
  if (m.includes('zip') || m.includes('rar') || n.endsWith('.zip') || n.endsWith('.rar')) return FileArchive
  return FileText
}

export default function DocumentBubble({ url, name, size, mime, isOutbound }: Props) {
  const Icon = pickIcon(mime, name)
  const display = name ?? 'Documento'
  const sizeText = formatSize(size)
  const iconBg = isOutbound ? 'bg-orange-500/30' : 'bg-slate-700'

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      download={name}
      className="flex items-center gap-2.5 min-w-[200px] py-1 hover:opacity-90"
    >
      <div className={`h-10 w-10 rounded-lg ${iconBg} flex items-center justify-center shrink-0`}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate" title={display}>{display}</p>
        {sizeText && <p className="text-xs opacity-70">{sizeText}</p>}
      </div>
      <Download className="h-4 w-4 opacity-70 shrink-0" />
    </a>
  )
}
