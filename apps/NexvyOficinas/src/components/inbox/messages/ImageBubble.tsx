import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'

interface Props {
  url: string
  caption: string | null
}

export default function ImageBubble({ url, caption }: Props) {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    function onEsc(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open])

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block max-w-full"
        aria-label="Abrir imagem"
      >
        <img
          src={url}
          alt={caption ?? 'imagem'}
          loading="lazy"
          className="rounded-lg mb-1 max-w-full max-h-80 object-cover cursor-zoom-in"
        />
      </button>
      {caption && <p className="whitespace-pre-wrap break-words mt-1">{caption}</p>}

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
          onClick={() => setOpen(false)}
          role="dialog"
          aria-modal="true"
        >
          <button
            onClick={e => {
              e.stopPropagation()
              setOpen(false)
            }}
            className="absolute top-4 right-4 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>
          <a
            href={url}
            download
            onClick={e => e.stopPropagation()}
            className="absolute top-4 right-16 p-2 rounded-full bg-slate-800/80 text-white hover:bg-slate-700"
            aria-label="Baixar"
          >
            <Download className="h-5 w-5" />
          </a>
          <img
            src={url}
            alt={caption ?? 'imagem'}
            className="max-w-full max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
