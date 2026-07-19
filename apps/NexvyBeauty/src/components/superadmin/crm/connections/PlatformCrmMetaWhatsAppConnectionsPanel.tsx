import { useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Plus, RefreshCw, Pencil, Trash2, ShieldCheck, AlertTriangle, FileText, BadgeCheck } from 'lucide-react';
import {
  usePlatformCrmMetaWAConnections, useTestPlatformCrmMetaWAConnection, useSyncPlatformCrmMetaWATemplates, useDeletePlatformCrmMetaWAConnection,
  useRegisterPlatformCrmMetaWAConnection,
  type PlatformCrmMetaWAConnection,
} from '@/components/superadmin/crm/data/usePlatformCrmMetaWhatsApp';
import { PlatformCrmMetaWhatsAppWizard } from './PlatformCrmMetaWhatsAppWizard';
import { PlatformCrmMetaWhatsAppTemplatesPanel } from './PlatformCrmMetaWhatsAppTemplatesPanel';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

function StatusBadge({ c }: { c: PlatformCrmMetaWAConnection }) {
  if (c.status === 'active') return <Badge className="bg-emerald-500/15 text-emerald-700 border-emerald-500/30">Ativa</Badge>;
  if (c.status === 'error') return <Badge variant="destructive">Erro</Badge>;
  if (c.status === 'revoked') return <Badge variant="outline">Revogada</Badge>;
  if (c.status === 'draft') return <Badge variant="outline" className="border-amber-500/40 text-amber-700">Rascunho</Badge>;
  return <Badge variant="secondary">Pendente</Badge>;
}

interface Props {
  hideHeader?: boolean;
  openWizard?: boolean;
  onCloseWizard?: () => void;
}

export function PlatformCrmMetaWhatsAppConnectionsPanel({ hideHeader, openWizard, onCloseWizard }: Props = {}) {
  const { data: conns = [], isLoading } = usePlatformCrmMetaWAConnections();
  const test = useTestPlatformCrmMetaWAConnection();
  const sync = useSyncPlatformCrmMetaWATemplates();
  const del = useDeletePlatformCrmMetaWAConnection();
  const register = useRegisterPlatformCrmMetaWAConnection();
  const [wizardInternal, setWizardInternal] = useState(false);
  const wizardOpen = wizardInternal || !!openWizard;
  const closeWizard = () => { setWizardInternal(false); setEditing(null); onCloseWizard?.(); };
  const [editing, setEditing] = useState<PlatformCrmMetaWAConnection | null>(null);
  const [toDelete, setToDelete] = useState<PlatformCrmMetaWAConnection | null>(null);
  const [templatesFor, setTemplatesFor] = useState<PlatformCrmMetaWAConnection | null>(null);
  // Re-registro na Cloud API: o PIN vive só aqui e é descartado ao fechar o diálogo.
  const [registerFor, setRegisterFor] = useState<PlatformCrmMetaWAConnection | null>(null);
  const [pin, setPin] = useState('');
  const [resetPin, setResetPin] = useState(false);
  const pinValido = /^\d{6}$/.test(pin);

  const closeRegister = () => { setRegisterFor(null); setPin(''); setResetPin(false); };

  const submitRegister = () => {
    if (!registerFor || !pinValido) return;
    register.mutate(
      { connection_id: registerFor.id, pin, set_pin: resetPin || undefined },
      { onSuccess: closeRegister },
    );
  };

  if (isLoading) {
    return <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      {!hideHeader && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-600" />
            <div>
              <h3 className="font-medium">Conexões oficiais (Meta Cloud API)</h3>
              <p className="text-xs text-muted-foreground">As credenciais ficam criptografadas.</p>
            </div>
          </div>
          <Button onClick={() => { setEditing(null); setWizardInternal(true); }}>
            <Plus className="h-4 w-4 mr-2" />Nova conexão
          </Button>
        </div>
      )}

      {conns.length === 0 ? (
        <Card className="p-8 text-center text-sm text-muted-foreground">
          Nenhuma conexão oficial ainda. Clique em "Nova conexão" para configurar.
        </Card>
      ) : (
        <div className="space-y-3">
          {conns.map((c) => (
            <Card key={c.id} className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium">{c.display_name}</span>
                    <StatusBadge c={c} />
                    {c.quality_rating && <Badge variant="outline" className="text-xs">Qualidade: {c.quality_rating}</Badge>}
                    {c.messaging_limit_tier && <Badge variant="outline" className="text-xs">Tier: {c.messaging_limit_tier}</Badge>}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {c.phone_number ?? c.phone_number_id} · WABA {c.waba_id}
                    {c.business_account_name && <> · {c.business_account_name}</>}
                  </div>
                  {c.status === 'error' && c.last_error && (
                    <div className="flex items-start gap-1.5 text-xs text-destructive mt-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      <span className="break-all">{c.last_error}</span>
                    </div>
                  )}
                </div>
                <div className="flex gap-1 shrink-0">
                  <Button size="sm" variant="outline" onClick={() => test.mutate(c.id)} disabled={test.isPending}>
                    {test.isPending && test.variables === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : 'Testar'}
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => sync.mutate(c.id)} disabled={sync.isPending}>
                    {sync.isPending && sync.variables === c.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setPin(''); setResetPin(false); setRegisterFor(c); }}
                    disabled={register.isPending}
                    title="Re-registrar o número na Cloud API (aplica o nome aprovado pela Meta)"
                  >
                    {register.isPending && registerFor?.id === c.id
                      ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />
                      : <BadgeCheck className="h-3.5 w-3.5 mr-1" />}
                    Registrar
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setTemplatesFor(c)}>
                    <FileText className="h-3.5 w-3.5 mr-1" />Templates
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setWizardInternal(true); }}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setToDelete(c)}>
                    <Trash2 className="h-3.5 w-3.5 text-destructive" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      <PlatformCrmMetaWhatsAppWizard open={wizardOpen} onClose={closeWizard} editing={editing} />

      {templatesFor && (
        <PlatformCrmMetaWhatsAppTemplatesPanel
          connection={templatesFor}
          onClose={() => setTemplatesFor(null)}
        />
      )}

      <Dialog open={!!registerFor} onOpenChange={(v) => { if (!v && !register.isPending) closeRegister(); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Registrar número na Cloud API</DialogTitle>
            <DialogDescription>
              Use depois que a Meta aprovar um novo nome de exibição — o nome só passa a valer
              quando o número é registrado de novo. Número: {registerFor?.phone_number ?? registerFor?.phone_number_id}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="meta-register-pin">PIN de 6 dígitos</Label>
              <Input
                id="meta-register-pin"
                inputMode="numeric"
                autoComplete="off"
                maxLength={6}
                placeholder="000000"
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                onKeyDown={(e) => { if (e.key === 'Enter' && pinValido && !register.isPending) submitRegister(); }}
              />
              <p className="text-xs text-muted-foreground">
                É o PIN da verificação em duas etapas do número.
              </p>
              {pin.length > 0 && !pinValido && (
                <p className="text-xs text-destructive">Informe exatamente 6 dígitos numéricos.</p>
              )}
            </div>

            <div className="flex items-start gap-2">
              <Checkbox
                id="meta-register-set-pin"
                checked={resetPin}
                onCheckedChange={(v) => setResetPin(v === true)}
              />
              <div className="space-y-0.5">
                <Label htmlFor="meta-register-set-pin" className="font-normal">Redefinir o PIN</Label>
                <p className="text-xs text-muted-foreground">
                  Use se você não souber o PIN atual — ele será redefinido para o valor informado.
                </p>
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeRegister} disabled={register.isPending}>Cancelar</Button>
            <Button onClick={submitRegister} disabled={!pinValido || register.isPending}>
              {register.isPending
                ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Registrando…</>
                : <><BadgeCheck className="h-4 w-4 mr-2" />Registrar</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!toDelete} onOpenChange={(v) => !v && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remover conexão Meta?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação remove "{toDelete?.display_name}" e todos os templates sincronizados. Mensagens já recebidas continuam preservadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => { if (toDelete) del.mutate(toDelete.id); setToDelete(null); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >Remover</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
