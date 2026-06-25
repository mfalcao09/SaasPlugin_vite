import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { WebChatInbox } from './webchat/WebChatInbox';

// Conversas — central de atendimento unificada (chat do site + WhatsApp).
// As abas Painel / Relatórios / Radar IA viraram páginas próprias na seção Comercial
// (Painel.tsx, RelatoriosComercial.tsx, RadarIA.tsx). Aqui fica só a Inbox.
export function InboxManager() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);

  // Abre a conversa vinda do Painel/Radar IA (eles navegam para /conversas?conv=<id>).
  useEffect(() => {
    const conv = searchParams.get('conv');
    if (conv) {
      setPendingConversationId(conv);
      searchParams.delete('conv');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Conversas</h1>
        <p className="text-sm text-muted-foreground">Central de Atendimento Unificada</p>
      </div>

      <WebChatInbox
        pendingConversationId={pendingConversationId}
        onConversationSelected={() => setPendingConversationId(null)}
      />
    </div>
  );
}
