import { useMemo, useState, type ReactNode } from 'react';
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  LayoutGrid,
  Sparkles,
  Clock,
  ListChecks,
  Rocket,
  Loader2,
  FileText,
  Search,
  MessageSquare,
  MousePointerClick,
  MessageCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import {
  useCreatePlatformCrmCaptureFunnel,
  type PlatformCrmCaptureFunnelInsert,
} from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import { type PlatformCrmFormTemplate } from '@/components/superadmin/crm/data/usePlatformCrmForms';
import { useCreatePlatformCrmFormFromTemplate } from '@/components/superadmin/crm/data/usePlatformCrmCaptureOps';
import { PlatformCrmCaptureProductField } from '../PlatformCrmCaptureProductField';
import {
  CATEGORY_LABELS,
  BADGE_LABELS,
  type QuizTemplate,
  type QuizBadge,
} from './platformQuizTemplates';
import {
  usePlatformCaptureTemplateLibrary,
  usePlatformCaptureFormTemplateLibrary,
  clonePlatformFlowBlocks,
} from './usePlatformCaptureTemplateLibrary';
import { PlatformCrmQuizCreateWithAI } from './create/PlatformCrmQuizCreateWithAI';

/**
 * CRM de PLATAFORMA (super_admin) — Biblioteca de Templates de captação.
 *
 * Porte FIEL do `QuizTemplateLibrary` + `FormTemplatesSection` (tenant/Vendus),
 * PRODUCT-scoped e sem `organization_id`. Traz o seed estático clonável do tenant
 * (o gallery de DB começava vazio) somado aos templates de DB da plataforma.
 *
 * Data-layer trocado para os hooks PLATFORM:
 * - Quiz: `usePlatformCaptureTemplateLibrary` (seed + DB) + `useCreatePlatformCrmCaptureFunnel`
 *   (semeia `flow_blocks` clonados + `start_block_id`).
 * - Formulário: `usePlatformCrmFormTemplates` + `useCreatePlatformCrmFormFromTemplate`.
 * - Produto ativo GLOBAL via `useActivePlatformProduct`/`effectiveProductId` (D3 F2);
 *   o funil/form nasce carimbado no produto ativo.
 * - IA: `PlatformCrmQuizCreateWithAI` (edge `platform-quiz-generate-ai`).
 *
 * Linguagem visual lux das telas platform vizinhas (header com ícone em bloco,
 * grid de cards com hover-lift, badges tabular-nums nos metadados).
 */

// form_templates não traz ícone/gradiente — mapeamos por categoria (estilo quiz),
// espelhando o `CATEGORY_META` do FormTemplatesSection (tenant).
const FORM_CATEGORY_META: Record<string, { label: string; icon: string; gradient: string }> = {
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

function formMeta(category?: string | null) {
  return FORM_CATEGORY_META[category || 'general'] || FORM_CATEGORY_META.general;
}

/**
 * Seção de ferramenta que ainda não tem templates prontos (chatbot/widget/whatsapp).
 * Empty-state honesto ("Em breve") — sem inventar dados.
 */
function ComingSoonToolSection({
  icon,
  title,
  subtitle,
}: {
  icon: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3 pt-4 border-t">
        <div className="h-12 w-12 rounded-xl bg-muted text-muted-foreground flex items-center justify-center">
          {icon}
        </div>
        <div>
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
      </div>
      <Card className="border-dashed">
        <CardContent className="py-10 text-center text-sm text-muted-foreground">
          Em breve — nenhum template de {title.toLowerCase()} disponível ainda.
        </CardContent>
      </Card>
    </div>
  );
}

export function PlatformCrmCaptureTemplatesLibrary() {
  const { products, effectiveProductId } = useActivePlatformProduct();

  // ── Quiz ──────────────────────────────────────────────────────────────────
  const { templates, isLoading } = usePlatformCaptureTemplateLibrary();
  const createFunnel = useCreatePlatformCrmCaptureFunnel();

  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string>('all');
  const [badge, setBadge] = useState<string>('all');
  const [selected, setSelected] = useState<QuizTemplate | null>(null);
  const [name, setName] = useState('');
  const [productId, setProductId] = useState('');
  const [aiOpen, setAiOpen] = useState(false);

  const filtered = useMemo(
    () =>
      templates.filter((t) => {
        const q = query.trim().toLowerCase();
        if (q && !t.name.toLowerCase().includes(q) && !t.description.toLowerCase().includes(q))
          return false;
        if (category !== 'all' && t.category !== category) return false;
        if (badge !== 'all' && !(t.badges || []).includes(badge as QuizBadge)) return false;
        return true;
      }),
    [templates, query, category, badge],
  );

  const openTemplate = (t: QuizTemplate) => {
    setSelected(t);
    setName(t.name);
    setProductId(effectiveProductId ?? '');
  };

  const productReady = products.length === 0 || !!productId;

  const handleClone = async () => {
    if (!selected) return;
    if (!name.trim()) {
      toast.error('Dê um nome ao quiz');
      return;
    }
    if (!productReady) {
      toast.error('Selecione um produto');
      return;
    }
    try {
      const cloned = clonePlatformFlowBlocks(selected.flow_blocks);
      await createFunnel.mutateAsync({
        name: name.trim(),
        description: selected.description,
        channel_type: 'quiz',
        product_id: productId || null,
        flow_blocks: cloned as unknown as PlatformCrmCaptureFunnelInsert['flow_blocks'],
        start_block_id: cloned[0]?.id ?? null,
      });
      toast.success(`Quiz "${name.trim()}" criado a partir do template`);
      setSelected(null);
    } catch (e: any) {
      toast.error('Erro ao clonar template: ' + e.message);
    }
  };

  // ── Formulário ──────────────────────────────────────────────────────────────
  // MESMA fonte da galeria (seed + DB), espelhando o quiz: garante que os templates
  // de formulário nunca sumam quando a tabela de DB está vazia.
  const { templates: formTemplates, isLoading: isLoadingForms } =
    usePlatformCaptureFormTemplateLibrary();
  const createFormFromTemplate = useCreatePlatformCrmFormFromTemplate();

  const [formFilter, setFormFilter] = useState<string>('todos');
  const [selectedForm, setSelectedForm] = useState<PlatformCrmFormTemplate | null>(null);
  const [formName, setFormName] = useState('');
  const [formProductId, setFormProductId] = useState('');

  const formList = (formTemplates ?? []) as PlatformCrmFormTemplate[];
  const formCategories = [
    'todos',
    ...Array.from(new Set(formList.map((t) => t.category || 'general'))),
  ];
  const formFiltered =
    formFilter === 'todos'
      ? formList
      : formList.filter((t) => (t.category || 'general') === formFilter);

  const openForm = (t: PlatformCrmFormTemplate) => {
    setSelectedForm(t);
    setFormName(t.name);
    setFormProductId(effectiveProductId ?? '');
  };

  const formProductReady = products.length === 0 || !!formProductId;

  const handleCloneForm = async () => {
    if (!selectedForm) return;
    if (!formName.trim()) {
      toast.error('Dê um nome ao formulário');
      return;
    }
    if (!formProductReady) {
      toast.error('Selecione um produto');
      return;
    }
    try {
      await createFormFromTemplate.mutateAsync({
        name: formName.trim(),
        product_id: formProductId || null,
        template: selectedForm,
      });
      setSelectedForm(null);
    } catch {
      // erros já tratados no onError do hook
    }
  };

  const blockCount = (t: PlatformCrmFormTemplate) =>
    Array.isArray(t.blocks) ? t.blocks.length : 0;

  return (
    <div className="max-w-6xl mx-auto py-6 space-y-8">
      {/* Cabeçalho da página — galeria global de templates do módulo Automação */}
      <div>
        <h1 className="text-2xl font-semibold">Templates</h1>
        <p className="text-sm text-muted-foreground">
          Galeria de modelos prontos das ferramentas de captação. Escolha uma ferramenta,
          personalize e coloque no ar em 1 clique.
        </p>
      </div>

      {/* ── Ferramenta: QUIZ ──────────────────────────────────────────────── */}
      {/* Cabeçalho Quiz + ação IA */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <LayoutGrid className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold">Quiz</h2>
            <p className="text-sm text-muted-foreground">
              Comece em 1 clique. Quizzes prontos com perguntas, scoring, ramificação e
              resultado já configurados.
            </p>
          </div>
        </div>
        <Button onClick={() => setAiOpen(true)} className="gap-2 shrink-0">
          <Sparkles className="h-4 w-4" />
          Criar com IA
        </Button>
      </div>

      {/* Filtros: busca + categoria + etiqueta (port QuizTemplateLibrary) */}
      <div className="flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            className="pl-9"
            placeholder="Buscar template..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger className="w-full md:w-[200px]">
            <SelectValue placeholder="Categoria" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas categorias</SelectItem>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={badge} onValueChange={setBadge}>
          <SelectTrigger className="w-full md:w-[180px]">
            <SelectValue placeholder="Etiqueta" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas etiquetas</SelectItem>
            {Object.entries(BADGE_LABELS).map(([k, v]) => (
              <SelectItem key={k} value={k}>
                {v}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Grid de quiz */}
      {isLoading ? (
        <div className="py-12 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : filtered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            Nenhum template encontrado com os filtros atuais.
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
                      {CATEGORY_LABELS[t.category] ?? t.category}
                    </Badge>
                    <h3 className="font-semibold text-base leading-tight">{t.name}</h3>
                  </div>
                  <Sparkles className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                </div>
                <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                {(t.badges || []).length > 0 && (
                  <div className="flex flex-wrap gap-1">
                    {(t.badges || []).slice(0, 2).map((b) => (
                      <Badge key={b} variant="outline" className="text-[10px]">
                        {BADGE_LABELS[b] ?? b}
                      </Badge>
                    ))}
                  </div>
                )}
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

      {/* ── Ferramenta: FORMULÁRIO ────────────────────────────────────────── */}
      <div className="flex items-center gap-3 pt-4 border-t">
        <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          <FileText className="h-6 w-6" />
        </div>
        <div>
          <h2 className="text-xl font-semibold">Formulário</h2>
          <p className="text-sm text-muted-foreground">
            Formulários de captação prontos (blocos, tema e configurações incluídos).
          </p>
        </div>
      </div>

      {/* Filtros de formulário (deriva das categorias presentes, estilo quiz) */}
      {formList.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {formCategories.map((c) => (
            <Button
              key={c}
              variant={formFilter === c ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFormFilter(c)}
            >
              {c === 'todos' ? 'Todos' : formMeta(c).label}
            </Button>
          ))}
        </div>
      )}

      {isLoadingForms ? (
        <div className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : formFiltered.length === 0 ? (
        <Card className="border-dashed">
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            Nenhum template de formulário cadastrado na plataforma ainda.
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {formFiltered.map((t) => {
            const m = formMeta(t.category);
            return (
              <Card
                key={t.id}
                className="overflow-hidden hover:shadow-lg hover:-translate-y-0.5 transition-all cursor-pointer group"
                onClick={() => openForm(t)}
              >
                <div
                  className={cn(
                    'h-32 bg-gradient-to-br flex items-center justify-center text-6xl',
                    m.gradient,
                  )}
                >
                  {m.icon}
                </div>
                <CardContent className="p-4 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="secondary" className="text-[10px] mb-1">
                        {m.label}
                      </Badge>
                      <h3 className="font-semibold text-base leading-tight">{t.name}</h3>
                    </div>
                    <Sparkles className="h-4 w-4 text-primary opacity-0 group-hover:opacity-100 transition" />
                  </div>
                  <p className="text-xs text-muted-foreground line-clamp-2">{t.description}</p>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground pt-2 border-t tabular-nums">
                    <span className="flex items-center gap-1">
                      <ListChecks className="h-3 w-3" /> {blockCount(t)} campos
                    </span>
                    <span className="flex items-center gap-1">
                      <Rocket className="h-3 w-3" /> {t.usage_count ?? 0} usos
                    </span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── Ferramentas sem seed pronto ainda — empty-state honesto ───────── */}
      <ComingSoonToolSection
        icon={<MessageSquare className="h-6 w-6" />}
        title="ChatBot"
        subtitle="Fluxos de chatbot prontos para qualificar e distribuir leads."
      />
      <ComingSoonToolSection
        icon={<MousePointerClick className="h-6 w-6" />}
        title="Widget"
        subtitle="Widgets de captação embutíveis no site com temas prontos."
      />
      <ComingSoonToolSection
        icon={<MessageCircle className="h-6 w-6" />}
        title="WhatsApp"
        subtitle="Modelos de fluxo de captação e resposta pelo WhatsApp."
      />

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
                <PlatformCrmCaptureProductField
                  products={products}
                  value={productId}
                  onChange={setProductId}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelected(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleClone}
                  disabled={createFunnel.isPending || !name.trim() || !productReady}
                  className="gap-2"
                >
                  {createFunnel.isPending ? (
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
                <div
                  className={cn(
                    'h-24 -mx-6 -mt-6 mb-2 bg-gradient-to-br flex items-center justify-center text-5xl',
                    formMeta(selectedForm.category).gradient,
                  )}
                >
                  {formMeta(selectedForm.category).icon}
                </div>
                <DialogTitle>{selectedForm.name}</DialogTitle>
                <DialogDescription>{selectedForm.description}</DialogDescription>
              </DialogHeader>

              <div className="space-y-4 py-2">
                <div className="space-y-1.5">
                  <Label>Nome do seu formulário</Label>
                  <Input value={formName} onChange={(e) => setFormName(e.target.value)} />
                </div>
                <PlatformCrmCaptureProductField
                  products={products}
                  value={formProductId}
                  onChange={setFormProductId}
                />
              </div>

              <DialogFooter>
                <Button variant="outline" onClick={() => setSelectedForm(null)}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleCloneForm}
                  disabled={
                    createFormFromTemplate.isPending || !formName.trim() || !formProductReady
                  }
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

      {/* Criar com IA */}
      <PlatformCrmQuizCreateWithAI open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}
