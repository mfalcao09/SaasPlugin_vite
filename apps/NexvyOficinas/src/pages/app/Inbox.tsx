import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Settings, MessageCircle } from 'lucide-react'
import ConversationList from '@/components/inbox/ConversationList'
import ChatArea from '@/components/inbox/ChatArea'
import EvolutionSettings from '@/components/inbox/EvolutionSettings'
import { useIsMobile } from '@/hooks/useIsMobile'

type View = 'inbox' | 'settings'
/** Mobile: qual painel está visível */
type MobilePane = 'list' | 'chat'

export default function Inbox() {
  const { conversationId } = useParams<{ conversationId?: string }>()
  const navigate   = useNavigate()
  const isMobile   = useIsMobile()

  const [selectedId,  setSelectedId]  = useState<string | null>(conversationId ?? null)
  const [view,        setView]        = useState<View>('inbox')
  const [mobilePane, setMobilePane]   = useState<MobilePane>(conversationId ? 'chat' : 'list')

  // Sincroniza state com URL param (deep-link, back/forward do browser)
  useEffect(() => {
    setSelectedId(conversationId ?? null)
    if (isMobile) {
      setMobilePane(conversationId ? 'chat' : 'list')
    }
  }, [conversationId, isMobile])

  function handleSelect(id: string) {
    setSelectedId(id)
    setView('inbox')
    navigate(`/inbox/${id}`, { replace: false })
    if (isMobile) setMobilePane('chat')
  }

  function handleBack() {
    setMobilePane('list')
    navigate('/inbox', { replace: false })
  }

  // Em mobile: mostra apenas um painel de cada vez
  const showLeft  = !isMobile || mobilePane === 'list'
  const showRight = !isMobile || mobilePane === 'chat'

  return (
    <div className="flex h-full bg-slate-950 overflow-hidden">
      {/* Left panel — conversation list / settings */}
      {showLeft && (
        <div className={`${isMobile ? 'w-full' : 'w-80'} shrink-0 flex flex-col h-full border-r border-slate-700`}>
          <div className="flex border-b border-slate-700 bg-slate-900">
            <button
              onClick={() => setView('inbox')}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                view === 'inbox'
                  ? 'text-orange-400 border-b-2 border-orange-400'
                  : 'text-slate-400 hover:text-white',
              ].join(' ')}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Conversas
            </button>
            <button
              onClick={() => setView('settings')}
              className={[
                'flex-1 flex items-center justify-center gap-1.5 py-2 text-xs font-medium transition-colors',
                view === 'settings'
                  ? 'text-orange-400 border-b-2 border-orange-400'
                  : 'text-slate-400 hover:text-white',
              ].join(' ')}
            >
              <Settings className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          </div>

          <div className="flex-1 overflow-hidden">
            {view === 'inbox' ? (
              <ConversationList selectedId={selectedId} onSelect={handleSelect} />
            ) : (
              <EvolutionSettings />
            )}
          </div>
        </div>
      )}

      {/* Right panel — chat area or empty state */}
      {showRight && (
        <div className={`${isMobile ? 'w-full' : ''} flex-1 min-w-0 h-full`}>
          {selectedId && view === 'inbox' ? (
            <ChatArea
              conversationId={selectedId}
              onBack={isMobile ? handleBack : undefined}
              onSelectConversation={handleSelect}
            />
          ) : (
            <div className="flex flex-col items-center justify-center h-full gap-3 text-slate-500">
              <MessageCircle className="h-14 w-14 opacity-20" />
              <p className="text-sm">Selecione uma conversa para começar</p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
