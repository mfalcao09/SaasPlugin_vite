import { SellerInbox } from '@/components/seller/SellerInbox';

interface Props {
  pendingConversationId?: string | null;
  onConversationSelected?: () => void;
  /** repassado ao SellerInbox p/ o cockpit ajustar a altura (cabeçalho extra) */
  heightClass?: string;
}

export function WebChatInbox({ pendingConversationId, onConversationSelected, heightClass }: Props) {
  return (
    <SellerInbox
      mode="admin"
      pendingConversationId={pendingConversationId ?? undefined}
      onConversationSelected={onConversationSelected}
      heightClass={heightClass}
    />
  );
}
