import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, Loader2, MousePointerClick, Workflow, Trash2 } from 'lucide-react';
import { FunnelBlock, FunnelBlockType, createDefaultBlock, getPaletteItem } from '@/types/funnel';
import { useUpdatePlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import type { PlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';
import type { TablesUpdate } from '@/integrations/supabase/types';
import { PlatformCrmWidgetBlockPalette } from './PlatformCrmWidgetBlockPalette';

interface Props { funnel: PlatformCrmCaptureFunnel; }

function findBestStartBlock(blocks: FunnelBlock[], currentStartId: string | null): string | null {
  if (currentStartId && blocks.some(b => b.id === currentStartId)) return currentStartId;
  if (blocks.length === 0) return null;
  const targetedIds = new Set(
    blocks.flatMap(b => [
      b.next_block_id,
      b.data.true_next_block_id,
      b.data.false_next_block_id,
      ...(b.data.options?.map(o => o.next_block_id) || []),
      ...(b.data.ai_outputs?.map(o => o.next_block_id) || []),
    ].filter(Boolean))
  );
  const orphans = blocks.filter(b => !targetedIds.has(b.id));
  const pool = orphans.length > 0 ? orphans : blocks;
  const sorted = [...pool].sort((a, b) => a.position.y - b.position.y || a.position.x - b.position.x);
  return sorted[0]?.id || null;
}

export function PlatformCrmWidgetFlowTab({ funnel }: Props) {
  // flow_blocks/start_block_id são Json/nullable na Row — cast para os tipos ricos.
  const initialBlocks = (funnel.flow_blocks as unknown as FunnelBlock[]) || [];
  const [blocks, setBlocks] = useState<FunnelBlock[]>(initialBlocks);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [startBlockId, setStartBlockId] = useState<string | null>(
    () => findBestStartBlock(initialBlocks, funnel.start_block_id || null)
  );
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const updateFunnel = useUpdatePlatformCrmCaptureFunnel();
  const selectedBlock = blocks.find(b => b.id === selectedBlockId);

  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty) return;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(async () => {
      let validStart = startBlockId;
      if (!validStart || !blocks.some(b => b.id === validStart)) {
        validStart = findBestStartBlock(blocks, null);
      }
      try {
        await updateFunnel.mutateAsync({
          id: funnel.id,
          flow_blocks: blocks as unknown as TablesUpdate<'platform_crm_capture_funnels'>['flow_blocks'],
          start_block_id: validStart,
        });
        setIsDirty(false);
        setLastSavedAt(new Date());
      } catch { /* hook trata toast */ }
    }, 1500);
    return () => { if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current); };
  }, [blocks, startBlockId, isDirty, funnel.id, updateFunnel]);

  const handleAddBlock = useCallback((type: FunnelBlockType, position?: { x: number; y: number }) => {
    const pos = position || { x: 100 + (blocks.length % 3) * 280, y: 100 + Math.floor(blocks.length / 3) * 150 };
    const newBlock = createDefaultBlock(type, pos);
    setBlocks(prev => {
      const updated = [...prev];
      if (updated.length > 0) {
        const last = updated[updated.length - 1];
        if (!last.next_block_id) updated[updated.length - 1] = { ...last, next_block_id: newBlock.id };
      }
      return [...updated, newBlock];
    });
    setSelectedBlockId(newBlock.id);
    setIsDirty(true);
    if (blocks.length === 0) setStartBlockId(newBlock.id);
  }, [blocks.length]);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setBlocks(prev => {
      const deleted = prev.find(b => b.id === blockId);
      return prev.filter(b => b.id !== blockId).map(b =>
        b.next_block_id === blockId ? { ...b, next_block_id: deleted?.next_block_id || null } : b
      );
    });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    if (startBlockId === blockId) {
      const remaining = blocks.filter(b => b.id !== blockId);
      setStartBlockId(findBestStartBlock(remaining, null));
    }
    setIsDirty(true);
  }, [selectedBlockId, startBlockId, blocks]);

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col gap-2">
      <div className="flex items-center justify-end gap-2 text-xs text-muted-foreground h-5">
        {updateFunnel.isPending ? (
          <><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</>
        ) : isDirty ? (
          <span className="text-amber-600 dark:text-amber-400">Alterações pendentes — auto-save em 1.5s</span>
        ) : lastSavedAt ? (
          <><CheckCircle2 className="h-3 w-3 text-green-600" /> Salvo automaticamente</>
        ) : null}
      </div>

      <div className="flex gap-4 flex-1 min-h-0">
        <Card className="w-56 flex-shrink-0 overflow-hidden">
          <PlatformCrmWidgetBlockPalette onAddBlock={handleAddBlock} />
        </Card>

        {/* Canvas visual (FlowCanvas/FunnelBlockEditor) — porte profundo pendente (TODO edge).
            Enquanto isso, a lista de blocos permite add (paleta) / seleção / exclusão e auto-save. */}
        <Card className="flex-1 relative overflow-hidden">
          <CardContent className="p-4 h-full overflow-auto">
            {blocks.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <Workflow className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Arraste ou clique nos blocos da paleta para montar o fluxo do widget.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {blocks.map((b, i) => {
                  const item = getPaletteItem(b.type);
                  const isStart = b.id === startBlockId;
                  return (
                    <div
                      key={b.id}
                      onClick={() => setSelectedBlockId(b.id)}
                      className={`flex items-center justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        selectedBlockId === b.id ? 'border-primary bg-primary/5' : 'hover:border-primary/50'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-xs text-muted-foreground w-5">{i + 1}</span>
                        <span className="text-lg">{item?.icon}</span>
                        <div className="min-w-0">
                          <p className="text-sm font-medium truncate">{item?.label || b.type}</p>
                          <p className="text-[11px] text-muted-foreground truncate">
                            {b.data.content || b.data.placeholder || item?.description}
                          </p>
                        </div>
                        {isStart && <Badge variant="outline" className="text-[10px]">Início</Badge>}
                      </div>
                      <button
                        type="button"
                        className="text-muted-foreground hover:text-destructive transition-colors shrink-0"
                        onClick={(e) => { e.stopPropagation(); handleDeleteBlock(b.id); }}
                        aria-label="Remover bloco"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="w-72 flex-shrink-0">
          <CardContent className="p-4 h-full">
            {selectedBlock ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{getPaletteItem(selectedBlock.type)?.icon}</span>
                  <p className="text-sm font-semibold">{getPaletteItem(selectedBlock.type)?.label || selectedBlock.type}</p>
                </div>
                <p className="text-xs text-muted-foreground">
                  O editor visual detalhado de blocos (FunnelBlockEditor) será liberado num próximo porte.
                  Por ora, use a paleta para compor o fluxo e defina o conteúdo pelo canal público.
                </p>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center">
                <div className="w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-3">
                  <MousePointerClick className="h-5 w-5 text-muted-foreground" />
                </div>
                <p className="text-sm text-muted-foreground">
                  Selecione um bloco para editar suas propriedades
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
