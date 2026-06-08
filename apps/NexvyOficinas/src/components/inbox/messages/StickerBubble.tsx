import { useEffect, useState } from 'react'
import { X } from 'lucide-react'

interface Props {
  url: string
  time: string
}

/** Sticker = PNG transparente, sem chrome de bubble. Click abre lightbox. */
export default function StickerBubble({ url, time }: Props) {
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
      <div className="flex flex-col gap-1">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Abrir sticker"
        >
          <img
            src={url}
            alt="sticker"
            loading="lazy"
            className="h-36 w-36 object-contain cursor-zoom-in"
          />
        </button>
        <span className="text-xs text-slate-500 text-right">{time}</span>
      </div>

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
          <img
            src={url}
            alt="sticker"
            className="max-w-xs max-h-full object-contain"
            onClick={e => e.stopPropagation()}
          />
        </div>
      )}
    </>
  )
}
