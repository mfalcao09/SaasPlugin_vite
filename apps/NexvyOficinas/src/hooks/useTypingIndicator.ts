import { useCallback, useEffect, useRef, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { RealtimeChannel } from '@supabase/supabase-js'

interface Options {
  conversationId: string
}

interface TypingPayload {
  sender: 'contact' | 'agent'
  isTyping: boolean
}

/**
 * Hook para typing indicator via Supabase Realtime Broadcast.
 *
 * - Escuta broadcasts do canal `typing:{conversationId}` para detectar
 *   quando o contato está digitando (enviado pelo evolution-webhook).
 * - Expõe `emitTyping()` para o operador emitir seu próprio estado de digitação
 *   (usado pelo Composer no onChange com debounce interno de 2s).
 * - `isContactTyping` é auto-desativado 5s após o último broadcast recebido.
 *
 * NOTA: A Evolution API pode ou não enviar eventos de presença/typing. Se não
 * enviar, o indicador simplesmente nunca aparecerá — sem quebrar nada.
 */
export function useTypingIndicator({ conversationId }: Options) {
  const [isContactTyping, setIsContactTyping] = useState(false)
  const channelRef = useRef<RealtimeChannel | null>(null)
  // Timer de segurança: zera isContactTyping após 5s sem update
  const clearTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Debounce: não emitir "parou de digitar" a cada keystroke
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!conversationId) return

    const channel = supabase.channel(`typing:${conversationId}`)
    channelRef.current = channel

    channel
      .on('broadcast', { event: 'typing' }, ({ payload }: { payload: TypingPayload }) => {
        if (payload.sender !== 'contact') return

        setIsContactTyping(payload.isTyping)

        // Reinicia timer de segurança contra eventos "parou" não enviados
        if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
        if (payload.isTyping) {
          clearTimerRef.current = setTimeout(() => setIsContactTyping(false), 5000)
        }
      })
      .subscribe()

    return () => {
      if (clearTimerRef.current) clearTimeout(clearTimerRef.current)
      if (debounceRef.current) clearTimeout(debounceRef.current)
      supabase.removeChannel(channel)
      channelRef.current = null
    }
  }, [conversationId])

  /** Chamado pelo Composer ao digitar. Debounce 2s antes de emitir "parou". */
  const emitTyping = useCallback(() => {
    const channel = channelRef.current
    if (!channel) return

    channel.send({
      type: 'broadcast',
      event: 'typing',
      payload: { sender: 'agent', isTyping: true } satisfies TypingPayload,
    })

    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      channelRef.current?.send({
        type: 'broadcast',
        event: 'typing',
        payload: { sender: 'agent', isTyping: false } satisfies TypingPayload,
      })
    }, 2000)
  }, [])

  return { isContactTyping, emitTyping }
}
