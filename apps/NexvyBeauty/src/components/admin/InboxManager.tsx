import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MessageSquare, BarChart3, LayoutGrid, Sparkles } from 'lucide-react';
import { WebChatInbox } from './webchat/WebChatInbox';
import { WebChatReportsTab } from './webchat/WebChatReportsTab';
import { AttendancePanel } from './webchat/AttendancePanel';
import { RadarPanel } from './radar/RadarPanel';
import { useMyPermissions } from '@/hooks/useUserPermissions';
import { useAuth } from '@/hooks/useAuth';

export function InboxManager() {
  const [activeTab, setActiveTab] = useState('inbox');
  const [pendingConversationId, setPendingConversationId] = useState<string | null>(null);
  const { data: perms } = useMyPermissions();
  const { isAdmin, isSuperAdmin } = useAuth();

  const adminLike = (isAdmin?.() ?? false) || (isSuperAdmin?.() ?? false);
  const canSeePanel =
    adminLike ||
    !!perms?.allow_inbox_panel ||
    !!perms?.view_other_users_conversations ||
    !!perms?.view_other_queues_conversations;

  const handleOpenConversation = (id: string) => {
    setPendingConversationId(id);
    setActiveTab('inbox');
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Atendimentos</h1>
        <p className="text-sm text-muted-foreground">Central de atendimentos — chat do site e WhatsApp</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="inline-flex">
          <TabsTrigger value="inbox" className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4" />
            <span>Inbox</span>
          </TabsTrigger>
          {canSeePanel && (
            <TabsTrigger value="panel" className="flex items-center gap-2">
              <LayoutGrid className="h-4 w-4" />
              <span>Painel</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="reports" className="flex items-center gap-2">
            <BarChart3 className="h-4 w-4" />
            <span>Relatórios</span>
          </TabsTrigger>
          {adminLike && (
            <TabsTrigger value="radar" className="flex items-center gap-2">
              <Sparkles className="h-4 w-4" />
              <span>Radar IA</span>
            </TabsTrigger>
          )}
        </TabsList>

        <TabsContent value="inbox" className="space-y-4">
          <WebChatInbox
            pendingConversationId={pendingConversationId}
            onConversationSelected={() => setPendingConversationId(null)}
          />
        </TabsContent>

        {canSeePanel && (
          <TabsContent value="panel" className="space-y-4">
            <AttendancePanel onOpenConversation={handleOpenConversation} />
          </TabsContent>
        )}

        <TabsContent value="reports" className="space-y-4">
          <WebChatReportsTab />
        </TabsContent>

        {adminLike && (
          <TabsContent value="radar" className="space-y-4">
            <RadarPanel onOpenConversation={handleOpenConversation} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
