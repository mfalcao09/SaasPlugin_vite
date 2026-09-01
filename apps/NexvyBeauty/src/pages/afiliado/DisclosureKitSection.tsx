import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Copy, Check, Ban } from 'lucide-react';
import { toast } from 'sonner';
import { getPublicAppUrl } from '@/lib/publicUrl';
import { useMyAffiliateLinks } from '@/hooks/useAffiliatePortal';

const COPIES = [
  'Oi! Lembra daquela semana que a agenda esvazia do nada? Eu uso a NexvyBeauty pra Agenda Lotada — WhatsApp, retorno e horário no mesmo lugar. Quer o link?',
  'Se o WhatsApp virou caixa de recado e o no-show come o sábado, olha isso. É o sistema que eu indiquei pra colega do salão.',
  'Não é curso milagroso. É agenda + follow-up pra dona de salão. Se fizer sentido, o time da Camila conversa com você — eu só abro a porta.',
  'Indicação sincera: eu não prometo faturamento. Prometo que você vai ver a operação (agenda, WhatsApp, retorno) num só lugar. Link aqui.',
  'Se quiser ver de perto, usa meu link / cupom. Sem pressão — se não for a hora, tudo bem.',
];

const ALLOWED = [
  'Dor real: agenda vazia, no-show, WhatsApp bagunçado (Agenda Lotada).',
  'Contar a própria experiência se você é cliente.',
  'Convidar pra conversar com o time — você indica, a Nexvy conduz.',
];

const FORBIDDEN = [
  'Prometer resultado, faturamento ou “agenda lotada em X dias”.',
  'Falar como se a Camila fechasse a venda no seu lugar ou assumisse meta que ela não pode cumprir.',
  'Inventar números, antes/depois ou depoimento que não é seu.',
];

export function DisclosureKitSection() {
  const { data: links } = useMyAffiliateLinks();
  const link = links?.[0];
  const url = link ? `${getPublicAppUrl()}/vendas?ref=${encodeURIComponent(link.ref_code)}` : `${getPublicAppUrl()}/vendas`;
  const coupon = link?.coupon_code;

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success('Copiado');
    } catch {
      toast.error('Não foi possível copiar');
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-semibold">Kit de divulgação</h2>
        <p className="text-sm text-muted-foreground">
          5 copies de WhatsApp. Ângulo permitido: Agenda Lotada / dor real. Proibido: promessa que a Camila não pode cumprir.
        </p>
      </div>

      {coupon && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Seu cupom Cakto</CardTitle>
          </CardHeader>
          <CardContent className="flex items-center gap-2">
            <code className="rounded-md bg-muted px-3 py-2 text-sm">{coupon}</code>
            <Button size="sm" variant="outline" onClick={() => copy(coupon)}>
              <Copy className="mr-1 h-3.5 w-3.5" /> Copiar
            </Button>
            <p className="text-xs text-muted-foreground">
              Desconto no checkout (?coupon=). Não é split nativo da Cakto.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3">
        {COPIES.map((c, i) => {
          const full = `${c}\n${url}${coupon ? `\nCupom: ${coupon}` : ''}`;
          return (
            <Card key={i}>
              <CardContent className="flex items-start justify-between gap-3 pt-4">
                <p className="text-sm">{c}</p>
                <Button size="sm" variant="outline" onClick={() => copy(full)}>
                  <Copy className="h-3.5 w-3.5" />
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Check className="h-4 w-4 text-emerald-600" /> Pode falar
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {ALLOWED.map((a) => <p key={a}>• {a}</p>)}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-base">
              <Ban className="h-4 w-4 text-destructive" /> Não pode
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            {FORBIDDEN.map((a) => <p key={a}>• {a}</p>)}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
