import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  LayoutGrid,
  Sparkles,
  Clock,
  ListChecks,
  Rocket,
  Loader2,
  FileText,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import {
  usePlatformCrmQuizTemplates,
  useCreatePlatformCrmFunnelFromQuizTemplate,
  PlatformCrmQuizTemplate,
} from '@/components/superadmin/crm/data/usePlatformCrmQuizTemplates';
import {
  usePlatformCrmFormTemplates,
  PlatformCrmFormTemplate,
} from '@/components/superadmin/crm/data/usePlatformCrmForms';
import { useCreatePlatformCrmFormFromTemplate } from '@/components/superadmin/crm/data/usePlatformCrmCaptureOps';

/**
 * CRM de PLATAFORMA (super_admin) — TEMPLATES de captação (porte 1:1 do
 * `CaptureTemplatesSection` do CRM original), desacoplado do tenant.
 *
 * Fontes: `platform_crm_quiz_templates` (via usePlatformCrmQuizTemplates) e
 * `platform_crm_form_templates` (via usePlatformCrmFormTemplates).
 *
 * Adaptações vs original:
 * - Templates de quiz vêm do DB (tabela platform) em vez do array estático
 *   `QUIZ_TEMPLATES` de `data/quizTemplates.ts`; `CATEGORY_LABELS` portado como
 *   mapa local com fallback para categorias novas.
 * - Sem seletor "Produto vinculado" no modal de clone (plataforma não tem produtos;
 *   o funil criado é global, distribuição configurada depois).
 * - Seção extra "Templates de Formulário" usa `useCreatePlatformCrmFormFromTemplate`
 *   já existente (cobre os templates de captação além do quiz).
 */

const CATEGORY_LABELS: Record<string, string> = {
  captacao: 'Captação',
  diagnostico: 'Diagnóstico',
  negocios: 'Negócios',
  nichos: 'Nichos',
  qualificacao: 'Qualificação',
  recomendacao: 'Recomendação',
  educacional: 'Educacional',
};

const categoryLabel = (c: string) =>
  CATEGORY_LABELS[c] ?? c.charAt(0).toUpperCase() + c.slice(1);

export function PlatformCrmCaptureTemplatesTab() {
  const [filter, setFilter] = useState<string>('todos');
  const [selected, setSelected] = useState<PlatformCrmQuizTemplate | null>(null);
  const [name, setName] = useState('');
  const [selectedForm, setSelectedForm] = useState<PlatformCrmFormTemplate | null>(null);
  const [formName, setFormName] = useState('');

  const { data: templates, isLoading } = usePlatformCrmQuizTemplates();
  const { data: formTemplates, isLoading: isLoadingForms } = usePlatformCrmFormTemplates();
  const createFromTemplate = useCreatePlatformCrmFunnelFromQuizTemplate();
  const createFormFromTemplate = useCreatePlatformCrmFormFromTemplate();

  const categories = useMemo(() => {
    const set = new Set((templates ?? []).map((t) => t.category));
    return ['todos', ...Array.from(set)];
  }, [templates]);

  const filtered =
    filter === 'todos'
      ? (templates ?? [])
      : (templates ?? []).filter((t) => t.category === filter);

  const openTemplate = (t: PlatformCrmQuizTemplate) => {
    setSelected(t);
    setName(t.name);
  };

  const handleClone = async () => {
    if (!selected) return;
    if (!name.trim()) {
      toast.error('Dê um nome ao quiz');
      return;
    }
    try {
      await createFromTemplate.mutateAsync({ name: name.trim(), template: selected });
      toast.success(`Quiz "${name.trim()}" criado a partir do template`);
      setSelected(null);
    } catch (e: any) {
      toast.error('Erro ao clonar template: ' + e.message);
    }
  };

  const handleCloneForm = async () => {
    if (!selectedForm) return;
    if (!formName.trim()) {
      toast.error('Dê um nome ao formulário');
      return;
    }
    try {
      await createFormFromTemplate.mutateAsync({
        name: formName.trim(),
        template: selectedForm,
      });
      setSelectedForm(null);
    } catch {
      // erros já tratados no onError do hook
    }
  };

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <LayoutGrid className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-semibold">Templates de Quiz</h1>
          <p className="text-sm text-muted-foreground">
            Comece em 1 clique. Quizzes prontos com perguntas, scoring, ramificação e
            resultado já configurados.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => (
          <Button
            key={c}
            variant={filter === c ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilter(c)}
            className="capitalize"
          >
            {c === 'todos' ? 'Todos' : categoryLabel(c)}
          </Button>
        ))}
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum template de quiz cadastrado na plataforma ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((t) => (
            <Card
              key={t.id}
              className="overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
              onClick={() => openTemplate(t)}
            >
              <div
                className={cn(
                  'h-32 bg-gradient-to-br flex items-center justify-center text-6xl',
                  t.cover_gradient ?? 'from-primary/20 to-primary/5',
                )}
              >
                {t.icon ?? '🧩'}
              </div>
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Badge variant="secondary" className="text-[10px] mb-1">
                      {categoryLabel(t.category)}
                    </Badge>
                    <h3 className="font-semibold text-base leading-tight">{t.name}</h3>
                  </div>
                  <Sparkles className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t tabular-nums">
                  {t.estimated_time && (
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" /> {t.estimated_time}
                    </span>
                  )}
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-3 w-3" /> {t.question_count} perguntas
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Templates de formulário */}
      <div className="flex items-center gap-3 pt-4">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <FileText className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Templates de Formulário</h2>
          <p className="text-sm text-muted-foreground">
            Formulários de captação prontos (blocos, tema e configurações incluídos).
          </p>
        </div>
      </div>

      {isLoadingForms ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : (formTemplates ?? []).length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum template de formulário cadastrado na plataforma ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {(formTemplates ?? []).map((t) => (
            <Card
              key={t.id}
              className="hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
              onClick={() => {
                setSelectedForm(t);
                setFormName(t.name);
              }}
            >
              <CardContent className="p-4 space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    {t.category && (
                      <Badge variant="secondary" className="text-[10px] mb-1">
                        {categoryLabel(t.category)}
                      </Badge>
                    )}
                    <h3 className="font-semibold text-base leading-tight">{t.name}</h3>
                  </div>
                  <Sparkles className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t tabular-nums">
                  <span className="flex items-center gap-1">
                    <ListChecks className="h-3 w-3" />
                    {Array.isArray(t.blocks) ? t.blocks.length : 0} blocos
                  </span>
                  <span className="flex items-center gap-1">
                    <Rocket className="h-3 w-3" /> {t.usage_count ?? 0} usos
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Modal clone de quiz */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-md">
          {selected && (
            <>
              <DialogHeader>
                <div
                  className={cn(
                    'h-24 -mx-6 -mt-6 mb-2 bg-gradient-to-br flex items-center justify-center text-5xl',
                    selected.cover_gradient ?? 'from-primary/20 to-primary/5',
                  )}
                >
                  {selected.icon ?? '🧩'}
                </div>
                <DialogTitle>{selected.name}</DialogTitle>
                <DialogDescription>{selected.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Nome do seu quiz</Label>
                  <Input value={name} onChange={(e) => setName(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleClone}
                  disabled={createFromTemplate.isPending || !name.trim()}
                  className="gap-2"
                >
                  {createFromTemplate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
                  Usar este template
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>

      {/* Modal clone de formulário */}
      <Dialog open={!!selectedForm} onOpenChange={(open) => !open && setSelectedForm(null)}>
        <DialogContent className="max-w-md">
          {selectedForm && (
            <>
              <DialogHeader>
                <DialogTitle>{selectedForm.name}</DialogTitle>
                <DialogDescription>{selectedForm.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Nome do seu formulário</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedForm(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCloneForm}
                  disabled={createFormFromTemplate.isPending || !formName.trim()}
                  className="gap-2"
                >
                  {createFormFromTemplate.isPending ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Rocket className="h-4 w-4" />
                  )}
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
