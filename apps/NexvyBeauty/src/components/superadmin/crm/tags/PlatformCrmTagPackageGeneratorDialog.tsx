import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Sparkles, Check, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useQueryClient } from '@tanstack/react-query';
import type { PlatformCrmTagInsert } from '@/components/superadmin/crm/data/usePlatformCrmTags';
import type { PlatformCrmTagAutomationInsert } from '@/components/superadmin/crm/data/usePlatformCrmTagAutomations';

const PLATFORM_CRM_KEY = 'platform-crm';

/**
 * Pacote canônico de etiquetas + regras de checkout. Cada item vira 1 etiqueta
 * (platform_crm_lead_tags) + 1 automação por evento (platform_crm_tag_automations).
 *
 * TODO(produto): o original prefixava cada etiqueta com o nome do produto e vinculava
 * cada regra a um product_id, evitando que clientes de vários produtos misturassem
 * fluxos. O schema platform_crm_* atual NÃO tem product_id — esta é a versão SEM
 * produto (etiquetas globais do pipeline único). Restaurar o prefixo por produto
 * quando Produtos decidir a dimensão por produto.
 */
const PACKAGE_PRESET: Array<{
  name: string;
  color: string;
  description: string;
  event_type: string;
  /** transitória → is_lifecycle_status true (removida ao confirmar a compra). */
  transient: boolean;
}> = [
  { name: 'PIX Gerado',           color: '#EAB308', event_type: 'pix_gerado',           transient: true,  description: 'Aplicada quando o cliente gera PIX. Removida ao confirmar pagamento.' },
  { name: 'Boleto Gerado',        color: '#3B82F6', event_type: 'boleto_gerado',        transient: true,  description: 'Aplicada quando gera boleto. Removida ao confirmar pagamento.' },
  { name: 'Aguardando Pagamento', color: '#F97316', event_type: 'aguardando_pagamento', transient: true,  description: 'Aplicada com PIX ou Boleto. Removida ao confirmar.' },
  { name: 'Checkout Abandonado',  color: '#6B7280', event_type: 'checkout_abandonado',  transient: true,  description: 'Aplicada se abandonar. Removida se voltar e comprar.' },
  { name: 'Cliente',              color: '#22C55E', event_type: 'compra_aprovada',      transient: false, description: 'Aplicada na compra. PERMANENTE para histórico.' },
  { name: 'Reembolso',            color: '#EF4444', event_type: 'reembolso',            transient: false, description: 'Aplicada em reembolso. PERMANENTE para histórico.' },
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

/**
 * Gerador de pacote do CRM de PLATAFORMA: cria as etiquetas do preset + as regras
 * de automação em 1 clique. Idempotente por nome: etiquetas já existentes são
 * reaproveitadas em vez de duplicadas. Só tabelas platform_crm_*.
 */
export function PlatformCrmTagPackageGeneratorDialog({ open, onOpenChange }: Props) {
  const queryClient = useQueryClient();
  const [isPending, setIsPending] = useState(false);

  const handleGenerate = async () => {
    setIsPending(true);
    try {
      // 1. Reaproveita etiquetas existentes (idempotência por nome) e cria as que faltam.
      const { data: existing, error: readErr } = await supabase
        .from('platform_crm_lead_tags')
        .select('id, name');
      if (readErr) throw readErr;

      const byName = new Map<string, string>();
      for (const row of (existing ?? []) as Array<{ id: string; name: string }>) {
        byName.set(row.name.toLowerCase(), row.id);
      }

      const toCreate: PlatformCrmTagInsert[] = PACKAGE_PRESET
        .filter((p) => !byName.has(p.name.toLowerCase()))
        .map((p) => ({
          name: p.name,
          color: p.color,
          description: p.description,
          is_lifecycle_status: p.transient,
        }));

      if (toCreate.length > 0) {
        const { data: created, error: createErr } = await supabase
          .from('platform_crm_lead_tags')
          .insert(toCreate)
          .select('id, name');
        if (createErr) throw createErr;
        for (const row of (created ?? []) as Array<{ id: string; name: string }>) {
          byName.set(row.name.toLowerCase(), row.id);
        }
      }

      // 2. Cria uma automação por evento apontando para a etiqueta correspondente.
      const automations: PlatformCrmTagAutomationInsert[] = [];
      for (const p of PACKAGE_PRESET) {
        const tagId = byName.get(p.name.toLowerCase());
        if (!tagId) continue;
        automations.push({
          event_type: p.event_type,
          tag_id_to_add: tagId,
          // Ao aprovar a compra, remove a etiqueta transitória "Aguardando Pagamento".
          tag_id_to_remove:
            p.event_type === 'compra_aprovada'
              ? byName.get('aguardando pagamento') ?? null
              : null,
          is_active: true,
        });
      }

      if (automations.length > 0) {
        const { error: autoErr } = await supabase
          .from('platform_crm_tag_automations')
          .insert(automations);
        if (autoErr) throw autoErr;
      }

      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tags'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'tag-automations'] });
      toast.success('Pacote de etiquetas gerado!');
      onOpenChange(false);
    } catch (error: any) {
      console.error('Error generating platform CRM tag package:', error);
      toast.error('Erro ao gerar pacote de etiquetas');
    } finally {
      setIsPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            Gerar pacote de etiquetas de checkout
          </DialogTitle>
          <DialogDescription>
            Cria 6 etiquetas + 6 automações de uma vez, cobrindo o ciclo de checkout
            (PIX, boleto, abandono, compra e reembolso). Etiquetas já existentes com o
            mesmo nome são reaproveitadas — rodar de novo não duplica nada.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <Label className="text-xs uppercase text-muted-foreground">Pré-visualização (será criado)</Label>
          <div className="rounded-lg border border-border divide-y">
            {PACKAGE_PRESET.map((tag) => (
              <div key={tag.name} className="flex items-start gap-3 p-3">
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs shrink-0 mt-0.5"
                  style={{ backgroundColor: `${tag.color}20`, color: tag.color }}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: tag.color }} />
                  {tag.name}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs text-muted-foreground">{tag.description}</p>
                </div>
                <span className="text-[10px] uppercase font-medium shrink-0 mt-1">
                  {tag.transient ? (
                    <span className="text-orange-600 inline-flex items-center gap-1"><X className="h-3 w-3" /> Transitória</span>
                  ) : (
                    <span className="text-emerald-600 inline-flex items-center gap-1"><Check className="h-3 w-3" /> Permanente</span>
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={isPending}>
            {isPending ? 'Gerando...' : 'Gerar pacote'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
