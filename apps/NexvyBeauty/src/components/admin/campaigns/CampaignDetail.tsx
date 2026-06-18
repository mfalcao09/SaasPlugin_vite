import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Edit, Pause, Play, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useCampaignTargets } from '@/hooks/useCampaigns';
import { AICampaignAssistant } from './AICampaignAssistant';

export function CampaignDetail({
  campaignId,
  onBack,
  onEdit,
}: {
  campaignId: string;
  onBack: () => void;
  onEdit: () => void;
}) {
  const [campaign, setCampaign] = useState<any>(null);
  const { counts, targets } = useCampaignTargets(campaignId);

  useEffect(() => {
    supabase.from('campaigns').select('*').eq('id', campaignId).maybeSingle()
      .then(({ data }) => setCampaign(data));
  }, [campaignId, counts]);

  const togglePause = async () => {
    if (!campaign) return;
    const next = campaign.status === 'paused' ? 'active' : 'paused';
    const { error } = await supabase.from('campaigns').update({ status: next }).eq('id', campaignId);
    if (error) toast.error(error.message);
    else { setCampaign({ ...campaign, status: next }); toast.success(next === 'active' ? 'Retomada' : 'Pausada'); }
  };

  if (!campaign) return <div className="p-10 text-center"><Loader2 className="h-5 w-5 animate-spin mx-auto" /></div>;

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  const done = counts.sent + counts.responded + counts.failed + counts.skipped + counts.cancelled;
  const progress = total ? Math.round((done / total) * 100) : 0;

  const statusLabel: Record<string, string> = {
    draft: 'Rascunho',
    active: 'Ativa',
    paused: 'Pausada',
    completed: 'Concluída',
    cancelled: 'Cancelada',
  };
  const countLabel: Record<string, string> = {
    queued: 'Em fila',
    sending: 'Enviando',
    sent: 'Enviadas',
    responded: 'Respondidas',
    failed: 'Falharam',
    skipped: 'Puladas',
    cancelled: 'Canceladas',
  };
  const targetStatusLabel: Record<string, string> = {
    queued: 'Em fila',
    sending: 'Enviando',
    sent: 'Enviada',
    responded: 'Respondeu',
    failed: 'Falhou',
    skipped: 'Pulada',
    cancelled: 'Cancelada',
  };

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl mx-auto">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="sm" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" />Voltar</Button>
        <h1 className="flex-1 font-semibold truncate">{campaign.name}</h1>
        <Badge>{statusLabel[campaign.status] ?? campaign.status}</Badge>
        {(campaign.status === 'active' || campaign.status === 'paused') && (
          <Button variant="outline" size="sm" onClick={togglePause}>
            {campaign.status === 'paused' ? <><Play className="h-4 w-4 mr-2" />Retomar</> : <><Pause className="h-4 w-4 mr-2" />Pausar</>}
          </Button>
        )}
        <Button variant="outline" size="sm" onClick={onEdit}><Edit className="h-4 w-4 mr-2" />Editar</Button>
      </div>

      <Card>
        <CardHeader><CardTitle className="text-base">Progresso</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="h-2 bg-muted rounded overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
          </div>
          <div className="grid grid-cols-3 md:grid-cols-7 gap-2 text-center text-xs">
            {(['queued','sending','sent','responded','failed','skipped','cancelled'] as const).map((k) => (
              <div key={k} className="p-2 rounded border">
                <p className="text-muted-foreground">{countLabel[k]}</p>
                <p className="text-lg font-semibold">{counts[k]}</p>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <AICampaignAssistant campaignId={campaignId} />

      <Card>
        <CardHeader><CardTitle className="text-base">Últimos envios</CardTitle></CardHeader>
        <CardContent>
          <div className="space-y-1 max-h-[400px] overflow-auto text-sm">
            {targets.slice(0, 100).map((t) => (
              <div key={t.id} className="flex items-center gap-3 py-1 border-b last:border-0">
                <Badge variant="outline" className="text-xs w-20 justify-center">{targetStatusLabel[t.status] ?? t.status}</Badge>
                <span className="text-xs text-muted-foreground font-mono truncate flex-1">{t.lead_id}</span>
                <span className="text-xs text-muted-foreground">
                  {t.sent_at ? new Date(t.sent_at).toLocaleString('pt-BR') : new Date(t.scheduled_for).toLocaleString('pt-BR')}
                </span>
              </div>
            ))}
            {!targets.length && <p className="text-xs text-muted-foreground text-center py-4">Nenhum envio ainda.</p>}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
