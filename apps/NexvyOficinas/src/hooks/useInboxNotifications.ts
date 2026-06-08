import { useEffect } from 'react'
import { supabase } from '@/lib/supabase'

interface Params {
  /** ID da conversa atualmente aberta */
  conversationId: string | null
  /** Se false, o hook não emite som nem push */
  enabled: boolean
}

function playBeep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.frequency.value = 880
    gain.gain.value = 0.3
    osc.start()
    osc.stop(ctx.currentTime + 0.15)
    setTimeout(() => ctx.close(), 300)
  } catch {
    // bloqueado pelo browser — silenciar silenciosamente
  }
}

async function sendPushNotification(preview: string) {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    await Notification.requestPermission()
  }
  if (Notification.permission === 'granted') {
    new Notification('NexvyOficinas — Nova mensagem', {
      body: preview.slice(0, 100),
      icon: '/wrench.svg',
    })
  }
}

export function useInboxNotifications({ conversationId, enabled }: Params) {
  useEffect(() => {
    const channel = supabase
      .channel('inbox-notifications-global')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'inbox_messages',
        },
        (payload) => {
          if (!enabled) return

          const newMsg = payload.new as {
            conversation_id: string
            content: string | null
            sender_type: string
          }

          // Só notifica mensagens inbound (contact ou bot)
          if (newMsg.sender_type !== 'contact' && newMsg.sender_type !== 'bot') return

          // Notifica se a aba está oculta OU se é de outra conversa
          const shouldNotify = document.hidden || newMsg.conversation_id !== conversationId
          if (!shouldNotify) return

          const preview = newMsg.content ?? '📎 Mídia'
          playBeep()
          sendPushNotification(preview).catch(() => {})
        },
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [conversationId, enabled])
}
