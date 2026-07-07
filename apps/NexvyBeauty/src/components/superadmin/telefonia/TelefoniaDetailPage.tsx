import { useState } from 'react';
import {
  ArrowLeft,
  Copy,
  MessageSquareText,
  Phone,
  RefreshCw,
  Trash2,
} from 'lucide-react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { toast } from 'sonner';
import {
  useSalvyNumber,
  useSalvySms,
  useCancelSalvyNumber,
  formatSalvyPhone,
  type SalvyCancelReason,
} from '@/hooks/useTelefonia';
import { SalvyStatusBadge, SALVY_MONTHLY_COST_LABEL } from './TelefoniaManager';

const CANCEL_REASON_LABEL: Record<SalvyCancelReason, string> = {
  unnecessary: 'Não é mais necessária',
  'whatsapp-ban': 'Banida no WhatsApp',
  'technical-issues': 'Problemas técnicos',
  'company-canceled': 'Empresa cancelou',
};

function fmtDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  return format(new Date(iso), "dd/MM/yyyy 'às' HH:mm", { locale: ptBR });
}

interface TelefoniaDetailPageProps {
  id: string;
  onBack: () => void;
}

export function TelefoniaDetailPage({ id, onBack }: TelefoniaDetailPageProps) {
  const [smsPage, setSmsPage] = useState(1);
  const [isCanceling, setIsCanceling] = useState(false);
  const [cancelConfirmText, setCancelConfirmText] = useState('');
  const [cancelReason, setCancelReason] = useState<SalvyCancelReason>('unnecessary');

  const { data: number, isLoading } = useSalvyNumber(id);
  const {
    data: smsMessages,
    isLoading: loadingSms,
    isFetching: fetchingSms,
    refetch: refetchSms,
  } = useSalvySms(id, smsPage);
  const cancelNumber = useCancelSalvyNumber();

  const copy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copiado.`);
  };

  // Type-to-confirm: compara só os dígitos (aceita colar com ou sem formatação).
  const expectedConfirm = (number?.phoneNumber ?? '').replace(/\D/g, '');
  const confirmMatches =
    cancelConfirmText.replace(/\D/g, '') === expectedConfirm && expectedConfirm !== '';

  const handleCancel = async () => {
    if (!confirmMatches || !number) return;
    try {
      await cancelNumber.mutateAsync({ id: number.id, reason: cancelReason });
      toast.success(`Linha ${formatSalvyPhone(number.phoneNumber)} cancelada.`);
      setIsCanceling(false);
      onBack();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : 'Falha ao cancelar a linha.');
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-48 rounded-xl" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!number) {
    return (
      <div className="space-y-4">
        <Button variant="ghost" size="sm" onClick={onBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Voltar
        </Button>
        <Card>
          <CardContent className="py-10 text-center text-muted-foreground">
            Linha não encontrada na Salvy.
          </CardContent>
        </Card>
      </div>
    );
  }

  const isCanceled = number.status === 'canceled';

  return (
    <div className="space-y-6">
      <Button variant="ghost" size="sm" onClick={onBack}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Voltar para Linhas
      </Button>

      {/* Info da linha */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Phone className="h-5 w-5" />
                {number.name || 'Sem nome'}
              </CardTitle>
              <CardDescription className="font-mono text-base mt-1">
                {formatSalvyPhone(number.phoneNumber)}
                <Button
                  variant="ghost"
                  size="sm"
                  className="ml-1 h-6 px-2"
                  onClick={() => copy(number.phoneNumber, 'Número')}
                >
                  <Copy className="h-3 w-3" />
                </Button>
              </CardDescription>
            </div>
            <SalvyStatusBadge status={number.status} />
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-x-8 gap-y-3 sm:grid-cols-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Criada em</dt>
              <dd>{fmtDateTime(number.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Centro de custo</dt>
              <dd>{number.costCenter || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Custo</dt>
              <dd>{isCanceled ? '—' : SALVY_MONTHLY_COST_LABEL}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">ID Salvy</dt>
              <dd className="font-mono text-xs">{number.id}</dd>
            </div>
            {number.redirectPhoneNumber && (
              <div>
                <dt className="text-muted-foreground">Redirecionamento</dt>
                <dd>
                  {formatSalvyPhone(number.redirectPhoneNumber)}
                  {number.redirectExpiresAt &&
                    ` (expira ${fmtDateTime(number.redirectExpiresAt)})`}
                </dd>
              </div>
            )}
            {isCanceled && (
              <div>
                <dt className="text-muted-foreground">Cancelada em</dt>
                <dd>
                  {fmtDateTime(number.canceledAt)}
                  {number.cancelReason && (
                    <Badge variant="outline" className="ml-2">
                      {number.cancelReason}
                    </Badge>
                  )}
                </dd>
              </div>
            )}
          </dl>
          {number.status === 'pending' && (
            <p className="mt-4 text-sm text-amber-600 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
              Linha pendente — normalmente aguardando a confirmação do código no
              WhatsApp. O OTP chega como SMS abaixo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* SMS / OTP */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <MessageSquareText className="h-5 w-5" />
                SMS recebidos
              </CardTitle>
              <CardDescription>
                Códigos de verificação (OTP) do WhatsApp aparecem destacados.
                Atualiza sozinho a cada 15s.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchSms()}
              disabled={fetchingSms}
            >
              <RefreshCw
                className={`h-4 w-4 mr-2 ${fetchingSms ? 'animate-spin' : ''}`}
              />
              Atualizar
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {loadingSms ? (
            <>
              <Skeleton className="h-16 rounded-lg" />
              <Skeleton className="h-16 rounded-lg" />
            </>
          ) : !smsMessages?.length ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              {smsPage > 1
                ? 'Sem mensagens nesta página.'
                : 'Nenhum SMS recebido nesta linha ainda.'}
            </p>
          ) : (
            smsMessages.map((sms) => {
              const otp = sms.detections?.whatsapp?.verificationCode;
              return (
                <div
                  key={sms.id}
                  className="rounded-lg border p-3 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <span>
                      De <span className="font-mono">{sms.originPhoneNumber}</span>
                    </span>
                    <span>{fmtDateTime(sms.receivedAt)}</span>
                  </div>
                  <p className="text-sm whitespace-pre-wrap">{sms.message}</p>
                  {otp && (
                    <div className="flex items-center gap-2">
                      <Badge className="bg-emerald-600 hover:bg-emerald-600 text-white font-mono text-sm tracking-widest">
                        OTP WhatsApp: {otp}
                      </Badge>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7"
                        onClick={() => copy(otp, 'Código')}
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copiar
                      </Button>
                    </div>
                  )}
                </div>
              );
            })
          )}
          <div className="flex items-center justify-between pt-2">
            <Button
              variant="ghost"
              size="sm"
              disabled={smsPage <= 1}
              onClick={() => setSmsPage((p) => Math.max(1, p - 1))}
            >
              Mais recentes
            </Button>
            <span className="text-xs text-muted-foreground">Página {smsPage}</span>
            <Button
              variant="ghost"
              size="sm"
              disabled={(smsMessages?.length ?? 0) < 20}
              onClick={() => setSmsPage((p) => p + 1)}
            >
              Mais antigas
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Zona de perigo */}
      {!isCanceled && (
        <Card className="border-destructive/40">
          <CardHeader>
            <CardTitle className="text-lg text-destructive">Zona de perigo</CardTitle>
            <CardDescription>
              Cancelar desliga a linha na Salvy e encerra a cobrança. O número é
              perdido — se ele estiver pareado num WhatsApp, a conta perde o SMS de
              verificação.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="destructive" onClick={() => setIsCanceling(true)}>
              <Trash2 className="h-4 w-4 mr-2" />
              Cancelar linha
            </Button>
          </CardContent>
        </Card>
      )}

      {/* AlertDialog: cancelar (type-to-confirm) */}
      <AlertDialog
        open={isCanceling}
        onOpenChange={(open) => {
          if (!open) {
            setIsCanceling(false);
            setCancelConfirmText('');
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar {formatSalvyPhone(number.phoneNumber)}?</AlertDialogTitle>
            <AlertDialogDescription>
              Ação irreversível: a linha é desligada na Salvy e o número é perdido.
              Para confirmar, digite o número da linha.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Motivo</Label>
              <Select
                value={cancelReason}
                onValueChange={(v) => setCancelReason(v as SalvyCancelReason)}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(Object.keys(CANCEL_REASON_LABEL) as SalvyCancelReason[]).map((r) => (
                    <SelectItem key={r} value={r}>
                      {CANCEL_REASON_LABEL[r]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>
                Digite <span className="font-mono">{number.phoneNumber}</span> para
                confirmar
              </Label>
              <Input
                value={cancelConfirmText}
                onChange={(e) => setCancelConfirmText(e.target.value)}
                placeholder={number.phoneNumber}
                autoComplete="off"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>Voltar</AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={!confirmMatches || cancelNumber.isPending}
              onClick={handleCancel}
            >
              {cancelNumber.isPending ? 'Cancelando…' : 'Cancelar linha definitivamente'}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
