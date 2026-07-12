// Porte de `.vendus-src-reference/src/components/admin/products/tabs/CadenceTab.tsx` (wrapper).
// ⚠️ Adaptação de schema declarada: a fonte editava `cadence_templates` (day_number +
// blocks Json — modelo CadenceEditor). O port já tem outro motor de cadência
// (platform_crm_cadences + cadence_steps + enrollments, com product_id da Fase 0).
// Fidelidade de INTENÇÃO: esta aba mostra as cadências DESTE produto; a edição
// profunda vive na seção Cadências do CRM (PlatformCrmCadencesManager, onda própria)
// — religada aqui (2026-07-11) via modal escopado ao produto (productId/cadenceId).
import { useState } from 'react';
import { usePlatformCrmProduct } from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Tables } from '@/integrations/supabase/types';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Calendar, Loader2, Plus, ArrowUpRight, Bot, Mail, MessageCircle } from 'lucide-react';
import { PlatformCrmCadencesManager } from '@/components/superadmin/crm/cadences/PlatformCrmCadencesManager';

interface CadenceTabProps {
  productId: string;
}

type PlatformCadence = Tables<'platform_crm_cadences'>;

const statusStyles: Record<string, string> = {
  active: 'bg-success/10 text-success',
  paused: 'bg-warning/10 text-warning',
  draft: 'bg-muted text-muted-foreground',
  archived: 'bg-muted text-muted-foreground',
};

const channelIcons: Record<string, any> = {
  whatsapp: MessageCircle,
  email: Mail,
  ai: Bot,
};

export function CadenceTab({ productId }: CadenceTabProps) {
  const { data: product } = usePlatformCrmProduct(productId);
  const [cadenceModal, setCadenceModal] = useState<{ open: boolean; cadenceId?: string }>({ open: false });

  const { data: cadences, isLoading: cadenceLoading } = useQuery({
    queryKey: ['platform-crm', 'product-cadences', productId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_cadences')
        .select('*')
        .eq('product_id', productId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as PlatformCadence[];
    },
    enabled: !!productId,
  });

  if (cadenceLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const productCadences = cadences || [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Calendar className="h-5 w-5 text-primary" />
            Cadências de {product?.name || 'Produto'}
          </h2>
          <p className="text-sm text-muted-foreground">
            Sequências de follow-up automático dos leads deste produto
          </p>
        </div>
        <Button onClick={() => setCadenceModal({ open: true })}>
          <Plus className="mr-2 h-4 w-4" />
          Nova Cadência
        </Button>
      </div>

      {productCadences.length === 0 ? (
        <Card className="bg-card border-dashed">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Calendar className="h-12 w-12 text-muted-foreground/50 mb-4" />
            <h3 className="text-lg font-medium text-foreground mb-1">Nenhuma cadência para este produto</h3>
            <p className="text-sm text-muted-foreground mb-4 text-center max-w-sm">
              Crie sequências de mensagens (D1, D3, D7...) para nutrir e reativar leads automaticamente.
            </p>
            <Button variant="outline" onClick={() => setCadenceModal({ open: true })}>
              <Plus className="mr-2 h-4 w-4" />
              Criar Primeira Cadência
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {productCadences.map((cadence) => {
            const ChannelIcon = channelIcons[cadence.channel || ''] || MessageCircle;
            return (
              <Card key={cadence.id} className="bg-card hover:border-primary/40 transition-colors">
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <CardTitle className="text-base flex items-center gap-2">
                        <ChannelIcon className="h-4 w-4 text-primary" />
                        {cadence.name}
                        <Badge
                          variant="outline"
                          className={statusStyles[cadence.status || 'draft'] || statusStyles.draft}
                        >
                          {cadence.status || 'draft'}
                        </Badge>
                      </CardTitle>
                      {cadence.objective && (
                        <CardDescription className="mt-1">{cadence.objective}</CardDescription>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="gap-1 shrink-0"
                      onClick={() => setCadenceModal({ open: true, cadenceId: cadence.id })}
                    >
                      Abrir <ArrowUpRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </CardHeader>
                {cadence.description && (
                  <CardContent className="pt-0">
                    <p className="text-sm text-muted-foreground line-clamp-2">{cadence.description}</p>
                  </CardContent>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {/* Nota de arquitetura (visível): edição profunda na seção dedicada */}
      <p className="text-xs text-muted-foreground">
        A edição de etapas, gatilhos e janelas de execução acontece na seção <strong>Cadências</strong> do CRM.
      </p>

      {/* Modal escopado ao produto — reusa o manager da seção Cadências (CRUD real). */}
      <Dialog open={cadenceModal.open} onOpenChange={(open) => setCadenceModal((prev) => ({ ...prev, open }))}>
        <DialogContent className="max-w-[95vw] w-[95vw] h-[92vh] max-h-[92vh] flex flex-col p-0 gap-0 overflow-hidden">
          <DialogHeader className="px-6 py-4 border-b">
            <DialogTitle>Cadências de {product?.name || 'Produto'}</DialogTitle>
            <DialogDescription>
              {cadenceModal.cadenceId
                ? 'Editar a cadência selecionada.'
                : 'Criar e gerenciar cadências deste produto.'}
            </DialogDescription>
          </DialogHeader>
          <div className="flex-1 overflow-y-auto">
            {cadenceModal.open && (
              <PlatformCrmCadencesManager productId={productId} cadenceId={cadenceModal.cadenceId} />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
