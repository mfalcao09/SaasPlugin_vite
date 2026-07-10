import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Trophy, X, MinusCircle, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { usePlatformCrmStages } from '../data/usePlatformCrmStages';
import { usePlatformCrmProducts } from '../data/usePlatformCrmProducts';

/**
 * "Encerrar conversa" da inbox do CRM de PLATAFORMA.
 * PORTE 1:1 (cópia fiel) de `oficial-vendus-v5/src/components/seller/inbox/ArchiveConversationDialog.tsx`.
 * Substituições de dados (zero organization_id / tenant):
 *   - leads            -> platform_crm_leads
 *   - deals            -> platform_crm_deals
 *   - pipeline_stages  -> usePlatformCrmStages(productId?)  (platform_crm_pipeline_stages)
 *   - products         -> usePlatformCrmProducts()          (platform_crm_products)
 * O dialog só coleta o payload e chama onConfirm — o pai (PlatformCrmInbox) encerra.
 */

export type PlatformCrmClosingOutcome = 'won' | 'lost' | 'no_deal' | 'other';

export interface PlatformCrmArchivePayload {
  closing_outcome: PlatformCrmClosingOutcome;
  closing_reason: string;
  closing_value: number | null;
  stage_id: string | null;
  product_id?: string | null;
}

const NO_PRODUCT = '__none__';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConfirm: (payload: PlatformCrmArchivePayload) => Promise<void> | void;
  loading?: boolean;
  conversationName?: string;
  leadId?: string | null;
  productId?: string | null;
}

const OUTCOMES: Array<{ value: PlatformCrmClosingOutcome; label: string; icon: any; color: string; reasonPlaceholder: string }> = [
  { value: 'won', label: 'Ganho ✅', icon: Trophy, color: 'text-emerald-600', reasonPlaceholder: 'Conte o que fechou a venda (ex.: produto X, valor Y, condições...)' },
  { value: 'lost', label: 'Perdido ❌', icon: X, color: 'text-destructive', reasonPlaceholder: 'Por que o lead foi perdido? (ex.: preço, concorrente, sem fit...)' },
  { value: 'no_deal', label: 'Sem negócio', icon: MinusCircle, color: 'text-muted-foreground', reasonPlaceholder: 'Por que não há negócio? (ex.: lead desqualificado, não respondeu...)' },
  { value: 'other', label: 'Outro', icon: HelpCircle, color: 'text-muted-foreground', reasonPlaceholder: 'Descreva o motivo do encerramento' },
];

export function PlatformCrmArchiveDialog({
  open,
  onOpenChange,
  onConfirm,
  loading,
  conversationName,
  leadId,
  productId,
}: Props) {
  const [outcome, setOutcome] = useState<PlatformCrmClosingOutcome | ''>('');
  const [reason, setReason] = useState('');
  const [value, setValue] = useState('');
  const [userTouchedValue, setUserTouchedValue] = useState(false);
  const [stageId, setStageId] = useState<string>('');
  const [userTouchedStage, setUserTouchedStage] = useState(false);

  const [chosenProductId, setChosenProductId] = useState<string>('');

  // 1) product_id do próprio lead (a fonte também lia organization_id como
  //    fallback de org — removido: plataforma não tem tenant)
  const { data: leadInfo, isLoading: leadProductLoading } = useQuery({
    queryKey: ['platform-crm', 'inbox', 'archive-dialog-lead-product', leadId],
    enabled: open && !productId && !!leadId,
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_crm_leads')
        .select('product_id')
        .eq('id', leadId!)
        .maybeSingle();
      return {
        product_id: (data?.product_id as string | null) ?? null,
      };
    },
  });

  // 2) Produtos da plataforma (usado quando o lead não tem produto vinculado).
  //    Fonte listava products da org com is_active=true ordenado por name;
  //    aqui o hook compartilhado lista platform_crm_products (ordenação por
  //    name aplicada em memória — não há coluna is_active na tabela platform).
  const needsProductFallback =
    !productId && (!leadId || (!leadProductLoading && !leadInfo?.product_id));
  const productsQuery = usePlatformCrmProducts();
  const platformProducts = useMemo(
    () =>
      [...(productsQuery.data ?? [])].sort((a, b) => a.name.localeCompare(b.name)),
    [productsQuery.data],
  );
  const productsLoading = productsQuery.isLoading;

  const effectiveProductId =
    productId ||
    leadInfo?.product_id ||
    (chosenProductId && chosenProductId !== NO_PRODUCT ? chosenProductId : null);
  const showProductPicker = needsProductFallback;
  const skipPipeline = needsProductFallback && chosenProductId === NO_PRODUCT;

  // Estágio atual do lead (para pré-selecionar em no_deal/other)
  const { data: currentLeadStageId } = useQuery({
    queryKey: ['platform-crm', 'inbox', 'archive-dialog-current-stage', leadId],
    enabled: open && !!leadId,
    queryFn: async () => {
      const { data } = await supabase
        .from('platform_crm_leads')
        .select('current_stage_id')
        .eq('id', leadId!)
        .maybeSingle();
      return (data?.current_stage_id as string | null) ?? null;
    },
  });

  // Valor já existente (lead.deal_value ou deal mais recente)
  const { data: existingValue } = useQuery({
    queryKey: ['platform-crm', 'inbox', 'archive-dialog-existing-value', leadId],
    enabled: open && !!leadId,
    queryFn: async () => {
      const { data: lead } = await supabase
        .from('platform_crm_leads')
        .select('deal_value')
        .eq('id', leadId!)
        .maybeSingle();
      const leadVal = Number(lead?.deal_value ?? 0);
      if (leadVal > 0) return leadVal;
      const { data: deal } = await supabase
        .from('platform_crm_deals')
        .select('deal_value, status, created_at')
        .eq('lead_id', leadId!)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      const dealVal = Number(deal?.deal_value ?? 0);
      return dealVal > 0 ? dealVal : null;
    },
  });

  // Estágios do funil do produto efetivo (fonte consultava pipeline_stages com
  // enabled por produto; o hook platform busca por product_id — sem produto
  // efetivo os dados são ignorados, mesma semântica visível da fonte).
  const stagesQuery = usePlatformCrmStages(effectiveProductId ?? null);
  const stages = effectiveProductId ? (stagesQuery.data ?? []) : [];
  const stagesLoading = effectiveProductId ? stagesQuery.isLoading : false;

  const suggestedStageId = useMemo(() => {
    if (!stages.length) return '';
    if (outcome === 'won') {
      const won = stages.find((s) => s.is_won);
      if (won) return won.id;
    }
    if (outcome === 'lost') {
      const lost = stages.find((s) => s.is_lost);
      if (lost) return lost.id;
    }
    if (currentLeadStageId && stages.some((s) => s.id === currentLeadStageId)) {
      return currentLeadStageId;
    }
    const first = stages.find((s) => !s.is_won && !s.is_lost) || stages[0];
    return first?.id ?? '';
  }, [stages, outcome, currentLeadStageId]);

  // Reset ao abrir
  useEffect(() => {
    if (open) {
      setOutcome('');
      setReason('');
      setValue('');
      setUserTouchedValue(false);
      setStageId('');
      setUserTouchedStage(false);
      setChosenProductId('');
    }
  }, [open]);

  // Pré-preencher valor com deal existente (se usuário ainda não digitou)
  useEffect(() => {
    if (open && !userTouchedValue && existingValue && existingValue > 0) {
      setValue(
        existingValue.toLocaleString('pt-BR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })
      );
    }
  }, [open, existingValue, userTouchedValue]);

  // Auto pré-seleção do estágio quando outcome muda (se usuário não trocou manualmente)
  useEffect(() => {
    if (!userTouchedStage && suggestedStageId) {
      setStageId(suggestedStageId);
    }
  }, [suggestedStageId, userTouchedStage]);

  const selected = OUTCOMES.find((o) => o.value === outcome);
  const valueNumber = value ? Number(value.replace(/\./g, '').replace(',', '.')) : NaN;
  const valueEntered = value.trim().length > 0;
  const valueInvalidEntered = valueEntered && (isNaN(valueNumber) || valueNumber <= 0);
  const showWonValueWarning = outcome === 'won' && (!valueEntered || valueNumber <= 0);
  const reasonValid = reason.trim().length >= 10;
  const stageValid = !!stageId;
  const productChoiceValid = !showProductPicker || !!chosenProductId;
  const isValid =
    !!outcome &&
    reasonValid &&
    !valueInvalidEntered &&
    productChoiceValid &&
    (skipPipeline || stageValid);

  const handleSubmit = async () => {
    if (!isValid || !outcome) return;
    await onConfirm({
      closing_outcome: outcome,
      closing_reason: reason.trim(),
      closing_value: !isNaN(valueNumber) && valueNumber > 0 ? valueNumber : null,
      stage_id: skipPipeline ? null : stageId,
      product_id: showProductPicker
        ? (chosenProductId === NO_PRODUCT ? null : chosenProductId || null)
        : undefined,
    });
  };

  const noStagesAvailable = !stagesLoading && effectiveProductId && stages.length === 0;
  const noProducts =
    needsProductFallback && !productsLoading && platformProducts.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !loading && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md max-h-[92vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Encerrar conversa</DialogTitle>
          <DialogDescription>
            {conversationName ? `Antes de encerrar com ${conversationName}, ` : 'Antes de encerrar, '}
            registre o desfecho e mova o lead no pipeline.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Outcome */}
          <div className="space-y-2">
            <Label>Resultado *</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as PlatformCrmClosingOutcome)}
              className="grid grid-cols-2 gap-2"
            >
              {OUTCOMES.map((o) => {
                const Icon = o.icon;
                const active = outcome === o.value;
                return (
                  <label
                    key={o.value}
                    htmlFor={`pcrm-outcome-${o.value}`}
                    className={cn(
                      'flex items-center gap-2 rounded-md border p-3 cursor-pointer text-sm transition-colors',
                      active ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                    )}
                  >
                    <RadioGroupItem id={`pcrm-outcome-${o.value}`} value={o.value} />
                    <Icon className={cn('h-4 w-4', o.color)} />
                    <span>{o.label}</span>
                  </label>
                );
              })}
            </RadioGroup>
          </div>

          {/* Product picker (sempre que o lead não tem produto vinculado) */}
          {showProductPicker && (
            <div className="space-y-2">
              <Label htmlFor="pcrm-archive-product">Produto / Negócio *</Label>
              <Select
                value={chosenProductId}
                onValueChange={(v) => {
                  setChosenProductId(v);
                  setStageId('');
                  setUserTouchedStage(false);
                }}
                disabled={productsLoading}
              >
                <SelectTrigger id="pcrm-archive-product">
                  <SelectValue
                    placeholder={
                      productsLoading ? 'Carregando produtos...' : 'Selecione o produto'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_PRODUCT}>
                    Sem produto — apenas registrar desfecho
                  </SelectItem>
                  {platformProducts.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">
                {noProducts
                  ? 'Nenhum produto ativo cadastrado. Você pode encerrar sem posicionar no pipeline.'
                  : 'Este lead ainda não tem produto vinculado. Escolha um para posicioná-lo no pipeline ou encerre sem produto.'}
              </p>
            </div>
          )}

          {/* Pipeline Stage — escondido quando o usuário optou por 'Sem produto' */}
          {!skipPipeline && (
            <div className="space-y-2">
              <Label htmlFor="pcrm-archive-stage">Estágio no pipeline *</Label>
              <Select
                value={stageId}
                onValueChange={(v) => {
                  setStageId(v);
                  setUserTouchedStage(true);
                }}
                disabled={stagesLoading || !stages.length}
              >
                <SelectTrigger id="pcrm-archive-stage">
                  <SelectValue
                    placeholder={
                      stagesLoading
                        ? 'Carregando estágios...'
                        : !effectiveProductId
                          ? 'Selecione um produto acima'
                          : noStagesAvailable
                            ? 'Nenhum estágio disponível'
                            : 'Selecione um estágio'
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {stages.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                      {s.is_won ? ' • Ganho' : s.is_lost ? ' • Perdido' : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {noStagesAvailable && (
                <p className="text-xs text-destructive">
                  Este produto não tem pipeline configurado — peça ao admin para criar os estágios.
                </p>
              )}
              {!stageValid && !stagesLoading && stages.length > 0 && (
                <p className="text-xs text-muted-foreground">
                  O lead será movido para o estágio selecionado.
                </p>
              )}
            </div>
          )}

          {/* Value */}
          {(outcome === 'won' || outcome === 'lost') && (
            <div className="space-y-2">
              <Label htmlFor="pcrm-archive-value">Valor (R$)</Label>
              <Input
                id="pcrm-archive-value"
                inputMode="decimal"
                placeholder="0,00"
                value={value}
                onChange={(e) => {
                  setUserTouchedValue(true);
                  setValue(e.target.value.replace(/[^\d.,]/g, ''));
                }}
              />
              {valueInvalidEntered && (
                <p className="text-xs text-destructive">Informe um valor maior que zero.</p>
              )}
              {showWonValueWarning && !valueInvalidEntered && (
                <p className="text-xs text-amber-600 dark:text-amber-400">
                  Sem valor informado — recomendamos adicionar para o relatório de vendas. Você pode encerrar mesmo assim.
                </p>
              )}
            </div>
          )}

          {/* Reason */}
          <div className="space-y-2">
            <Label htmlFor="pcrm-archive-reason">Motivo do encerramento *</Label>
            <Textarea
              id="pcrm-archive-reason"
              rows={4}
              placeholder={selected?.reasonPlaceholder || 'Descreva o motivo (mín. 10 caracteres)'}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={1000}
            />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span className={reason.length > 0 && !reasonValid ? 'text-destructive' : ''}>
                Mínimo 10 caracteres
              </span>
              <span>{reason.length}/1000</span>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!isValid || loading}>
            {loading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Confirmar encerramento
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
