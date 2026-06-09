// Sprint8 F5 — Sino de notificações com badge realtime
// Lê inbox_agent_notifications via subscribe + dropdown
// Tipos: new_conversation | transfer | mention | csat_received

import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/contexts/AuthContext'
import { Bell, Check, ArrowRightLeft, MessageSquarePlus, AtSign, Star } from 'lucide-react'

interface Notification {
  id: string
  type: 'new_conversation' | 'transfer' | 'mention' | 'csat_received'
  content: string
  conversation_id: string | null
  read_at: string | null
  created_at: string
}

const TYPE_ICON = {
  new_conversation: MessageSquarePlus,
  transfer: ArrowRightLeft,
  mention: AtSign,
  csat_received: Star,
} as const

const TYPE_COLOR = {
  new_conversation: 'text-blue-400',
  transfer: 'text-orange-400',
  mention: 'text-purple-400',
  csat_received: 'text-yellow-400',
} as const

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'agora'
  if (min < 60) return `${min}m`
  const h = Math.floor(min / 60)
  if (h < 24) return `${h}h`
  return `${Math.floor(h / 24)}d`
}

export default function NotificationBell() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const dropdownRef = useRef<HTMLDivElement | null>(null)

  async function load() {
    if (!user) return
    const { data } = await supabase
      .from('inbox_agent_notifications')
      .select('id,type,content,conversation_id,read_at,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20)
    if (data) {
      setItems(data as Notification[])
      setUnreadCount((data as Notification[]).filter(n => n.read_at === null).length)
    }
  }

  useEffect(() => {
    if (!user) return
    load()

    const channel = supabase
      .channel(`notifications-${user.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'inbox_agent_notifications',
          filter: `user_id=eq.${user.id}`,
        },
        () => load(),
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [user])

  useEffect(() => {
    if (!open) return
    function handleClick(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [open])

  async function handleClickItem(n: Notification) {
    if (n.read_at === null) {
      await supabase
        .from('inbox_agent_notifications')
        .update({ read_at: new Date().toISOString() })
        .eq('id', n.id)
    }
    setOpen(false)
    if (n.conversation_id) {
      navigate(`/inbox?conv=${n.conversation_id}`)
    }
  }

  async function markAllRead() {
    if (!user || unreadCount === 0) return
    await supabase
      .from('inbox_agent_notifications')
      .update({ read_at: new Date().toISOString() })
      .eq('user_id', user.id)
      .is('read_at', null)
  }

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setOpen(v => !v)}
        className="relative p-1.5 rounded text-slate-400 hover:text-white hover:bg-slate-700 transition-colors"
        aria-label="Notificações"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 && (
          <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 rounded-full bg-orange-600 text-[10px] text-white font-bold flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-2 w-80 bg-slate-800 border border-slate-700 rounded-xl shadow-2xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <p className="text-sm font-semibold text-white">Notificações</p>
            {unreadCount > 0 && (
              <button
                onClick={markAllRead}
                className="text-xs text-orange-400 hover:text-orange-300 flex items-center gap-1"
              >
                <Check className="h-3 w-3" />
                Marcar todas
              </button>
            )}
          </div>

          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 ? (
              <p className="text-xs text-slate-500 text-center py-8">Nenhuma notificação</p>
            ) : (
              items.map(n => {
                const Icon = TYPE_ICON[n.type]
                const iconColor = TYPE_COLOR[n.type]
                const isUnread = n.read_at === null
                return (
                  <button
                    key={n.id}
                    onClick={() => handleClickItem(n)}
                    className={[
                      'w-full flex items-start gap-3 px-4 py-3 text-left border-b border-slate-700/50 transition-colors',
                      isUnread ? 'bg-slate-700/30 hover:bg-slate-700/60' : 'hover:bg-slate-700/40',
                    ].join(' ')}
                  >
                    <div className={`shrink-0 mt-0.5 ${iconColor}`}>
                      <Icon className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs ${isUnread ? 'text-white font-medium' : 'text-slate-300'} line-clamp-2`}>
                        {n.content}
                      </p>
                      <p className="text-[10px] text-slate-500 mt-0.5">
                        {formatRelative(n.created_at)}
                      </p>
                    </div>
                    {isUnread && (
                      <span className="shrink-0 mt-1 h-2 w-2 rounded-full bg-orange-500" />
                    )}
                  </button>
                )
              })
            )}
          </div>
        </div>
      )}
    </div>
  )
}
