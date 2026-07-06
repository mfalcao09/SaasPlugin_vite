import { useCallback, useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  FunnelBlock, FunnelBlockType, createDefaultBlock,
} from '@/types/funnel';
import { supabase } from '@/integrations/supabase/client';
import {
  PlatformCrmQuizCategorizedPalette,
  applyPlatformCrmQuizPresetToBlockData,
  type PlatformCrmQuizPaletteItem,
} from '../PlatformCrmQuizCategorizedPalette';
import { PlatformCrmQuizStepsSidebar } from './PlatformCrmQuizStepsSidebar';
import { PlatformCrmQuizLiveCanvas } from './PlatformCrmQuizLiveCanvas';
import { PlatformCrmQuizInspector } from './PlatformCrmQuizInspector';
import type { PlatformCrmCaptureFunnel } from '@/components/superadmin/crm/data/usePlatformCrmCaptureFunnels';

/**
 * CRM de PLATAFORMA (super_admin) — Builder estilo Inlead do QuizBuilder, DESACOPLADO do tenant.
 * Porte de `admin/capture/quiz/builder/QuizBuilderShell.tsx`.
 *
 * Adaptação de save (vs. `useSaveFlowBlocks` de tenant):
 *   - grava APENAS `platform_crm_capture_funnels.flow_blocks` + `start_block_id` via mutation
 *     inline SILENCIOSA (auto-save não deve disparar toast a cada 1.2s). Sem organization_id.
 *   - invalida a query ['platform-crm','capture-funnels'] (mesma chave dos hooks de plataforma).
 */

interface Props { funnel: PlatformCrmCaptureFunnel; }

const PLATFORM_CRM_KEY = 'platform-crm';

/** Save silencioso de flow_blocks + start_block_id (auto-save do builder). */
function useSavePlatformCrmQuizFlowBlocks() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      flow_blocks: FunnelBlock[];
      start_block_id: string | null;
    }) => {
      const { error } = await supabase
        .from('platform_crm_capture_funnels')
        .update({
          flow_blocks: input.flow_blocks as any,
          start_block_id: input.start_block_id,
        })
        .eq('id', input.id);
      if (error) throw error;
    },
    onSuccess: (_data, vars) => {
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnels'] });
      queryClient.invalidateQueries({ queryKey: [PLATFORM_CRM_KEY, 'capture-funnel', vars.id] });
    },
  });
}

function findBestStartBlock(blocks: FunnelBlock[], current: string | null): string | null {
  if (current && blocks.some((b) => b.id === current)) return current;
  if (blocks.length === 0) return null;
  const targeted = new Set(
    blocks.flatMap((b) =>
      [
        b.next_block_id,
        b.data.true_next_block_id,
        b.data.false_next_block_id,
        ...(b.data.options?.map((o) => o.next_block_id) || []),
      ].filter(Boolean),
    ),
  );
  const orphans = blocks.filter((b) => !targeted.has(b.id));
  return (orphans[0] || blocks[0]).id;
}

function relinkSequence(ordered: FunnelBlock[], all: FunnelBlock[]): FunnelBlock[] {
  return all.map((b) => {
    const idx = ordered.findIndex((o) => o.id === b.id);
    if (idx === -1) return b;
    const next = ordered[idx + 1];
    const hasBranching = (b.data.options || []).some((o) => o.next_block_id);
    if (hasBranching) return b;
    return { ...b, next_block_id: next?.id || null };
  });
}

/**
 * Builder estilo Inlead em 4 colunas:
 * [Etapas] [Paleta] [Canvas ao vivo] [Inspector com 3 abas]
 */
export function PlatformCrmQuizBuilderShell({ funnel }: Props) {
  const [blocks, setBlocks] = useState<FunnelBlock[]>((funnel.flow_blocks as unknown as FunnelBlock[]) || []);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [startBlockId, setStartBlockId] = useState<string | null>(
    () => findBestStartBlock((funnel.flow_blocks as unknown as FunnelBlock[]) || [], funnel.start_block_id || null),
  );
  const [isDirty, setIsDirty] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<Date | null>(null);
  const saveFlow = useSavePlatformCrmQuizFlowBlocks();

  // Auto-save
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (!isDirty) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      let validStart = startBlockId;
      if (!validStart || !blocks.some((b) => b.id === validStart)) {
        validStart = findBestStartBlock(blocks, null);
      }
      try {
        await saveFlow.mutateAsync({ id: funnel.id, flow_blocks: blocks, start_block_id: validStart });
        setIsDirty(false);
        setLastSavedAt(new Date());
      } catch { /* hook trata */ }
    }, 1200);
    return () => { if (saveTimer.current) clearTimeout(saveTimer.current); };
  }, [blocks, startBlockId, isDirty, funnel.id, saveFlow]);

  const selectedBlock = selectedBlockId ? blocks.find((b) => b.id === selectedBlockId) : null;

  // ───── Ações ─────
  const createFromPalette = useCallback((item: PlatformCrmQuizPaletteItem) => {
    const base = createDefaultBlock(item.blockType as FunnelBlockType, { x: 0, y: 0 });
    base.data = applyPlatformCrmQuizPresetToBlockData(item.preset, base.data) as any;
    return base;
  }, []);

  const insertAtEnd = useCallback((nb: FunnelBlock) => {
    setBlocks((prev) => {
      // ordena pela cadeia
      const byId = new Map(prev.map((b) => [b.id, b]));
      const visited = new Set<string>();
      const ordered: FunnelBlock[] = [];
      let cur = startBlockId ? byId.get(startBlockId) : prev[0];
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id); ordered.push(cur);
        cur = cur.next_block_id ? byId.get(cur.next_block_id) : undefined;
      }
      prev.forEach((b) => { if (!visited.has(b.id)) ordered.push(b); });
      const nextOrdered = [...ordered, nb];
      return relinkSequence(nextOrdered, [...prev, nb]);
    });
    setSelectedBlockId(nb.id);
    setIsDirty(true);
    if (blocks.length === 0) setStartBlockId(nb.id);
  }, [blocks.length, startBlockId]);

  const handleAddFromPalette = useCallback((item: PlatformCrmQuizPaletteItem) => {
    insertAtEnd(createFromPalette(item));
  }, [createFromPalette, insertAtEnd]);

  const handleAddStep = useCallback(() => {
    const nb = createDefaultBlock('buttons', { x: 0, y: 0 });
    nb.data = applyPlatformCrmQuizPresetToBlockData('single', nb.data) as any;
    nb.data.content = 'Nova pergunta';
    insertAtEnd(nb);
  }, [insertAtEnd]);

  const handleUpdateBlock = useCallback((blockId: string, updates: Partial<FunnelBlock>) => {
    setBlocks((prev) => prev.map((b) => (b.id === blockId ? { ...b, ...updates } : b)));
    setIsDirty(true);
  }, []);

  const handleDeleteBlock = useCallback((blockId: string) => {
    setBlocks((prev) => {
      const deleted = prev.find((b) => b.id === blockId);
      return prev
        .filter((b) => b.id !== blockId)
        .map((b) =>
          b.next_block_id === blockId ? { ...b, next_block_id: deleted?.next_block_id || null } : b,
        );
    });
    if (selectedBlockId === blockId) setSelectedBlockId(null);
    if (startBlockId === blockId) {
      const remaining = blocks.filter((b) => b.id !== blockId);
      setStartBlockId(findBestStartBlock(remaining, null));
    }
    setIsDirty(true);
  }, [selectedBlockId, startBlockId, blocks]);

  const handleDuplicateBlock = useCallback((blockId: string) => {
    const b = blocks.find((x) => x.id === blockId);
    if (!b) return;
    const nb = createDefaultBlock(b.type, { x: 0, y: 0 });
    nb.data = JSON.parse(JSON.stringify(b.data));
    insertAtEnd(nb);
  }, [blocks, insertAtEnd]);

  const handleSetStart = useCallback((id: string) => {
    setStartBlockId(id);
    setIsDirty(true);
  }, []);

  const handleReorder = useCallback((src: number, tgt: number) => {
    setBlocks((prev) => {
      const byId = new Map(prev.map((b) => [b.id, b]));
      const visited = new Set<string>();
      const ordered: FunnelBlock[] = [];
      let cur = startBlockId ? byId.get(startBlockId) : prev[0];
      while (cur && !visited.has(cur.id)) {
        visited.add(cur.id); ordered.push(cur);
        cur = cur.next_block_id ? byId.get(cur.next_block_id) : undefined;
      }
      prev.forEach((b) => { if (!visited.has(b.id)) ordered.push(b); });

      const [moved] = ordered.splice(src, 1);
      const adjusted = tgt > src ? tgt - 1 : tgt;
      ordered.splice(adjusted, 0, moved);
      return relinkSequence(ordered, prev);
    });
    setIsDirty(true);
  }, [startBlockId]);

  const handleConnect = useCallback((srcId: string, tgtId: string | null) => {
    setBlocks((prev) => prev.map((b) => (b.id === srcId ? { ...b, next_block_id: tgtId } : b)));
    setIsDirty(true);
  }, []);

  // ───── Layout 4 colunas ─────
  const saveIndicator = saveFlow.isPending ? (
    <span className="flex items-center gap-1 text-xs text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Salvando...</span>
  ) : isDirty ? (
    <span className="text-xs text-amber-600 dark:text-amber-400">Auto-save…</span>
  ) : lastSavedAt ? (
    <span className="flex items-center gap-1 text-xs text-muted-foreground"><CheckCircle2 className="h-3 w-3 text-green-600" /> Salvo</span>
  ) : null;

  return (
    <div className="h-[calc(100vh-110px)] flex flex-col">
      <div className="relative flex-1 min-h-0 flex gap-2 rounded-lg border bg-muted/20 p-2">
        {saveIndicator && (
          <div className="absolute top-1 right-2 z-10 pointer-events-none">{saveIndicator}</div>
        )}
        {/* Etapas */}
        <div className="w-56 shrink-0 rounded-md border bg-card overflow-hidden">
          <PlatformCrmQuizStepsSidebar
            blocks={blocks}
            startBlockId={startBlockId}
            selectedBlockId={selectedBlockId}
            onSelect={setSelectedBlockId}
            onAddStep={handleAddStep}
            onDelete={handleDeleteBlock}
            onDuplicate={handleDuplicateBlock}
            onSetStart={handleSetStart}
            onReorder={handleReorder}
          />
        </div>

        {/* Paleta */}
        <div className="w-52 shrink-0 rounded-md border bg-card overflow-hidden">
          <PlatformCrmQuizCategorizedPalette onAddBlock={handleAddFromPalette} />
        </div>

        {/* Canvas */}
        <div className="flex-1 min-w-0 rounded-md border overflow-hidden">
          <PlatformCrmQuizLiveCanvas
            funnel={funnel}
            blocks={blocks}
            selectedBlockId={selectedBlockId}
            startBlockId={startBlockId}
            onSelectBlock={setSelectedBlockId}
            onDuplicateBlock={handleDuplicateBlock}
            onDeleteBlock={handleDeleteBlock}
            onDropPaletteItem={handleAddFromPalette}
          />
        </div>

        {/* Inspector */}
        <div className="w-[340px] shrink-0 rounded-md border bg-card overflow-hidden flex flex-col">
          <div className="px-3 py-2 border-b shrink-0 flex items-center justify-between">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {selectedBlock ? 'Propriedades' : 'Nenhuma seleção'}
            </span>
          </div>
          <div className="flex-1 min-h-0">
            <PlatformCrmQuizInspector
              block={selectedBlock || null}
              blocks={blocks}
              startBlockId={startBlockId}
              onUpdate={handleUpdateBlock}
              onConnect={handleConnect}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
