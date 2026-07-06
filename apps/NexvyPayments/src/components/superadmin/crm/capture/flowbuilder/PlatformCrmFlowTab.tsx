import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowLeft, Loader2 } from 'lucide-react';
import { PlatformCrmFlowListManager } from './PlatformCrmFlowListManager';
import { PlatformCrmFlowBuilder } from './PlatformCrmFlowBuilder';
import { usePlatformCrmChatFlow } from '@/components/superadmin/crm/data/usePlatformCrmChatFlows';

/**
 * Aba do FlowBuilder do CRM de PLATAFORMA (super_admin) — DESACOPLADO do tenant.
 * Orquestra lista ↔ builder. Sem organization_id; `productId` é opcional (org-agnóstico).
 * Portado de src/components/admin/flowbuilder/FlowTab.tsx.
 */

interface PlatformCrmFlowTabProps {
  /** Filtra os fluxos por produto (opcional; ausente = todos). */
  productId?: string;
}

export function PlatformCrmFlowTab({ productId }: PlatformCrmFlowTabProps) {
  const [selectedFlowId, setSelectedFlowId] = useState<string | null>(null);
  const { data: selectedFlow, isLoading } = usePlatformCrmChatFlow(selectedFlowId || undefined);

  if (selectedFlowId) {
    if (isLoading) {
      return (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      );
    }

    if (!selectedFlow) {
      return (
        <div className="space-y-4">
          <Button variant="ghost" onClick={() => setSelectedFlowId(null)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Voltar para lista
          </Button>
          <div className="text-center text-muted-foreground py-8">
            Fluxo não encontrado
          </div>
        </div>
      );
    }

    return (
      <PlatformCrmFlowBuilder
        flow={selectedFlow}
        onBack={() => setSelectedFlowId(null)}
      />
    );
  }

  return (
    <PlatformCrmFlowListManager
      productId={productId}
      onSelectFlow={(flow) => setSelectedFlowId(flow.id)}
    />
  );
}
