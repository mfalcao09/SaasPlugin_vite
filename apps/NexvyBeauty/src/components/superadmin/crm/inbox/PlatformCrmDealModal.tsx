import { useState, useEffect, useMemo } from 'react';
import { useCreatePlatformCrmDeal } from '../data/usePlatformCrmDeals';
import { usePlatformCrmProducts } from '../data/usePlatformCrmProducts';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';
import { format, addDays } from 'date-fns';

/**
 * Modal de Nova Oportunidade a partir da conversa — porte fiel A1.2 de
 * `seller/DealModal.tsx` (Vendus v5 original; importado pelo SellerInbox).
 * Adaptações de dados: `deals/leads/lead_notes/pipeline_stages/products`
 * (tenant) → `platform_crm_*`; sem organizationId (adaptação d).
 */
interface PlatformCrmDealModalProps {
  isOpen: boolean;
  onClose: () => void;
  leadId: string;
  leadName: string;
  productId: string | null;
}

const formatCurrency = (value: string) => {
  const numericValue = value.replace(/[^\d]/g, '');
  if (!numericValue) return '';
  const number = parseInt(numericValue) / 100;
  return number.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
};

export function PlatformCrmDealModal({ isOpen, onClose, leadId, leadName, productId }: PlatformCrmDealModalProps) {
  const createDeal = useCreatePlatformCrmDeal();
  const queryClient = useQueryClient();
  const { data: products = [] } = usePlatformCrmProducts();

  const [title, setTitle] = useState('');
  const [dealValue, setDealValue] = useState('');
  const [pipelineId, setPipelineId] = useState<string>(productId || '');
  const [stageId, setStageId] = useState<string>('');
  const [closeDate, setCloseDate] = useState(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
  const [description, setDescription] = useState('');

  const { data: stages = [] } = usePlatformCrmStages(pipelineId || null);

  const orgProducts = useMemo(() => products, [products]);

  useEffect(() => {
    if (isOpen) {
      setTitle(`Oportunidade para ${leadName}`);
      setDealValue('');
      setPipelineId(productId || (orgProducts[0]?.id ?? ''));
      setStageId('');
      setCloseDate(format(addDays(new Date(), 30), 'yyyy-MM-dd'));
      setDescription('');
    }
  }, [isOpen, leadName, productId, orgProducts]);


  useEffect(() => {
    if (stages.length > 0 && !stages.some((s) => s.id === stageId)) {
      setStageId(stages[0].id);
    }
  }, [stages, stageId]);

  const handleSubmit = async () => {
    if (!title.trim()) {
      toast.error('Informe o título da oportunidade');
      return;
    }
    const normalized = dealValue.replace(/\./g, '').replace(',', '.');
    const value = parseFloat(normalized.replace(/[^\d.-]/g, ''));
    if (!value || value <= 0) {
      toast.error('Digite um valor válido');
      return;
    }
    if (!pipelineId) {
      toast.error('Selecione um pipeline');
      return;
    }

    if (!stageId) {
      toast.error('Selecione um estágio do pipeline');
      return;
    }

    try {
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id || '';

      await createDeal.mutateAsync({
        lead_id: leadId,
        product_id: pipelineId,
        seller_id: uid,
        deal_value: value,
        status: 'open' as any,
        plan_name: title.trim(),
        notes: description.trim() || null,
        closed_at: closeDate ? new Date(closeDate).toISOString() : null,
      } as any);

      let partialError = false;

      // Buscar lead atual para preservar assigned_to existente
      const { data: currentLead } = await supabase
        .from('platform_crm_leads')
        .select('assigned_to')
        .eq('id', leadId)
        .maybeSingle();

      const leadUpdate: Record<string, any> = {
        product_id: pipelineId,
        deal_value: value,
        expected_close_date: closeDate || null,
      };
      if (stageId) leadUpdate.current_stage_id = stageId;
      if (!currentLead?.assigned_to && uid) leadUpdate.assigned_to = uid;

      const { error: leadErr } = await supabase
        .from('platform_crm_leads')
        .update(leadUpdate as any)
        .eq('id', leadId);
      if (leadErr) {
        console.error('Erro ao atualizar lead:', leadErr);
        partialError = true;
      }

      if (description.trim() && uid) {
        const { error: noteErr } = await supabase
          .from('platform_crm_lead_notes')
          .insert({
            lead_id: leadId,
            author_id: uid,
            content: description.trim(),
          });
        if (noteErr) {
          console.error('Erro ao registrar nota:', noteErr);
          partialError = true;
        }
      }

      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'linked-lead'] });
      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'leads'] });
      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'lead-notes', leadId] });

      if (partialError) {
        toast.warning('Oportunidade criada, mas houve problema ao atualizar o lead ou registrar a nota');
      } else {
        toast.success('Oportunidade criada');
      }
      onClose();
    } catch (err: any) {
      toast.error(err?.message ? `Erro ao criar oportunidade: ${err.message}` : 'Erro ao criar oportunidade');
    }
  };


  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[640px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Plus className="h-5 w-5 text-primary" />
            Nova Oportunidade
          </DialogTitle>
        </DialogHeader>

        <div className="text-sm text-muted-foreground">Contato: <span className="text-foreground">{leadName}</span></div>

        <div className="grid gap-4 py-2">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="deal-title">Título da Oportunidade</Label>
              <Input
                id="deal-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deal-value">Valor</Label>
              <Input
                id="deal-value"
                placeholder="R$"
                value={dealValue}
                onChange={(e) => setDealValue(formatCurrency(e.target.value))}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Pipeline</Label>
              <Select value={pipelineId} onValueChange={setPipelineId}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o pipeline" />
                </SelectTrigger>
                <SelectContent>
                  {orgProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Estágio</Label>
              <Select value={stageId} onValueChange={setStageId} disabled={stages.length === 0}>
                <SelectTrigger>
                  <SelectValue placeholder={stages.length === 0 ? 'Sem estágios' : 'Selecione o estágio'} />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-2 sm:w-1/2">
            <Label htmlFor="deal-close">Data prevista de fechamento</Label>
            <Input
              id="deal-close"
              type="date"
              value={closeDate}
              onChange={(e) => setCloseDate(e.target.value)}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="deal-desc">Descrição</Label>
            <Textarea
              id="deal-desc"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={createDeal.isPending}>
            Salvar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
