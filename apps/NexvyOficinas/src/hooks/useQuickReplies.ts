import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'

export interface QuickReply {
  id: string
  title: string
  content: string
  shortcut: string | null
}

export function useQuickReplies() {
  const { empresaId } = useAuth()
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([])

  useEffect(() => {
    if (!empresaId) return

    supabase
      .from('inbox_quick_replies')
      .select('id,title,content,shortcut')
      .eq('empresa_id', empresaId)
      .eq('is_active', true)
      .order('title', { ascending: true })
      .then(({ data }) => {
        if (data) setQuickReplies(data)
      })
  }, [empresaId])

  return quickReplies
}
