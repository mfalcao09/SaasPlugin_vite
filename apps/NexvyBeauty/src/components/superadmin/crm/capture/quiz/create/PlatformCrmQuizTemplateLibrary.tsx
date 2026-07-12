// ─────────────────────────────────────────────────────────────────────────────
// PlatformCrmQuizTemplateLibrary — diálogo "Usar Template" de Quiz (super_admin).
//
// FONTE ÚNICA: lê a MESMA biblioteca da página de Templates
// (`usePlatformCaptureTemplateLibrary` = seed estático `QUIZ_TEMPLATES` + DB
// `platform_crm_quiz_templates`). Antes lia só o DB (`usePlatformCrmQuizTemplates`),
// que nasce vazio → o diálogo aparecia "Nenhum template encontrado" mesmo com os
// templates existindo no seed. Agora galeria e diálogo mostram o mesmo catálogo.
//
// Criação: clona `flow_blocks` (regenera ids via `clonePlatformFlowBlocks`) e cria um
// funil `channel_type='quiz'` via `useCreatePlatformCrmCaptureFunnel` (mesmo caminho da
// página). O `product_id` é carimbado direto no insert (o hook aceita product_id), sem
// precisar de um segundo update. Mantém o contrato `onCreated(funnelId)`.
// Zero organization_id.
// ─────────────────────────────────────────────────────────────────────────────
import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Search, Clock, ListChecks, Rocket, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  useCreatePlatformCrmCaptureFunnel,
  type PlatformCrmCaptureFunnelInsert,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { PlatformCrmCaptureProductField } from '../../PlatformCrmCaptureProductField';
import {
  usePlatformCaptureTemplateLibrary,
  clonePlatformFlowBlocks,
} from '../../templates/usePlatformCaptureTemplateLibrary';
import {
  CATEGORY_LABELS,
  BADGE_LABELS,
  type QuizTemplate,
  type QuizBadge,
} from '../../templates/platformQuizTemplates';
import { cn } from '@/lib/utils';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (funnelId: string) => void;
}

export function PlatformCrmQuizTemplateLibrary({ open, onOpenChange, onCreated }: Props) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [badge, setBadge] = useState<string>('all');
  const [selected, setSelected] = useState<QuizTemplate | null>(null);
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');

  const { templates, isLoading } = usePlatformCaptureTemplateLibrary();
  const { products, effectiveProductId } = useActivePlatformProduct();
  const createFunnel = useCreatePlatformCrmCaptureFunnel();
  const busy = createFunnel.isPending;

  // Categorias/etiquetas presentes no catálogo (seed + DB), com label amigável.
  const categories = useMemo(
    () => Array.from(new Set(templates.map((t) => t.category).filter(Boolean))),
    [templates],
  );
  const badges = useMemo(
    () => Array.from(new Set(templates.flatMap((t) => t.badges ?? []))),
    [templates],
  );

  const filtered = useMemo(() => templates.filter((t) => {
    const q = query.trim().toLowerCase();
    if (q && !t.name.toLowerCase().includes(q) && !(t.description ?? '').toLowerCase().includes(q)) return false;
    if (category !== 'all' && t.category !== category) return false;
    if (badge !== 'all' && !(t.badges ?? []).includes(badge as QuizBadge)) return false;
    return true;
  }), [templates, query, category, badge]);

  const pickTemplate = (t: QuizTemplate) => {
    setSelected(t);
    setName(t.name);
    setProductId(effectiveProductId ?? '');
  };

  const productReady = products.length === 0 || !!productId;

  const handleUse = async () => {
    if (!selected || !name.trim() || !productReady) { toast.error('Selecione um produto'); return; }
    try {
      const cloned = clonePlatformFlowBlocks(selected.flow_blocks);
      const created = await createFunnel.mutateAsync({
        name: name.trim(),
        description: selected.description,
        channel_type: 'quiz',
        product_id: productId || null,
        flow_blocks: cloned as unknown as PlatformCrmCaptureFunnelInsert['flow_blocks'],
        start_block_id: cloned[0]?.id ?? null,
      });
      toast.success('Quiz criado a partir do template!');
      onOpenChange(false);
      setSelected(null);
      onCreated(created.id);
    } catch (e: any) {
      toast.error('Erro: ' + (e.message || 'desconhecido'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Biblioteca de Templates de Quiz</DialogTitle>
          <DialogDescription>Escolha um modelo pronto e personalize.</DialogDescription>
        </DialogHeader>

        {/* Filtros */}
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input className="pl-9" placeholder="Buscar template..." value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <Select value={category} onValueChange={setCategory}>
            <SelectTrigger className="w-full md:w-[200px]"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas categorias</SelectItem>
              {categories.map((c) => <SelectItem key={c} value={c}>{CATEGORY_LABELS[c] ?? c}</SelectItem>)}
            </SelectContent>
          </Select>
          <Select value={badge} onValueChange={setBadge}>
            <SelectTrigger className="w-full md:w-[180px]"><SelectValue placeholder="Etiqueta" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas etiquetas</SelectItem>
              {badges.map((b) => <SelectItem key={b} value={b}>{BADGE_LABELS[b] ?? b}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {/* Grid */}
        <div className="overflow-y-auto flex-1 -mx-1 px-1">
          {isLoading ? (
            <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
          ) : filtered.length === 0 ? (
            <p className="text-center text-muted-foreground py-12">Nenhum template encontrado.</p>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 pb-2">
              {filtered.map((t) => (
                <Card key={t.id} className="overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition cursor-pointer" onClick={() => pickTemplate(t)}>
                  <div className={cn('h-24 bg-gradient-to-br flex items-center justify-center text-5xl', t.cover_gradient)}>{t.icon}</div>
                  <CardContent className="p-3 space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-semibold text-sm leading-tight flex-1">{t.name}</h3>
                    </div>
                    <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                    <div className="flex flex-wrap gap-1">
                      <Badge variant="secondary" className="text-[10px]">{CATEGORY_LABELS[t.category] ?? t.category}</Badge>
                      {(t.badges ?? []).slice(0, 2).map((b) => (
                        <Badge key={b} variant="outline" className="text-[10px]">{BADGE_LABELS[b] ?? b}</Badge>
                      ))}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground pt-1 border-t tabular-nums">
                      <span className="flex items-center gap-1"><Clock className="h-3 w-3" />{t.estimated_time}</span>
                      <span className="flex items-center gap-1"><ListChecks className="h-3 w-3" />{t.question_count}</span>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>

        {/* Modal de confirmação ao escolher */}
        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-md">
            {selected && (
              <>
                <DialogHeader>
                  <DialogTitle>Usar template "{selected.name}"</DialogTitle>
                  <DialogDescription>Personalize o nome e o produto antes de criar.</DialogDescription>
                </DialogHeader>
                <div className="space-y-3 py-3">
                  <div className="space-y-1.5"><Label>Nome do quiz</Label><Input value={name} onChange={(e) => setName(e.target.value)} /></div>
                  <PlatformCrmCaptureProductField
                    products={products}
                    value={productId}
                    onChange={setProductId}
                  />
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setSelected(null)}>Voltar</Button>
                  <Button onClick={handleUse} disabled={busy || !productReady || !name.trim()} className="gap-2">
                    {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                    Criar quiz
                  </Button>
                </DialogFooter>
              </>
            )}
          </DialogContent>
        </Dialog>
      </DialogContent>
    </Dialog>
  );
}
