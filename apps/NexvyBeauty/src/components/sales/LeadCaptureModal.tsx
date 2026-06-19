import { useState } from 'react';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Check, ArrowRight, ArrowLeft, Sparkles } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { getTracking } from '@/lib/tracking';
import { toast } from 'sonner';

// Captura robusta multi-step (estilo Cakto): nome+e-mail+WhatsApp (obrigatórios)
// → qualificação (opcional) → aceite. O lead é gravado server-side (tagueado com
// canal+plataforma) ANTES do checkout, então fica salvo mesmo sem pagar.

const PAINS = [
  'Agenda no papel ou bagunçada',
  'WhatsApp desorganizado',
  'Sem controle de caixa/financeiro',
  'Clientes não voltam (sem fidelização)',
  'Perco horários com faltas',
  'Outro',
];

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
}

const onlyDigits = (s: string) => s.replace(/\D/g, '');
const isEmail = (s: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s);

export function LeadCaptureModal({ open, onOpenChange }: Props) {
  const [step, setStep] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [f, setF] = useState({
    name: '', email: '', whatsapp: '', instagram: '', main_pain: '', salon_name: '', accept: false,
  });

  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const step1Valid =
    f.name.trim().length >= 2 && isEmail(f.email) && onlyDigits(f.whatsapp).length >= 10;
  const canSubmit = step1Valid && f.accept;

  const reset = () => {
    setStep(0); setDone(false); setSubmitting(false);
    setF({ name: '', email: '', whatsapp: '', instagram: '', main_pain: '', salon_name: '', accept: false });
  };

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('capture-lead', {
        body: {
          name: f.name, email: f.email, whatsapp: f.whatsapp,
          instagram: f.instagram, main_pain: f.main_pain, salon_name: f.salon_name,
          tracking: getTracking(),
        },
      });
      const err = (data as { error?: string } | null)?.error || error?.message;
      if (err) throw new Error(err);
      setDone(true);
    } catch {
      toast.error('Não foi possível enviar. Tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setTimeout(reset, 200); }}>
      <DialogContent className="sm:max-w-md">
        {done ? (
          <div className="py-6 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15">
              <Check className="h-7 w-7 text-primary" />
            </div>
            <h3 className="text-xl font-bold text-foreground">Recebemos seus dados! 🎉</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Em instantes você recebe o link de pagamento no seu WhatsApp e e-mail.
              Após o pagamento, o acesso vai para o mesmo e-mail que você informou.
            </p>
            <Button className="mt-6 w-full" onClick={() => onOpenChange(false)}>Fechar</Button>
          </div>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Garanta seu acesso
              </DialogTitle>
              <DialogDescription>
                {step === 0 && 'Seus dados de contato (passo 1 de 3).'}
                {step === 1 && 'Conte um pouco do seu salão (passo 2 de 3).'}
                {step === 2 && 'Confirme e finalize (passo 3 de 3).'}
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-1.5">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-primary' : 'bg-muted'}`} />
              ))}
            </div>

            {step === 0 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome completo *</Label>
                  <Input value={f.name} onChange={(e) => set({ name: e.target.value })} maxLength={120} placeholder="Seu nome" />
                </div>
                <div className="space-y-1.5">
                  <Label>E-mail *</Label>
                  <Input type="email" value={f.email} onChange={(e) => set({ email: e.target.value })} maxLength={255} placeholder="voce@email.com" />
                  <p className="text-xs text-muted-foreground">Use o mesmo e-mail onde quer receber o acesso.</p>
                </div>
                <div className="space-y-1.5">
                  <Label>WhatsApp *</Label>
                  <Input value={f.whatsapp} onChange={(e) => set({ whatsapp: e.target.value })} maxLength={25} placeholder="(11) 99999-9999" />
                </div>
              </div>
            )}

            {step === 1 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Instagram do salão (opcional)</Label>
                  <Input value={f.instagram} onChange={(e) => set({ instagram: e.target.value })} maxLength={120} placeholder="@seusalao" />
                </div>
                <div className="space-y-1.5">
                  <Label>Qual sua maior dor hoje? (opcional)</Label>
                  <div className="grid gap-1.5">
                    {PAINS.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => set({ main_pain: p })}
                        className={`text-left text-sm rounded-lg border px-3 py-2 transition-colors ${
                          f.main_pain === p
                            ? 'border-primary bg-primary/5 text-foreground'
                            : 'border-border text-muted-foreground hover:bg-accent'
                        }`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {step === 2 && (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label>Nome do salão (opcional)</Label>
                  <Input value={f.salon_name} onChange={(e) => set({ salon_name: e.target.value })} maxLength={120} placeholder="Salão da Bella" />
                </div>
                <label className="flex items-start gap-2 text-xs text-muted-foreground cursor-pointer">
                  <Checkbox checked={f.accept} onCheckedChange={(v) => set({ accept: !!v })} className="mt-0.5" />
                  <span>Li e aceito os termos de uso e a política de privacidade, e autorizo o contato por WhatsApp/e-mail (LGPD).</span>
                </label>
              </div>
            )}

            <div className="flex gap-2 pt-1">
              {step > 0 && (
                <Button variant="outline" onClick={() => setStep((s) => s - 1)} className="gap-1">
                  <ArrowLeft className="h-4 w-4" /> Voltar
                </Button>
              )}
              {step < 2 ? (
                <Button className="flex-1 gap-1" disabled={step === 0 && !step1Valid} onClick={() => setStep((s) => s + 1)}>
                  Próximo <ArrowRight className="h-4 w-4" />
                </Button>
              ) : (
                <Button className="flex-1 gap-2" disabled={!canSubmit || submitting} onClick={handleSubmit}>
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Enviando...</>
                  ) : (
                    <>Garantir acesso <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
