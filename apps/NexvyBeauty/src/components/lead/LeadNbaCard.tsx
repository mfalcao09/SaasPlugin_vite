// A2 — Next-Best-Action (NBA) generativo, por lead.
// Edge fn `lead-nba` coleta o contexto → LLM → grava em lead_nba_sugestao
// { acao, motivo, prioridade, canal_sugerido, mensagem_sugerida }.
//
// DIFERENCIAL vs concorrentes "que só sugerem": o botão "Aplicar" dispara a
// mensagem no WhatsApp REAL via `evolution-send`. Recomendação → ação.
import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Sparkles, Copy, Send, Loader2, RefreshCw, X, Check } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Tables } from '@/integrations/supabase/types';

type Nba = Tables<'lead_nba_sugestao'>;

const PRIO: Record<string, { label: string; cls: string }> = {
  alta: { label: 'Prioridade alta', cls: 'bg-red-500/10 text-red-600 border-red-500/20' },
  media: { label: 'Prioridade média', cls: 'bg-amber-500/10 text-amber-600 border-amber-500/20' },
  baixa: { label: 'Prioridade baixa', cls: 'bg-slate-500/10 text-slate-500 border-slate-500/20' },
};

interface LeadNbaCardProps {
  leadId: string;
  /** telefone do lead (dígitos) — habilita o "Aplicar" no WhatsApp */
  phone?: string | null;
  className?: string;
}

export function LeadNbaCard({ leadId, phone, className }: LeadNbaCardProps) {
  const qc = useQueryClient();
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);

  const { data: nba, isLoading } = useQuery({
    queryKey: ['lead-nba', leadId],
    queryFn: async () => {
      const { data } = await supabase
        .from('lead_nba_sugestao')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return (data as Nba | null) ?? null;
    },
    enabled: !!leadId,
  });

  async function generate() {
    setGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('lead-nba', { body: { lead_id: leadId } });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      await qc.invalidateQueries({ queryKey: ['lead-nba', leadId] });
      toast.success('Sugestão de IA gerada');
    } catch (e: any) {
      toast.error('Não foi possível gerar: ' + (e?.message || 'erro'));
    } finally {
      setGenerating(false);
    }
  }

  async function apply() {
    if (!nba?.mensagem_sugerida) return;
    if (!phone) {
      toast.error('Lead sem telefone — não dá para enviar no WhatsApp');
      return;
    }
    setApplying(true);
    try {
      const { data, error } = await supabase.functions.invoke('evolution-send', {
        body: { type: 'text', to: phone, payload: { text: nba.mensagem_sugerida } },
      });
      if (error) throw error;
      if ((data as any)?.error) throw new Error((data as any).error);
      if ((data as any)?.ok === false) throw new Error('Falha no envio (Evolution)');
      await supabase.from('lead_nba_sugestao').update({ status: 'aplicada' }).eq('id', nba.id);
      await qc.invalidateQueries({ queryKey: ['lead-nba', leadId] });
      toast.success('Mensagem enviada no WhatsApp ✅');
    } catch (e: any) {
      toast.error('Não foi possível enviar: ' + (e?.message || 'erro'));
    } finally {
      setApplying(false);
    }
  }

  async function discard() {
    if (!nba) return;
    await supabase.from('lead_nba_sugestao').update({ status: 'descartada' }).eq('id', nba.id);
    await qc.invalidateQueries({ queryKey: ['lead-nba', leadId] });
  }

  function copyMsg() {
    if (!nba?.mensagem_sugerida) return;
    navigator.clipboard.writeText(nba.mensagem_sugerida);
    toast.success('Mensagem copiada');
  }

  const active = nba && nba.status !== 'descartada';
  const prio = nba ? PRIO[nba.prioridade] ?? PRIO.media : null;
  const canWhats = !!phone && (!nba?.canal_sugerido || nba.canal_sugerido === 'whatsapp');

  return (
    <div className={cn('rounded-lg border bg-card p-3 space-y-3', className)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <Sparkles className="h-4 w-4 text-primary" />
          Próxima melhor ação (IA)
        </div>
        <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={generate} disabled={generating}>
          {generating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
          {nba ? 'Regenerar' : 'Gerar'}
        </Button>
      </div>

      {isLoading && (
        <div className="text-xs text-muted-foreground flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Carregando…
        </div>
      )}

      {!isLoading && !active && (
        <p className="text-xs text-muted-foreground">
          Sem sugestão ainda. Clique em <strong>Gerar</strong> — a IA lê o contexto do lead e recomenda a próxima ação + uma mensagem pronta pra disparar.
        </p>
      )}

      {!isLoading && active && nba && (
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            {prio && (
              <Badge variant="outline" className={cn('shrink-0 text-[10px]', prio.cls)}>
                {prio.label}
              </Badge>
            )}
            <div className="text-sm font-medium leading-snug">{nba.acao}</div>
          </div>
          {nba.motivo && <p className="text-xs text-muted-foreground">{nba.motivo}</p>}

          {nba.mensagem_sugerida && (
            <div className="rounded-md border bg-muted/40 p-2 space-y-2">
              <div className="text-[10px] uppercase text-muted-foreground font-medium">Mensagem pronta</div>
              <p className="text-sm italic">"{nba.mensagem_sugerida}"</p>
              <div className="flex items-center gap-2">
                <Button size="sm" className="h-7 gap-1" onClick={apply} disabled={applying || !canWhats}>
                  {applying ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Send className="h-3.5 w-3.5" />}
                  Aplicar (WhatsApp)
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1" onClick={copyMsg}>
                  <Copy className="h-3.5 w-3.5" /> Copiar
                </Button>
                <Button size="sm" variant="ghost" className="h-7 gap-1 text-muted-foreground ml-auto" onClick={discard}>
                  <X className="h-3.5 w-3.5" /> Descartar
                </Button>
              </div>
              {!phone && (
                <p className="text-[10px] text-amber-600">Lead sem telefone — não dá para enviar no WhatsApp.</p>
              )}
            </div>
          )}

          {nba.status === 'aplicada' && (
            <div className="flex items-center gap-1 text-xs text-emerald-600">
              <Check className="h-3.5 w-3.5" /> Aplicada
            </div>
          )}
        </div>
      )}
    </div>
  );
}
