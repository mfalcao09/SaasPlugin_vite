import { useState } from 'react';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useCreateInstagramFlow, type IGTriggerType } from './useInstagramFlows';
import type { PlatformCrmInstagramConnection } from '../data/usePlatformCrmInstagram';
import { Instagram, Loader2 } from 'lucide-react';

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  connections: PlatformCrmInstagramConnection[];
  onCreated: (id: string) => void;
}

const triggers: { value: IGTriggerType; label: string; hint: string }[] = [
  { value: 'comment_keyword', label: 'Comentário com palavra-chave', hint: 'Alguém comenta no seu post/reel e o fluxo dispara' },
  { value: 'dm_keyword',      label: 'Palavra-chave na DM',           hint: 'Alguém envia uma DM contendo a palavra' },
  { value: 'story_reply',     label: 'Resposta a um Story',           hint: 'Alguém responde seu story via DM' },
  { value: 'mention',         label: 'Menção @',                       hint: 'Sua conta foi mencionada em comentário/caption' },
];

export function NewInstagramFlowDialog({ open, onOpenChange, connections, onCreated }: Props) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [triggerType, setTriggerType] = useState<IGTriggerType>('comment_keyword');
  const [connectionId, setConnectionId] = useState<string>(connections[0]?.id ?? '');
  const [keywords, setKeywords] = useState('');

  const createFlow = useCreateInstagramFlow();

  const handleCreate = async () => {
    if (!name.trim()) return;
    const kws = keywords.split(',').map(k => k.trim()).filter(Boolean);
    const flow = await createFlow.mutateAsync({
      name: name.trim(),
      description: description.trim() || null,
      trigger_type: triggerType,
      connection_id: connectionId && connectionId !== '__any__' ? connectionId : null,
      trigger_config: {
        keywords: kws,
        match: 'any',
        also_private_reply: triggerType === 'comment_keyword',
      },
      flow_blocks: [],
      start_block_id: null,
    });
    if (flow?.id) onCreated(flow.id);
    setName(''); setDescription(''); setKeywords('');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Instagram className="h-5 w-5 text-pink-500" /> Nova automação do Instagram
          </DialogTitle>
          <DialogDescription>Escolha um gatilho e vamos criar seu fluxo em segundos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label>Nome</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex: Lançamento – palavra-chave no post" autoFocus />
          </div>

          <div className="space-y-1.5">
            <Label>Descrição (opcional)</Label>
            <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Para quê serve esta automação" />
          </div>

          <div className="space-y-1.5">
            <Label>Gatilho</Label>
            <Select value={triggerType} onValueChange={(v) => setTriggerType(v as IGTriggerType)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {triggers.map(t => (
                  <SelectItem key={t.value} value={t.value}>
                    <div className="flex flex-col">
                      <span>{t.label}</span>
                      <span className="text-xs text-muted-foreground">{t.hint}</span>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {(triggerType === 'comment_keyword' || triggerType === 'dm_keyword' || triggerType === 'story_reply') && (
            <div className="space-y-1.5">
              <Label>Palavras-chave (separadas por vírgula)</Label>
              <Input value={keywords} onChange={(e) => setKeywords(e.target.value)} placeholder="quero, info, link, preço" />
              <p className="text-xs text-muted-foreground">Deixe em branco para disparar em qualquer comentário/DM.</p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label>Conta do Instagram</Label>
            {connections.length === 0 ? (
              <p className="text-xs text-muted-foreground rounded-md border border-dashed p-2">
                Nenhuma conta conectada ainda. O fluxo será salvo como rascunho e ativa quando você conectar uma conta em Conexões.
              </p>
            ) : (
              <Select value={connectionId} onValueChange={setConnectionId}>
                <SelectTrigger><SelectValue placeholder="Qualquer conta conectada" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__any__">Qualquer conta conectada</SelectItem>
                  {connections.map(c => (
                    <SelectItem key={c.id} value={c.id}>@{c.ig_username ?? c.display_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleCreate} disabled={!name.trim() || createFlow.isPending}>
            {createFlow.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Criar e abrir builder'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
