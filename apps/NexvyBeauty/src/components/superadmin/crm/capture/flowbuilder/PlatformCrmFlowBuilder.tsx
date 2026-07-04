import { useState, useCallback } from 'react';
import { FlowBlock, FlowBlockType, DEFAULT_BLOCK_DATA, CollectedVariable } from '@/types/chatFlow';
import { PlatformCrmFlowBlockPalette } from './PlatformCrmFlowBlockPalette';
import { PlatformCrmFlowCanvas } from './PlatformCrmFlowCanvas';
import { PlatformCrmFlowBlockEditor } from './PlatformCrmFlowBlockEditor';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Save, ArrowLeft } from 'lucide-react';
import {
  useSavePlatformCrmChatFlowBlocks,
  useTogglePlatformCrmChatFlowActive,
  PlatformCrmChatFlowParsed,
} from '@/components/superadmin/crm/data/usePlatformCrmChatFlows';

/**
 * Builder visual de fluxo do CRM de PLATAFORMA (super_admin) — DESACOPLADO do tenant.
 * Toca APENAS `platform_crm_chat_flows` via hooks de plataforma. Sem organization_id.
 *
 * Diferenças vs. original (src/components/admin/flowbuilder/FlowBuilder.tsx):
 *   - `flow` é `PlatformCrmChatFlowParsed` (sem organization_id).
 *   - `handleToggleActive`: o toggle de plataforma é simples ({ flowId, isActive }),
 *     sem chave de escopo por produto — o product_id é opcional, então a trava de
 *     "fluxo precisa estar vinculado a um produto" do tenant NÃO se aplica aqui.
 */

interface PlatformCrmFlowBuilderProps {
  flow: PlatformCrmChatFlowParsed;
  onBack: () => void;
}

export function PlatformCrmFlowBuilder({ flow, onBack }: PlatformCrmFlowBuilderProps) {
  const [blocks, setBlocks] = useState<FlowBlock[]>(flow.blocks || []);
  const [startBlockId, setStartBlockId] = useState<string | null>(flow.start_block_id);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [flowName, setFlowName] = useState(flow.name);
  const [hasChanges, setHasChanges] = useState(false);

  const saveBlocks = useSavePlatformCrmChatFlowBlocks();
  const toggleActive = useTogglePlatformCrmChatFlowActive();

  const selectedBlock = blocks.find(b => b.id === selectedBlockId) || null;

  // Extract collected variables from input blocks
  const getCollectedVariables = useCallback((): CollectedVariable[] => {
    return blocks
      .filter(b => b.type === 'input' && b.data.variable_name)
      .map(b => ({
        name: b.data.variable_name!,
        type: b.data.input_type || 'text',
        label: b.data.placeholder || b.data.variable_name!,
      }));
  }, [blocks]);

  const handleAddBlock = useCallback((type: FlowBlockType, position: { x: number; y: number }) => {
    const newBlock: FlowBlock = {
      id: `block_${Date.now()}`,
      type,
      position,
      data: { ...DEFAULT_BLOCK_DATA[type] },
      next_block_id: null,
    };

    setBlocks(prev => [...prev, newBlock]);
    setSelectedBlockId(newBlock.id);
    setHasChanges(true);

    // Auto-set as start if first block
    if (blocks.length === 0) {
      setStartBlockId(newBlock.id);
    }
  }, [blocks.length]);

  const handleUpdateBlock = useCallback((updatedBlock: FlowBlock) => {
    setBlocks(prev => prev.map(b => b.id === updatedBlock.id ? updatedBlock : b));
    setHasChanges(true);
  }, []);

  const handleDeleteBlock = useCallback((id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedBlockId === id) setSelectedBlockId(null);
    if (startBlockId === id) setStartBlockId(null);
    setHasChanges(true);
  }, [selectedBlockId, startBlockId]);

  const handleConnectBlocks = useCallback((fromId: string, toId: string) => {
    setBlocks(prev => prev.map(b =>
      b.id === fromId ? { ...b, next_block_id: toId } : b
    ));
    setHasChanges(true);
  }, []);

  const handleSetStart = useCallback((blockId: string) => {
    setStartBlockId(blockId);
    setHasChanges(true);
  }, []);

  const handleSave = async () => {
    try {
      await saveBlocks.mutateAsync({
        flowId: flow.id,
        blocks,
        startBlockId,
        collectedVariables: getCollectedVariables(),
      });
      setHasChanges(false);
    } catch (error) {
      // Error is handled by the hook
    }
  };

  const handleToggleActive = async () => {
    await toggleActive.mutateAsync({
      flowId: flow.id,
      isActive: !flow.is_active,
    });
  };

  return (
    <div className="h-[calc(100vh-200px)] flex flex-col bg-background rounded-lg border overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b bg-card">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={onBack}>
            <ArrowLeft className="w-4 h-4" />
          </Button>
          <Input
            value={flowName}
            onChange={(e) => {
              setFlowName(e.target.value);
              setHasChanges(true);
            }}
            className="w-64 font-semibold"
          />
          {hasChanges && (
            <span className="text-xs text-muted-foreground">• alterações não salvas</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={flow.is_active}
              onCheckedChange={handleToggleActive}
              disabled={toggleActive.isPending}
            />
            <Label className="text-sm">Ativo</Label>
          </div>

          <Button
            onClick={handleSave}
            disabled={saveBlocks.isPending || !hasChanges}
          >
            <Save className="w-4 h-4 mr-2" />
            {saveBlocks.isPending ? 'Salvando...' : 'Salvar'}
          </Button>
        </div>
      </div>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        <PlatformCrmFlowBlockPalette onDragStart={() => {}} />

        <PlatformCrmFlowCanvas
          blocks={blocks}
          startBlockId={startBlockId}
          selectedBlockId={selectedBlockId}
          onSelectBlock={setSelectedBlockId}
          onUpdateBlock={handleUpdateBlock}
          onDeleteBlock={handleDeleteBlock}
          onAddBlock={handleAddBlock}
          onConnectBlocks={handleConnectBlocks}
        />

        <PlatformCrmFlowBlockEditor
          block={selectedBlock}
          allBlocks={blocks}
          onUpdate={handleUpdateBlock}
          onClose={() => setSelectedBlockId(null)}
          onSetStart={handleSetStart}
          isStartBlock={selectedBlockId === startBlockId}
        />
      </div>
    </div>
  );
}
