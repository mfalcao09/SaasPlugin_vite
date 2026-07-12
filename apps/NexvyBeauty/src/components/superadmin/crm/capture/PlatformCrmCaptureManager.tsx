import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Filter as FunnelIcon, FileText, Code2, Megaphone } from 'lucide-react';
import { PlatformCrmCaptureFunnelsTab } from './PlatformCrmCaptureFunnelsTab';
import { PlatformCrmFormsManager } from './PlatformCrmFormsManager';
import { PlatformCrmCaptureWidgetsTab } from './PlatformCrmCaptureWidgetsTab';

/**
 * CRM de PLATAFORMA (super_admin) — CAPTAÇÃO (porte 1:1 CORE do CRM original).
 *
 * Abas: Funis (platform_crm_capture_funnels, multicanal chat/chatbot/quiz/widget) /
 * Formulários (platform_crm_forms + blocks/templates) / Widgets (platform_crm_webchat_widgets).
 *
 * Atende os menus de captação: v-formularios, v-quiz, v-chatbot, v-widget
 * (quiz e chatbot são funis com channel_type próprio — use initialTab='funnels'
 * + initialChannel='quiz'|'chatbot' ao fiar no registry).
 * v-templates / v-resultados / v-analytics: TODO(edge) — telas profundas do original.
 */

export type PlatformCrmCaptureTab = 'funnels' | 'forms' | 'widgets';

interface PlatformCrmCaptureManagerProps {
  /** Aba inicial (default: 'funnels'). */
  initialTab?: PlatformCrmCaptureTab;
  /** Pré-filtro de canal da aba Funis (ex.: 'quiz' | 'chatbot' | 'widget'). */
  initialChannel?: string;
}

export function PlatformCrmCaptureManager({
  initialTab = 'funnels',
  initialChannel,
}: PlatformCrmCaptureManagerProps) {
  const [tab, setTab] = useState<string>(initialTab);

  // L6: o platform-shell reusa esta instância ao trocar de menu de captação
  // (Formulários/Widgets/Funis/Quiz/Chatbot), então o `initialTab` muda mas o
  // useState não re-inicializa sozinho. Re-sincroniza a aba quando o menu muda;
  // a troca manual de aba pelo usuário é preservada (initialTab inalterado).
  useEffect(() => {
    setTab(initialTab);
  }, [initialTab]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <Megaphone className="h-6 w-6 text-primary" />
          Captação
        </h1>
        <p className="text-muted-foreground mt-1">
          Funis, formulários e widgets de captação de leads da plataforma.
        </p>
      </div>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="funnels" className="gap-2">
            <FunnelIcon className="h-4 w-4" />
            Funis
          </TabsTrigger>
          <TabsTrigger value="forms" className="gap-2">
            <FileText className="h-4 w-4" />
            Formulários
          </TabsTrigger>
          <TabsTrigger value="widgets" className="gap-2">
            <Code2 className="h-4 w-4" />
            Widgets
          </TabsTrigger>
        </TabsList>

        <TabsContent value="funnels" className="mt-6">
          <PlatformCrmCaptureFunnelsTab initialChannel={initialChannel} />
        </TabsContent>
        <TabsContent value="forms" className="mt-6">
          <PlatformCrmFormsManager />
        </TabsContent>
        <TabsContent value="widgets" className="mt-6">
          <PlatformCrmCaptureWidgetsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
