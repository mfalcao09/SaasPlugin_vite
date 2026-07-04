import { useState, useCallback, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { ArrowLeft, Save, Eye, Smartphone, Monitor, Moon, Sun, PanelLeft, Settings2, Palette } from 'lucide-react';
import { toast } from 'sonner';
import {
  usePlatformCrmForm,
  usePlatformCrmFormBlocks,
  useUpdatePlatformCrmForm,
} from '@/components/superadmin/crm/data/usePlatformCrmForms';
import { usePlatformCrmSaveFormBlocks } from './usePlatformCrmSaveFormBlocks';
import {
  FormBlock,
  FormBlockType,
  FormTheme,
  Form,
  createFormBlock,
  parsePlatformForm,
  parsePlatformBlock,
} from './platformFormTypes';
import { PlatformCrmFormBlockPalette } from './PlatformCrmFormBlockPalette';
import { PlatformCrmFormCanvas } from './PlatformCrmFormCanvas';
import { PlatformCrmFormBlockEditor } from './PlatformCrmFormBlockEditor';
import { PlatformCrmFormLivePreview } from './PlatformCrmFormLivePreview';
import { PlatformCrmFormSettings } from './PlatformCrmFormSettings';
import { PlatformCrmFormPublish } from './PlatformCrmFormPublish';
import { PlatformCrmFormDesignPanel } from './PlatformCrmFormDesignPanel';
import { PlatformCrmFormThemeWrapper } from './PlatformCrmFormThemeWrapper';
import { useIsMobile } from '@/hooks/use-mobile';
import { cn } from '@/lib/utils';

/**
 * Porte de admin/forms/FormBuilder.tsx — CRM de PLATAFORMA (super_admin).
 * Adaptações:
 *  - useForm/useFormBlocks → usePlatformCrmForm/usePlatformCrmFormBlocks (retornam ROWS;
 *    convertidas via parsePlatformForm/parsePlatformBlock para o shape `Form`/`FormBlock`).
 *  - useSaveFormBlocks → usePlatformCrmSaveFormBlocks (local, `{formId, blocks}`).
 *  - useUpdateForm ({formId, updates}) → useUpdatePlatformCrmForm ({id, ...updates}) —
 *    call-sites adaptados (assinatura flat do hook de plataforma).
 *  - Aba "Respostas" (FormResponses/FormResponseDetail) NÃO portada — depende de
 *    submissions + CallWithAIDialog/cadences (superfície separada). Ver relatório.
 */

interface PlatformCrmFormBuilderProps {
  formId: string;
  onClose: () => void;
}

export function PlatformCrmFormBuilder({ formId, onClose }: PlatformCrmFormBuilderProps) {
  const { data: formRow, isLoading: isLoadingForm } = usePlatformCrmForm(formId);
  const { data: blockRows, isLoading: isLoadingBlocks } = usePlatformCrmFormBlocks(formId);
  const saveBlocks = usePlatformCrmSaveFormBlocks();
  const updateForm = useUpdatePlatformCrmForm();

  const form: Form | null = useMemo(
    () => (formRow ? parsePlatformForm(formRow) : null),
    [formRow],
  );
  const existingBlocks: FormBlock[] = useMemo(
    () => (blockRows ?? []).map(parsePlatformBlock),
    [blockRows],
  );

  const [blocks, setBlocks] = useState<FormBlock[]>([]);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState('build');
  const [hasChanges, setHasChanges] = useState(false);
  const [previewMode, setPreviewMode] = useState<'desktop' | 'mobile'>('desktop');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const isMobile = useIsMobile();
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [designOpen, setDesignOpen] = useState(false);

  // Auto-open editor sheet on mobile when a block is selected
  useEffect(() => {
    if (isMobile && selectedBlockId) setEditorOpen(true);
  }, [isMobile, selectedBlockId]);

  // Initialize blocks from existing data
  useEffect(() => {
    if (existingBlocks.length > 0 && blocks.length === 0) {
      setBlocks(existingBlocks);
    }
  }, [existingBlocks, blocks.length]);

  const selectedBlock = blocks.find((b) => b.id === selectedBlockId);

  const handleAddBlock = useCallback(
    (type: FormBlockType) => {
      const newBlock = createFormBlock(type, formId, blocks.length);
      setBlocks((prev) => [...prev, newBlock]);
      setSelectedBlockId(newBlock.id);
      setHasChanges(true);
    },
    [formId, blocks.length],
  );

  const handleDeleteBlock = useCallback(
    (blockId: string) => {
      setBlocks((prev) => prev.filter((b) => b.id !== blockId));
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null);
      }
      setHasChanges(true);
    },
    [selectedBlockId],
  );

  const handleUpdateBlocks = useCallback((newBlocks: FormBlock[]) => {
    setBlocks(newBlocks);
    setHasChanges(true);
  }, []);

  const handleUpdateBlock = useCallback((updatedBlock: FormBlock) => {
    setBlocks((prev) => prev.map((b) => (b.id === updatedBlock.id ? updatedBlock : b)));
    setHasChanges(true);
  }, []);

  const handleUpdateTheme = useCallback(
    (patch: Partial<FormTheme>) => {
      if (!form) return;
      const nextTheme = { ...(form.theme || {}), ...patch } as FormTheme;
      updateForm.mutate({ id: formId, theme: nextTheme as any });
    },
    [form, formId, updateForm],
  );

  const handleSave = async () => {
    try {
      await saveBlocks.mutateAsync({
        formId,
        blocks: blocks.map((b, i) => ({ ...b, order_index: i })),
      });
      setHasChanges(false);
      toast.success('Formulário salvo!');
    } catch (error) {
      toast.error('Erro ao salvar formulário');
    }
  };

  const handlePublish = async () => {
    await handleSave();
    await updateForm.mutateAsync({ id: formId, status: 'active' });
    toast.success('Formulário publicado!');
  };

  if (isLoadingForm || isLoadingBlocks) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-200px)]">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Formulário não encontrado</p>
        <Button variant="link" onClick={onClose}>
          Voltar
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 flex flex-col bg-background rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3 md:px-4 py-2 md:py-3 border-b bg-card">
        <div className="flex items-center gap-2 md:gap-4 min-w-0 flex-1">
          <Button variant="ghost" size="icon" onClick={onClose} className="shrink-0 h-9 w-9">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="min-w-0 flex-1">
            <h1 className="text-sm md:text-lg font-bold truncate">{form.name}</h1>
            <p className="text-[11px] text-muted-foreground truncate">
              {blocks.length} {blocks.length === 1 ? 'bloco' : 'blocos'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 md:gap-3 shrink-0">
          {hasChanges && (
            <Badge variant="secondary" className="animate-pulse hidden sm:inline-flex">
              Não salvo
            </Badge>
          )}
          <Button
            variant="outline"
            size="sm"
            onClick={handleSave}
            disabled={saveBlocks.isPending || !hasChanges}
            className="h-9 px-2 md:px-3"
          >
            <Save className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">{saveBlocks.isPending ? 'Salvando...' : 'Salvar'}</span>
          </Button>
          <Button
            size="sm"
            onClick={handlePublish}
            disabled={form.status === 'active' || saveBlocks.isPending}
            className="h-9 px-2 md:px-3"
          >
            <Eye className="h-4 w-4 md:mr-2" />
            <span className="hidden md:inline">
              {form.status === 'active' ? 'Publicado' : 'Publicar'}
            </span>
          </Button>
        </div>
      </div>

      {/* Mobile action bar — drawers for palette/editor/design */}
      {isMobile && (activeTab === 'build' || activeTab === 'preview') && (
        <div className="flex items-center gap-2 px-3 py-2 border-b bg-muted/30">
          {activeTab === 'build' && (
            <>
              <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setPaletteOpen(true)}>
                <PanelLeft className="h-4 w-4 mr-2" /> Blocos
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="flex-1 h-9"
                onClick={() => setEditorOpen(true)}
                disabled={!selectedBlock}
              >
                <Settings2 className="h-4 w-4 mr-2" />
                {selectedBlock ? 'Editar' : 'Selecione'}
              </Button>
            </>
          )}
          {activeTab === 'preview' && (
            <Button variant="outline" size="sm" className="flex-1 h-9" onClick={() => setDesignOpen(true)}>
              <Palette className="h-4 w-4 mr-2" /> Personalizar
            </Button>
          )}
        </div>
      )}

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col overflow-hidden">
        <div className="px-3 md:px-4 border-b bg-card overflow-x-auto">
          <TabsList className="h-12 bg-transparent p-0 gap-4 md:gap-6 w-max">
            <TabsTrigger
              value="build"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Construir
            </TabsTrigger>
            <TabsTrigger
              value="preview"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Design
            </TabsTrigger>
            <TabsTrigger
              value="settings"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Configurar
            </TabsTrigger>
            <TabsTrigger
              value="share"
              className="data-[state=active]:bg-transparent data-[state=active]:border-b-2 data-[state=active]:border-primary data-[state=active]:shadow-none rounded-none h-12 px-0"
            >
              Publicar
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Build Tab */}
        <TabsContent value="build" className="flex-1 min-h-0 flex overflow-hidden m-0 data-[state=inactive]:hidden">
          <div className="hidden md:flex">
            <PlatformCrmFormBlockPalette onDragStart={() => {}} onBlockClick={handleAddBlock} />
          </div>

          <PlatformCrmFormCanvas
            formId={formId}
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            onSelectBlock={setSelectedBlockId}
            onUpdateBlocks={handleUpdateBlocks}
            onAddBlock={handleAddBlock}
            onDeleteBlock={handleDeleteBlock}
            finalBlockId={(form.settings as any)?.final_block_id || null}
          />

          <div className="hidden md:flex">
            <PlatformCrmFormBlockEditor
              block={selectedBlock || null}
              allBlocks={blocks}
              form={form}
              onUpdate={handleUpdateBlock}
              onClose={() => setSelectedBlockId(null)}
            />
          </div>
        </TabsContent>

        {/* Design Tab — Live preview + visual controls */}
        <TabsContent
          value="preview"
          className="flex-1 flex flex-col md:flex-row overflow-hidden m-0 data-[state=inactive]:hidden"
        >
          <div className="flex-1 flex flex-col min-w-0">
            <div className="flex-shrink-0 flex items-center justify-center gap-4 py-3 border-b bg-muted/30">
              {/* Device Toggle */}
              <div className="flex items-center gap-1 bg-card rounded-lg p-1 border">
                <Button
                  variant={previewMode === 'desktop' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewMode('desktop')}
                >
                  <Monitor className="h-4 w-4" />
                </Button>
                <Button
                  variant={previewMode === 'mobile' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewMode('mobile')}
                >
                  <Smartphone className="h-4 w-4" />
                </Button>
              </div>
              {/* Theme Toggle */}
              <div className="flex items-center gap-1 bg-card rounded-lg p-1 border">
                <Button
                  variant={previewTheme === 'light' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewTheme('light')}
                >
                  <Sun className="h-4 w-4" />
                </Button>
                <Button
                  variant={previewTheme === 'dark' ? 'secondary' : 'ghost'}
                  size="sm"
                  onClick={() => setPreviewTheme('dark')}
                >
                  <Moon className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-auto bg-muted/50 flex items-start justify-center p-3 md:p-6">
              <div
                className={cn(
                  'bg-card rounded-xl shadow-2xl overflow-hidden transition-all w-full',
                  previewMode === 'mobile' ? 'md:w-[375px] max-w-[375px]' : 'max-w-2xl',
                  'min-h-[500px]',
                  previewTheme === 'dark' && 'dark',
                )}
              >
                <PlatformCrmFormThemeWrapper theme={form.theme}>
                  <PlatformCrmFormLivePreview
                    key={blocks.map((b) => b.id).join('-')}
                    form={form}
                    blocks={blocks}
                    theme={previewTheme}
                  />
                </PlatformCrmFormThemeWrapper>
              </div>
            </div>
          </div>
          <div className="hidden md:flex">
            <PlatformCrmFormDesignPanel form={form} onUpdateTheme={handleUpdateTheme} />
          </div>
        </TabsContent>

        {/* Settings Tab */}
        <TabsContent value="settings" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <PlatformCrmFormSettings
            form={form}
            blocks={blocks}
            onUpdate={(updates) => {
              updateForm.mutate({ id: formId, ...(updates as any) });
            }}
          />
        </TabsContent>

        {/* Share Tab */}
        <TabsContent value="share" className="flex-1 min-h-0 overflow-auto m-0 data-[state=inactive]:hidden">
          <PlatformCrmFormPublish form={form} />
        </TabsContent>
      </Tabs>

      {/* Mobile Drawers */}
      <Sheet open={paletteOpen} onOpenChange={setPaletteOpen}>
        <SheetContent side="left" className="p-0 w-[88vw] max-w-sm flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Blocos</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PlatformCrmFormBlockPalette
              onDragStart={() => {}}
              onBlockClick={(t) => {
                handleAddBlock(t);
                setPaletteOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={editorOpen} onOpenChange={setEditorOpen}>
        <SheetContent side="right" className="p-0 w-[92vw] max-w-md flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Editar bloco</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PlatformCrmFormBlockEditor
              block={selectedBlock || null}
              allBlocks={blocks}
              form={form}
              onUpdate={handleUpdateBlock}
              onClose={() => {
                setSelectedBlockId(null);
                setEditorOpen(false);
              }}
            />
          </div>
        </SheetContent>
      </Sheet>

      <Sheet open={designOpen} onOpenChange={setDesignOpen}>
        <SheetContent side="right" className="p-0 w-[92vw] max-w-md flex flex-col">
          <SheetHeader className="px-4 py-3 border-b">
            <SheetTitle>Personalizar</SheetTitle>
          </SheetHeader>
          <div className="flex-1 min-h-0 overflow-hidden">
            <PlatformCrmFormDesignPanel form={form} onUpdateTheme={handleUpdateTheme} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
