import { useState, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

/** Tipos de mídia aceitos no inbox WhatsApp */
export type MediaType = 'image' | 'audio' | 'video' | 'document'

/** Metadados extraídos do arquivo + URL pública após upload */
export interface MediaUploadResult {
  url: string
  path: string
  metadata: {
    size: number
    mime: string
    name: string
    /** Duração em segundos (audio/video) */
    duration?: number
    /** Dimensões em px (image/video) */
    width?: number
    height?: number
  }
}

/** Estado do upload em andamento */
export interface UploadState {
  uploading: boolean
  progress: number  // 0-100
  error: string | null
}

const BUCKET = 'inbox-media'

/** WhatsApp size limits por tipo, em bytes. Acima disso o WhatsApp recusa. */
const SIZE_LIMITS: Record<MediaType, number> = {
  image: 5 * 1024 * 1024,        // 5 MB
  audio: 16 * 1024 * 1024,       // 16 MB
  video: 16 * 1024 * 1024,       // 16 MB
  document: 100 * 1024 * 1024,   // 100 MB
}

function extOf(name: string, fallback = 'bin'): string {
  const idx = name.lastIndexOf('.')
  return idx > 0 && idx < name.length - 1 ? name.slice(idx + 1).toLowerCase() : fallback
}

/** Lê dimensões de uma imagem (null se falhar) */
function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      resolve({ width: img.naturalWidth, height: img.naturalHeight })
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    img.src = url
  })
}

/** Lê duração de um áudio em segundos */
function readAudioDuration(file: File): Promise<number | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const audio = document.createElement('audio')
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve(isFinite(audio.duration) ? audio.duration : null)
    }
    audio.onerror = () => {
      URL.revokeObjectURL(url)
      resolve(null)
    }
    audio.src = url
  })
}

/** Lê duração + dimensões de um vídeo */
function readVideoMetadata(file: File): Promise<{ duration: number | null; width: number | null; height: number | null }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const video = document.createElement('video')
    video.preload = 'metadata'
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url)
      resolve({
        duration: isFinite(video.duration) ? video.duration : null,
        width: video.videoWidth || null,
        height: video.videoHeight || null,
      })
    }
    video.onerror = () => {
      URL.revokeObjectURL(url)
      resolve({ duration: null, width: null, height: null })
    }
    video.src = url
  })
}

/**
 * Hook de upload de mídia pro bucket inbox-media.
 *
 * Uso:
 *   const { upload, state, reset } = useMediaUpload()
 *   const result = await upload(file, conversationId, 'image')
 *   // result.url já está pública; passar pro evolution-send
 */
export function useMediaUpload() {
  const { empresaId } = useAuth()
  const [state, setState] = useState<UploadState>({ uploading: false, progress: 0, error: null })

  const reset = useCallback(() => {
    setState({ uploading: false, progress: 0, error: null })
  }, [])

  const upload = useCallback(
    async (file: File, conversationId: string, type: MediaType): Promise<MediaUploadResult> => {
      if (!empresaId) {
        const err = 'Empresa não identificada — faça login novamente.'
        setState({ uploading: false, progress: 0, error: err })
        throw new Error(err)
      }

      // Validação client-side (servidor também valida via bucket file_size_limit)
      const limit = SIZE_LIMITS[type]
      if (file.size > limit) {
        const mb = (limit / 1024 / 1024).toFixed(0)
        const err = `Arquivo grande demais. Limite para ${type}: ${mb} MB.`
        setState({ uploading: false, progress: 0, error: err })
        throw new Error(err)
      }

      setState({ uploading: true, progress: 0, error: null })

      // Extrai metadados em paralelo com upload (race-friendly)
      const metadataPromise = (async () => {
        if (type === 'image') {
          const dims = await readImageDimensions(file)
          return { width: dims?.width, height: dims?.height }
        }
        if (type === 'audio') {
          const duration = await readAudioDuration(file)
          return { duration: duration ?? undefined }
        }
        if (type === 'video') {
          const v = await readVideoMetadata(file)
          return {
            duration: v.duration ?? undefined,
            width: v.width ?? undefined,
            height: v.height ?? undefined,
          }
        }
        return {}
      })()

      // Path: empresa_id/conversation_id/<uuid>.<ext>  (RLS valida [1] = empresa_id)
      const uuid = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2))
      const ext = extOf(file.name, type === 'audio' ? 'ogg' : type === 'image' ? 'jpg' : 'bin')
      const path = `${empresaId}/${conversationId}/${uuid}.${ext}`

      try {
        const { error: uploadError } = await supabase.storage
          .from(BUCKET)
          .upload(path, file, {
            contentType: file.type || 'application/octet-stream',
            cacheControl: '31536000',
            upsert: false,
          })

        if (uploadError) {
          setState({ uploading: false, progress: 0, error: uploadError.message })
          throw uploadError
        }

        setState({ uploading: true, progress: 90, error: null })

        const { data: urlData } = supabase.storage.from(BUCKET).getPublicUrl(path)
        const extracted = await metadataPromise

        const result: MediaUploadResult = {
          url: urlData.publicUrl,
          path,
          metadata: {
            size: file.size,
            mime: file.type || 'application/octet-stream',
            name: file.name,
            ...extracted,
          },
        }

        setState({ uploading: false, progress: 100, error: null })
        return result
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha desconhecida no upload'
        setState({ uploading: false, progress: 0, error: msg })
        throw err
      }
    },
    [empresaId],
  )

  /** Remove arquivo do Storage (útil pra desfazer upload se envio do WhatsApp falhar) */
  const remove = useCallback(async (path: string): Promise<void> => {
    await supabase.storage.from(BUCKET).remove([path])
  }, [])

  return { upload, remove, reset, state }
}
