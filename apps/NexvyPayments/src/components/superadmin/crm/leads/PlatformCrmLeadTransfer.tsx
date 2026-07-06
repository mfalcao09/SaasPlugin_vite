// =====================================================================================
// L8 (LOTE P4) — Transferência de carteira do lead (CRM de PLATAFORMA).
// Substitui os stubs do LeadWalletTab (botão + histórico "em breve"). Grava em
// `platform_crm_lead_transfer_history` (migration 2026-07-03) + atualiza o lead
// (assigned_to / previous_assigned_to / squad_id / transferred_at) via onUpdateLead.
// Toca APENAS platform_crm_* (RLS super_admin-only isola). 1:1 do LeadWalletTab da fonte.
// =====================================================================================
import { useState, useEffect, useCallback } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RefreshCw, Loader2, ArrowRight } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { usePlatformCrmSquads } from '@/components/superadmin/crm/data/usePlatformCrmSquads';

type Seller = { id: string; full_name: string; avatar_url?: string | null; email?: string | null };

const NONE = '__none__';

/** Botão + modal de transferência da carteira (novo responsável + squad opcional + motivo). */
export function LeadTransferButton({
  leadId,
  currentAssignedTo,
  currentSquadId,
  sellers,
  onUpdateLead,
  onTransferred,
}: {
  leadId: string;
  currentAssignedTo: string | null;
  currentSquadId: string | null;
  sellers: Seller[];
  onUpdateLead: (updates: Record<string, unknown>) => Promise<void>;
  onTransferred: () => void;
}) {
  const { data: squads } = usePlatformCrmSquads();
  const [open, setOpen] = useState(false);
  const [toUser, setToUser] = useState('');
  const [toSquad, setToSquad] = useState(currentSquadId ?? '');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!toUser) {
      toast.error('Escolha o novo responsável');
      return;
    }
    setSaving(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      const toSquadFinal = toSquad || null;
      // 1) grava o histórico (from = estado atual; to = escolhido)
      const { error: histErr } = await supabase.from('platform_crm_lead_transfer_history').insert({
        lead_id: leadId,
        from_user_id: currentAssignedTo,
        to_user_id: toUser,
        from_squad_id: currentSquadId,
        to_squad_id: toSquadFinal,
        transferred_by: auth?.user?.id ?? null,
        reason: reason.trim() || null,
      });
      if (histErr) throw histErr;
      // 2) aplica no lead (previous_assigned_to preserva o dono anterior)
      await onUpdateLead({
        assigned_to: toUser,
        previous_assigned_to: currentAssignedTo,
        squad_id: toSquadFinal,
        transferred_at: new Date().toISOString(),
      });
      toast.success('Lead transferido');
      setOpen(false);
      setReason('');
      setToUser('');
      onTransferred();
    } catch (e) {
      toast.error('Falha ao transferir', { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Transferir
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transferir carteira do lead</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label>Novo responsável</Label>
            <Select value={toUser} onValueChange={setToUser}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione um vendedor" />
              </SelectTrigger>
              <SelectContent>
                {sellers
                  .filter((s) => s.id !== currentAssignedTo)
                  .map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.full_name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Squad (opcional)</Label>
            <Select
              value={toSquad || NONE}
              onValueChange={(v) => setToSquad(v === NONE ? '' : v)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Sem squad" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NONE}>Sem squad</SelectItem>
                {(squads ?? []).map((sq) => (
                  <SelectItem key={sq.id} value={sq.id}>
                    {sq.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Motivo (opcional)</Label>
            <Textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: realocação de carteira, folga do vendedor…"
              rows={2}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving || !toUser}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Transferir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type TransferRow = {
  id: string;
  from_user_id: string | null;
  to_user_id: string | null;
  reason: string | null;
  created_at: string;
};

/** Histórico de transferências do lead (mais recente primeiro). */
export function LeadTransferHistory({
  leadId,
  sellers,
  refreshKey,
}: {
  leadId: string;
  sellers: Seller[];
  refreshKey: number;
}) {
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [loading, setLoading] = useState(true);
  const nameOf = useCallback(
    (id: string | null) =>
      id ? sellers.find((s) => s.id === id)?.full_name ?? 'Usuário' : 'Sem responsável',
    [sellers],
  );

  useEffect(() => {
    let alive = true;
    setLoading(true);
    supabase
      .from('platform_crm_lead_transfer_history')
      .select('id, from_user_id, to_user_id, reason, created_at')
      .eq('lead_id', leadId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!alive) return;
        setRows((data as TransferRow[]) ?? []);
        setLoading(false);
      });
    return () => {
      alive = false;
    };
  }, [leadId, refreshKey]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">Histórico de Transferências</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex justify-center py-4">
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          </div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">
            Nenhuma transferência registrada.
          </p>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="text-sm border-l-2 border-primary/30 pl-3">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-muted-foreground">{nameOf(r.from_user_id)}</span>
                  <ArrowRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="font-medium">{nameOf(r.to_user_id)}</span>
                </div>
                {r.reason && <p className="text-xs text-muted-foreground mt-0.5">{r.reason}</p>}
                <p className="text-xs text-muted-foreground mt-0.5">
                  {format(parseISO(r.created_at), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}
                </p>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
