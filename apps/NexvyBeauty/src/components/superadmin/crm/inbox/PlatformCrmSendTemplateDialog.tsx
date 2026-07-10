import { useMemo, useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Loader2, Send, AlertCircle } from 'lucide-react';
import { usePlatformCrmMetaWATemplates } from '../data/usePlatformCrmMetaWhatsApp';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

/**
 * Envio de template HSM (WhatsApp Cloud API) — porte fiel A1.2 de
 * `seller/inbox/SendTemplateDialog.tsx` (Vendus v5 original).
 *
 * Adaptações de dados:
 * - `TemplatePicker` (admin do tenant) → listagem de templates SINCRONIZADOS
 *   da plataforma via `usePlatformCrmMetaWATemplates(connectionId)`
 *   (`platform_crm_whatsapp_meta_templates`, edges `platform-meta-whatsapp-*`);
 * - edge `meta-whatsapp-send` (tenant) → `platform-meta-whatsapp-send`
 *   (nome canônico da família de edges da plataforma);
 * - sem `organization_id` (adaptação d).
 */
export type VariableMapping = Record<string, string>;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  metaConnectionId: string;
  conversationId: string;
  leadId?: string | null;
  to: string; // telefone destino
  onSent?: () => void;
}

/** Extrai as variáveis {{1}}..{{n}} do corpo do template sincronizado. */
function extractVariables(components: any): string[] {
  const found = new Set<string>();
  const list = Array.isArray(components) ? components : [];
  for (const comp of list) {
    const text = typeof comp?.text === 'string' ? comp.text : '';
    for (const m of text.matchAll(/\{\{(\d+)\}\}/g)) {
      found.add(m[1]);
    }
  }
  return Array.from(found).sort((a, b) => Number(a) - Number(b));
}

export function PlatformCrmSendTemplateDialog({
  open, onOpenChange, metaConnectionId,
  conversationId, leadId, to, onSent,
}: Props) {
  const [templateId, setTemplateId] = useState<string | null>(null);
  const [variableMapping, setVariableMapping] = useState<VariableMapping>({});
  const [sending, setSending] = useState(false);

  const { data: templates = [], isLoading } = usePlatformCrmMetaWATemplates(
    open ? metaConnectionId : null,
  );

  // Apenas templates APROVADOS da conexão atual (paridade com o TemplatePicker do v5).
  const approved = useMemo(
    () => templates.filter((t) => (t.status || '').toUpperCase() === 'APPROVED'),
    [templates],
  );
  const selected = approved.find((t) => t.id === templateId) ?? null;
  const variables = useMemo(
    () => (selected ? extractVariables(selected.components) : []),
    [selected],
  );

  const handleSend = async () => {
    if (!templateId) {
      toast.error('Selecione um template');
      return;
    }
    setSending(true);
    try {
      // TODO(A1.2-backend): edge `platform-meta-whatsapp-send` (envio de template
      // pela Cloud API da plataforma — irmão dos edges platform-meta-whatsapp-*
      // já deployados). Enquanto não existir, o invoke falha e o erro é exibido.
      const { data, error } = await supabase.functions.invoke('platform-meta-whatsapp-send', {
        body: {
          connection_id: metaConnectionId,
          conversation_id: conversationId,
          to,
          type: 'template',
          template: {
            template_id: templateId,
            variable_mapping: variableMapping,
            lead_id: leadId ?? null,
          },
        },
      });
      if (error) throw error;
      const resp = data as any;
      if (resp?.error) {
        throw new Error(resp.message ?? resp.error);
      }
      toast.success('Template enviado');
      onSent?.();
      onOpenChange(false);
      setTemplateId(null);
      setVariableMapping({});
    } catch (e: any) {
      toast.error(e?.message ?? 'Falha ao enviar template');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Enviar template HSM</DialogTitle>
          <DialogDescription>
            Selecione um template aprovado para abrir/reabrir a conversa via WhatsApp Cloud API.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Template aprovado</Label>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground py-2">
                <Loader2 className="h-4 w-4 animate-spin" /> Carregando templates...
              </div>
            ) : approved.length === 0 ? (
              <p className="text-sm text-muted-foreground py-2">
                Nenhum template aprovado sincronizado nesta conexão.
              </p>
            ) : (
              <Select value={templateId ?? ''} onValueChange={(v) => { setTemplateId(v); setVariableMapping({}); }}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione um template" />
                </SelectTrigger>
                <SelectContent>
                  {approved.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name} {t.language ? `(${t.language})` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <p className="text-[11px] text-muted-foreground">
              Apenas templates APROVADOS da conexão atual.
            </p>
          </div>

          {/* Variáveis {{n}} do template selecionado */}
          {variables.length > 0 && (
            <div className="space-y-2">
              <Label>Variáveis do template</Label>
              {variables.map((v) => (
                <div key={v} className="flex items-center gap-2">
                  <span className="text-xs font-mono text-muted-foreground w-10 shrink-0">{`{{${v}}}`}</span>
                  <Input
                    value={variableMapping[v] ?? ''}
                    onChange={(e) =>
                      setVariableMapping((prev) => ({ ...prev, [v]: e.target.value }))
                    }
                    placeholder={`Valor da variável ${v}`}
                    className="h-8 text-sm"
                  />
                </div>
              ))}
            </div>
          )}

          <div className="text-[11px] text-muted-foreground flex items-start gap-1">
            <AlertCircle className="h-3 w-3 mt-0.5 shrink-0" />
            Templates com vídeo/imagem usam a mídia configurada na edição do template — uma vez só.
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <Button onClick={handleSend} disabled={sending || !templateId}>
            {sending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            Enviar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
