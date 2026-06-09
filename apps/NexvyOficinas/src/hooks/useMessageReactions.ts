import { useCallback, useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

interface RawReaction {
  id: string
  message_id: string
  user_id: string | null
  sender_type: string
  emoji: string
}

export interface ReactionSummary {
  emoji: string
  count: number
  /** True se o usuário autenticado atual já reagiu com este emoji */
  reactedByMe: boolean
}

interface Options {
  messageId: string
}

/**
 * Hook para gerenciar emoji reactions de uma mensagem.
 *
 * - Carrega reações iniciais do DB agrupadas por emoji
 * - Subscreve INSERT/DELETE em message_reactions via Realtime (filtro por message_id)
 * - addReaction(emoji): toggle — se já reagiu remove, se não adiciona
 * - removeReaction(emoji): remove reação do usuário autenticado
 */
export function useMessageReactions({ messageId }: Options) {
  const [reactions, setReactions] = useState<ReactionSummary[]>([])

  const loadAndSetReactions = useCallback(async () => {
    const [{ data: reactionsData }, { data: authData }] = await Promise.all([
      supabase
        .from('message_reactions')
        .select('id,message_id,user_id,sender_type,emoji')
        .eq('message_id', messageId),
      supabase.auth.getUser(),
    ])

    if (!reactionsData) return

    const currentUserId = authData?.user?.id ?? null

    // Agregar por emoji: contar total + verificar se usuário atual reagiu
    const map = new Map<string, { count: number; reactedByMe: boolean }>()
    for (const r of reactionsData as RawReaction[]) {
      const cur = map.get(r.emoji) ?? { count: 0, reactedByMe: false }
      cur.count++
      if (r.sender_type === 'agent' && r.user_id === currentUserId) {
        cur.reactedByMe = true
      }
      map.set(r.emoji, cur)
    }

    setReactions(
      Array.from(map.entries()).map(([emoji, { count, reactedByMe }]) => ({
        emoji,
        count,
        reactedByMe,
      })),
    )
  }, [messageId])

  useEffect(() => {
    if (!messageId) return

    loadAndSetReactions()

    const channel = supabase
      .channel(`reactions-${messageId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${messageId}`,
        },
        () => loadAndSetReactions(),
      )
      .on(
        'postgres_changes',
        {
          event: 'DELETE',
          schema: 'public',
          table: 'message_reactions',
          filter: `message_id=eq.${messageId}`,
        },
        () => loadAndSetReactions(),
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [messageId, loadAndSetReactions])

  async function addReaction(emoji: string) {
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) return

    // Toggle: se já reagiu com este emoji, remove
    const existing = reactions.find(r => r.emoji === emoji && r.reactedByMe)
    if (existing) {
      await removeReaction(emoji)
      return
    }

    await supabase
      .from('message_reactions')
      .upsert(
        { message_id: messageId, emoji, sender_type: 'agent', user_id: userId },
        { onConflict: 'message_id,user_id,sender_type', ignoreDuplicates: false },
      )
  }

  async function removeReaction(emoji: string) {
    const { data: authData } = await supabase.auth.getUser()
    const userId = authData?.user?.id
    if (!userId) return

    await supabase
      .from('message_reactions')
      .delete()
      .eq('message_id', messageId)
      .eq('user_id', userId)
      .eq('sender_type', 'agent')
      .eq('emoji', emoji)
  }

  return { reactions, addReaction, removeReaction }
}
