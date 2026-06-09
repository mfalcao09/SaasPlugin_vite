import { useState } from 'react'

interface Props {
  avatarUrl?: string | null
  name: string
  size?: 'sm' | 'md' | 'lg'
}

const SIZE_CLASSES = {
  sm: 'h-6 w-6 text-[10px]',
  md: 'h-8 w-8 text-xs',
  lg: 'h-9 w-9 text-sm',
} as const

/**
 * Avatar do contato: exibe foto do perfil ou inicial do nome como fallback.
 * Se a imagem falhar ao carregar, cai automaticamente para iniciais.
 */
export default function ContactAvatar({ avatarUrl, name, size = 'md' }: Props) {
  const [imgError, setImgError] = useState(false)
  const sizeClass = SIZE_CLASSES[size]
  const initial = name[0]?.toUpperCase() ?? '?'

  const showImg = !!avatarUrl && !imgError

  return (
    <div
      className={[
        sizeClass,
        'rounded-full overflow-hidden shrink-0 flex items-center justify-center bg-slate-700 font-bold text-slate-300',
      ].join(' ')}
    >
      {showImg ? (
        <img
          src={avatarUrl}
          alt={name}
          onError={() => setImgError(true)}
          className="rounded-full object-cover w-full h-full"
        />
      ) : (
        <span>{initial}</span>
      )}
    </div>
  )
}
