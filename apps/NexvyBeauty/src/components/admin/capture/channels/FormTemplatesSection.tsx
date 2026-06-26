// Galeria "Templates de Formulário" — espelha a CaptureTemplatesSection (quiz),
// mas lê de form_templates (useFormTemplates) e cria via useCreateForm({templateId}).
// Zero motor novo: a criação a partir de template já existe no hook (clona blocks
// -> form_blocks). Aqui só damos a casca de galeria, no contexto de Atrair Clientes.
import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { LayoutGrid, Sparkles, Rocket, Loader2, FileText } from 'lucide-react';
import { useFormTemplates, useCreateForm } from '@/hooks/useForms';
import { useProducts } from '@/hooks/useProducts';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

// form_templates não traz ícone/gradiente — mapeamos por categoria (estilo quiz).
const CATEGORY_META: Record<string, { label: string; icon: string; gradient: string }> = {
  captacao: { label: 'Captação', icon: '🎯', gradient: 'from-pink-400 to-rose-500' },
  diagnostic: { label: 'Diagnóstico', icon: '🔍', gradient: 'from-blue-400 to-indigo-500' },
  negocios: { label: 'Negócios', icon: '📈', gradient: 'from-emerald-400 to-green-500' },
  nichos: { label: 'Beleza', icon: '💅', gradient: 'from-purple-400 to-fuchsia-500' },
  qualification: { label: 'Qualificação', icon: '⭐', gradient: 'from-amber-400 to-orange-500' },
  general: { label: 'Geral', icon: '📋', gradient: 'from-slate-400 to-gray-500' },
  feedback: { label: 'Feedback', icon: '💬', gradient: 'from-cyan-400 to-teal-500' },
  survey: { label: 'Pesquisa', icon: '📊', gradient: 'from-violet-400 to-purple-500' },
  pre_sale: { label: 'Pré-venda', icon: '🛒', gradient: 'from-rose-400 to-pink-500' },
};

function meta(category?: string) {
  return CATEGORY_META[category || 'general'] || CATEGORY_META.general;
}

type FormTpl = {
  id: string;
  name: string;
  description?: string | null;
  category?: string | null;
  blocks?: unknown;
};

export function FormTemplatesSection() {
  const { data: templates, isLoading } = useFormTemplates();
  const { data: products } = useProducts();
  const createForm = useCreateForm();

  const [filter, setFilter] = useState<string>('todos');
  const [selected, setSelected] = useState<FormTpl | null>(null);
  const [productId, setProductId] = useState<string>('');
  const [name, setName] = useState('');

  const list = (templates || []) as FormTpl[];

  // Categorias presentes (deriva dos templates existentes, igual ao quiz).
  const categories = ['todos', ...Array.from(new Set(list.map((t) => t.category || 'general')))];

  const filtered = filter === 'todos' ? list : list.filter((t) => (t.category || 'general') === filter);

  const openTemplate = (t: FormTpl) => {
    setSelected(t);
    setName(t.name);
    setProductId(products?.[0]?.id || '');
  };

  const blockCount = (t: FormTpl) => (Array.isArray(t.blocks) ? t.blocks.length : 0);

  const handleClone = async () => {
    if (!selected || !productId) {
      toast.error('Selecione um produto');
      return;
    }
    try {
      await createForm.mutateAsync({
        productId,
        name,
        description: selected.description || undefined,
        templateId: selected.id,
      });
      toast.success(`Formulário "${name}" criado a partir do template`);
      setSelected(null);
    } catch (e: any) {
      toast.error('Erro ao criar formulário: ' + e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <LayoutGrid className="h-6 w-6 text-primary" />
          Templates de Formulário
        </h1>
        <p className="text-muted-foreground mt-1">
          Comece em 1 clique. Formulários prontos pra captar, qualificar e diagnosticar — campos e scoring já configurados.
        </p>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Button
            key={c}
            variant={filter === c ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(c)}
          >
            {c === 'todos' ? 'Todos' : meta(c).label}
          </Button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-12 flex justify-center text-muted-foreground">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="py-12 text-center text-muted-foreground">Nenhum template nesta categoria.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => {
            const m = meta(t.category || 'general');
            return (
              <Card
                key={t.id}
                className="overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
                onClick={() => openTemplate(t)}
              >
                <div className={cn('h-32 bg-gradient-to-br flex items-center justify-center text-6xl', m.gradient)}>
                  {m.icon}
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="secondary" className="text-[10px] mb-1">{m.label}</Badge>
                      <h3 className="font-semibold text-base leading-tight">{t.name}</h3>
                    </div>
                    <Sparkles className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t">
                    <span className="flex items-center gap-1"><FileText className="h-3 w-3" /> {blockCount(t)} campos</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <div className={cn(
                  'h-24 -mx-6 -mt-6 mb-2 bg-gradient-to-br flex items-center justify-center text-5xl',
                  meta(selected.category || 'general').gradient,
                )}>
                  {meta(selected.category || 'general').icon}
                </div>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Nome do seu formulário</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label>Produto vinculado</Label>
                  <Select value={productId} onValueChange={setProductId}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>
                      {(products || []).map((p: any) => (
                        <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>Cancelar</Button>
                <Button onClick={handleClone} disabled={createForm.isPending || !productId} className="gap-2">
                  {createForm.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Rocket className="h-4 w-4" />}
                  Usar este template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
