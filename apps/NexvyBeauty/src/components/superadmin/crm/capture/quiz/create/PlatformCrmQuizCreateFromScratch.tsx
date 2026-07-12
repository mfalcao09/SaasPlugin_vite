// ─────────────────────────────────────────────────────────────────────────────
// PlatformCrmQuizCreateFromScratch — dialog "Criar Quiz do Zero" (super_admin).
// Porte 1:1 de `admin/capture/quiz/create/QuizCreateFromScratch.tsx`.
// Data-layer tenant → plataforma:
//   - useCreateFunnel                 → useCreatePlatformCrmCaptureFunnel (semeia
//                                       flow_blocks + start_block_id, extensão da Foundation)
//   - useProducts / <Select> produto  → PlatformCrmCaptureProductField + useActivePlatformProduct
// Zero organization_id. Cria funil channel_type='quiz' com blocos welcome→end.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2 } from 'lucide-react';
import {
  useCreatePlatformCrmCaptureFunnel,
  type PlatformCrmCaptureFunnelInsert,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformCrmCaptureProductField } from '../../PlatformCrmCaptureProductField';
import { generateBlockId, type FunnelBlock } from '@/types/funnel';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (funnelId: string) => void;
}

export function PlatformCrmQuizCreateFromScratch({ open, onOpenChange, onCreated }: Props) {
  const { products, effectiveProductId } = useActivePlatformProduct();
  const [productId, setProductId] = useState(effectiveProductId ?? '');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const createFunnel = useCreatePlatformCrmCaptureFunnel();

  // Com produtos cadastrados o produto é obrigatório; sem nenhum (o field não
  // renderiza) a criação segue e o backend aplica o DEFAULT da coluna.
  const productReady = products.length === 0 || !!productId;

  const handleSubmit = async () => {
    if (!name.trim() || !productReady) return;
    const welcome: FunnelBlock = {
      id: generateBlockId(),
      type: 'message' as FunnelBlock['type'],
      position: { x: 0, y: 0 },
      next_block_id: null,
      data: { content: '👋 Bem-vindo ao quiz!' },
    };
    const end: FunnelBlock = {
      id: generateBlockId(),
      type: 'end' as FunnelBlock['type'],
      position: { x: 0, y: 0 },
      next_block_id: null,
      data: { content: 'Obrigado por participar!' },
    };
    welcome.next_block_id = end.id;
    const res = await createFunnel.mutateAsync({
      product_id: productId || null,
      name: name.trim(),
      description: objective.trim() || undefined,
      channel_type: 'quiz',
      flow_blocks: [welcome, end] as unknown as PlatformCrmCaptureFunnelInsert['flow_blocks'],
      start_block_id: welcome.id,
    });
    onOpenChange(false);
    setName(''); setObjective(''); setProductId(effectiveProductId ?? '');
    onCreated(res.id);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Criar Quiz do Zero</DialogTitle>
          <DialogDescription>Configure o básico e abra o builder visual.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <PlatformCrmCaptureProductField
            products={products}
            value={productId}
            onChange={setProductId}
          />
          <div className="space-y-2">
            <Label>Nome do Quiz *</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Qual seu perfil ideal?" />
          </div>
          <div className="space-y-2">
            <Label>Objetivo do Quiz</Label>
            <Textarea rows={3} value={objective} onChange={(e) => setObjective(e.target.value)}
              placeholder="Ex: Qualificar leads do evento por nível de maturidade comercial." />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSubmit} disabled={!name.trim() || !productReady || createFunnel.isPending}>
            {createFunnel.isPending ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Criando...</> : 'Criar e abrir builder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
