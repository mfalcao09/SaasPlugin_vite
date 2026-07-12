// ─────────────────────────────────────────────────────────────────────────────
// PlatformCrmQuizCreateWithAI — dialog "Criar Quiz com IA" (super_admin).
// Porte de `admin/capture/quiz/create/QuizCreateWithAI.tsx`.
// Data-layer tenant → plataforma:
//   - supabase.functions.invoke('quiz-generate-ai')  → 'platform-quiz-generate-ai'
//   - useCreateFunnel                                 → useCreatePlatformCrmCaptureFunnel
//   - useProducts / <Select> produto                  → PlatformCrmCaptureProductField
//                                                       + useActivePlatformProduct
// GAP FIEL: a seção "Ações pós-conclusão" (agente/cadência) do tenant NÃO foi
// portada — a tabela `platform_crm_capture_funnels` NÃO possui as colunas
// `post_quiz_agent_id` / `post_quiz_cadence_id` (confirmado no schema). Portar a
// UI apontando para colunas inexistentes quebraria o tipo do update. Registrado
// em honest_gaps. O restante da estrutura/UX é 1:1. Zero organization_id.
// ─────────────────────────────────────────────────────────────────────────────
import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
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

const PLACEHOLDER = 'Exemplo: Estou em um evento presencial para empresários e quero criar um quiz rápido para identificar quem tem maior potencial de compra. Quero perguntar sobre faturamento, equipe, principal desafio e urgência. No final, quero classificar o lead como iniciante, intermediário ou avançado.';

export function PlatformCrmQuizCreateWithAI({ open, onOpenChange, onCreated }: Props) {
  const { products, effectiveProductId } = useActivePlatformProduct();
  const [productId, setProductId] = useState(effectiveProductId ?? '');
  const [name, setName] = useState('');
  const [objective, setObjective] = useState('');
  const [context, setContext] = useState('');
  const [tone, setTone] = useState('profissional');
  const [resultType, setResultType] = useState('classificacao');
  const [captureName, setCaptureName] = useState(true);
  const [captureWa, setCaptureWa] = useState(true);
  const [captureEmail, setCaptureEmail] = useState(false);
  const [generating, setGenerating] = useState(false);

  const createFunnel = useCreatePlatformCrmCaptureFunnel();

  // Produto é obrigatório quando há catálogo; sem produtos (field oculto) o
  // edge gera sem contexto de produto (product_id opcional na plataforma).
  const productReady = products.length === 0 || !!productId;

  const handleGenerate = async () => {
    if (!productReady || !name.trim() || context.trim().length < 20) {
      toast.error('Preencha produto, nome e contexto (mín. 20 caracteres)');
      return;
    }
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('platform-quiz-generate-ai', {
        body: {
          ...(productId ? { product_id: productId } : {}),
          name, objective, context,
          tone, result_type: resultType,
          capture_name: captureName, capture_whatsapp: captureWa, capture_email: captureEmail,
          use_brain: true,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Falha ao gerar quiz');

      // Reconstrói blocks com IDs reais e linkagem linear.
      const blocks: FunnelBlock[] = (data.blocks || []).map((b: any) => ({
        id: generateBlockId(),
        type: b.type,
        position: { x: 0, y: 0 },
        next_block_id: null,
        data: b.data || {},
      }));
      for (let i = 0; i < blocks.length - 1; i++) blocks[i].next_block_id = blocks[i + 1].id;

      const created = await createFunnel.mutateAsync({
        product_id: productId || null,
        name: data.suggested_name || name,
        description: data.suggested_description || objective,
        channel_type: 'quiz',
        flow_blocks: blocks as unknown as PlatformCrmCaptureFunnelInsert['flow_blocks'],
        start_block_id: blocks[0]?.id,
      });

      toast.success('Quiz gerado pela IA com sucesso!');
      onOpenChange(false);
      onCreated(created.id);
    } catch (e: any) {
      toast.error('Erro ao gerar quiz: ' + (e.message || 'desconhecido'));
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Sparkles className="h-5 w-5 text-primary" />Criar Quiz com IA</DialogTitle>
          <DialogDescription>Descreva o contexto e a IA monta o quiz completo.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <PlatformCrmCaptureProductField
              products={products}
              value={productId}
              onChange={setProductId}
            />
            <div className="space-y-2">
              <Label>Nome do Quiz *</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Diagnóstico Comercial" />
            </div>
          </div>

          <div className="space-y-2">
            <Label>Objetivo</Label>
            <Input value={objective} onChange={(e) => setObjective(e.target.value)} placeholder="Ex: Identificar leads quentes do evento" />
          </div>

          <div className="space-y-2">
            <Label>Contexto do Quiz *</Label>
            <Textarea rows={6} value={context} onChange={(e) => setContext(e.target.value)} placeholder={PLACEHOLDER} />
            <p className="text-xs text-muted-foreground">Mínimo 20 caracteres. Quanto mais contexto, melhor o quiz gerado.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Tom de comunicação</Label>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="profissional">Profissional</SelectItem>
                  <SelectItem value="consultivo">Consultivo</SelectItem>
                  <SelectItem value="descontraido">Descontraído</SelectItem>
                  <SelectItem value="direto">Direto</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Tipo de resultado</Label>
              <Select value={resultType} onValueChange={setResultType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="classificacao">Classificação (frio/morno/quente)</SelectItem>
                  <SelectItem value="diagnostico">Diagnóstico</SelectItem>
                  <SelectItem value="recomendacao">Recomendação</SelectItem>
                  <SelectItem value="pontuacao">Pontuação simples</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Campos de captura</p>
            <div className="flex items-center justify-between"><Label className="font-normal">Capturar nome</Label><Switch checked={captureName} onCheckedChange={setCaptureName} /></div>
            <div className="flex items-center justify-between"><Label className="font-normal">Capturar WhatsApp</Label><Switch checked={captureWa} onCheckedChange={setCaptureWa} /></div>
            <div className="flex items-center justify-between"><Label className="font-normal">Capturar e-mail</Label><Switch checked={captureEmail} onCheckedChange={setCaptureEmail} /></div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={generating}>Cancelar</Button>
          <Button onClick={handleGenerate} disabled={generating || !productReady || !name.trim() || context.trim().length < 20} className="gap-2">
            {generating ? <><Loader2 className="h-4 w-4 animate-spin" />Gerando quiz...</> : <><Sparkles className="h-4 w-4" />Gerar com IA</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
