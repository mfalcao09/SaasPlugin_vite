import { useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { usePlatformCrmCadences, type Cadence } from '../data/usePlatformCrmCadences';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Loader2, CalendarDays } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * Inscrição do lead em uma cadência a partir da conversa — porte fiel A1.2 de
 * `seller/inbox/SendCadenceDialog.tsx` (Vendus v5 original).
 *
 * Adaptação de dados: o modelo do tenant (useCadence → dias →
 * `ai_outreach_queue`) vira o modelo da PLATAFORMA: `usePlatformCrmCadences`
 * (`platform_crm_cadences`) + INSERT em `platform_crm_cadence_enrollments`
 * (`cadence_id, lead_id, status:'active', source:'inbox',
 * source_ref:conversationId, current_step_index:0`).
 */
interface PlatformCrmSendCadenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  leadId?: string;
  productId?: string;
  conversationId: string;
}

export function PlatformCrmSendCadenceDialog({
  open,
  onOpenChange,
  leadId,
  productId,
  conversationId,
}: PlatformCrmSendCadenceDialogProps) {
  const { toast } = useToast();
  const { cadences, loading: isLoading } = usePlatformCrmCadences();
  const [selectedCadence, setSelectedCadence] = useState<Cadence | null>(null);
  const [isSending, setIsSending] = useState(false);

  // Cadências ativas; quando a conversa tem produto, prioriza as do produto
  // (mantém as globais sem product_id — paridade com o filtro do v5).
  const available = useMemo(() => {
    const active = cadences.filter((c) => c.status === 'active');
    if (!productId) return active;
    return active.filter((c) => !c.product_id || c.product_id === productId);
  }, [cadences, productId]);

  const handleSend = async () => {
    if (!leadId) {
      toast({ title: 'Lead precisa estar vinculado', variant: 'destructive' });
      return;
    }
    if (!selectedCadence) return;

    setIsSending(true);
    try {
      const { error } = await supabase.from('platform_crm_cadence_enrollments').insert([{
        cadence_id: selectedCadence.id,
        lead_id: leadId,
        status: 'active',
        source: 'inbox',
        source_ref: conversationId,
        current_step_index: 0,
      } as any]);
      if (error) throw error;

      toast({ title: `Cadência "${selectedCadence.name}" iniciada` });
      onOpenChange(false);
    } catch {
      toast({ title: 'Erro ao iniciar cadência', variant: 'destructive' });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5" />
            Enviar Cadência
          </DialogTitle>
        </DialogHeader>

        {!leadId && (
          <p className="text-sm text-destructive">Vincule um lead antes de enviar a cadência.</p>
        )}

        <ScrollArea className="max-h-80">
          {isLoading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : !available.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              Nenhuma cadência configurada para este produto.
            </p>
          ) : (
            <div className="space-y-2">
              {available.map((cadence) => (
                <button
                  key={cadence.id}
                  onClick={() => setSelectedCadence(cadence)}
                  className={cn(
                    "w-full text-left p-3 rounded-lg border transition-colors",
                    selectedCadence?.id === cadence.id
                      ? "border-primary bg-primary/5"
                      : "border-border hover:border-primary/50"
                  )}
                >
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="shrink-0">{cadence.channel || 'whatsapp'}</Badge>
                    <span className="text-sm font-medium">{cadence.name}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {cadence.description || cadence.objective || 'Sem descrição'}
                  </p>
                </button>
              ))}
            </div>
          )}
        </ScrollArea>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={!leadId || !available.length || !selectedCadence || isSending}>
            {isSending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {selectedCadence ? `Iniciar "${selectedCadence.name}"` : 'Iniciar cadência'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
