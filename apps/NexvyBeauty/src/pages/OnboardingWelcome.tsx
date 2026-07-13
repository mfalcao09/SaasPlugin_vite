import { useMemo } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Mail,
  MessageCircle,
  Rocket,
  QrCode,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

/**
 * Tela pós-checkout (passo 1 do onboarding). O Cakto redireciona o cliente
 * para cá logo após o pagamento aprovado. É PÚBLICA (o cliente ainda não tem
 * senha — o acesso vai por e-mail com link de definição de senha + WhatsApp).
 *
 * Objetivo (spec Marcelo 07-13): "tudo na palma da mão + próximos passos
 * detalhados". Confirma o pagamento, explica o que vem a seguir e aponta o
 * caminho (verificar e-mail/WhatsApp → entrar → completar a implantação).
 *
 * Query params opcionais que o Cakto pode anexar na URL de sucesso:
 *   ?nome= (primeiro nome)  ?email=  ?plano=
 * Tudo é degradável — sem params, mostra a versão genérica calorosa.
 */
export default function OnboardingWelcome() {
  const [params] = useSearchParams();
  const nome = params.get('nome')?.trim() || '';
  const email = params.get('email')?.trim() || '';
  const plano = params.get('plano')?.trim() || '';

  const saudacao = useMemo(
    () => (nome ? `Bem-vinda, ${nome}! 🎉` : 'Pagamento confirmado! 🎉'),
    [nome],
  );

  const passos = [
    {
      icon: Mail,
      title: 'Seu acesso está a caminho',
      desc: email
        ? `Enviamos para ${email} um e-mail com o link para definir sua senha e entrar.`
        : 'Enviamos para o seu e-mail um link para definir a senha e entrar na plataforma.',
    },
    {
      icon: MessageCircle,
      title: 'Continue no WhatsApp',
      desc: 'Nossa equipe já vai te chamar no mesmo WhatsApp da conversa — guiando você passo a passo, do começo ao fim.',
    },
    {
      icon: Rocket,
      title: 'Complete a implantação',
      desc: 'Um assistente rápido configura seu salão: dados, horários, serviços e sua equipe.',
    },
    {
      icon: QrCode,
      title: 'Conecte seu WhatsApp',
      desc: 'No fim, você escaneia um QR Code e seu histórico de conversas vira sua carteira de clientes — automaticamente.',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-primary/5 via-background to-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border bg-card shadow-lg overflow-hidden">
          {/* Header de confirmação */}
          <div className="px-6 sm:px-8 pt-10 pb-6 text-center">
            <div className="mx-auto w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mb-5">
              <CheckCircle2 className="h-12 w-12 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">{saudacao}</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Seu pagamento foi confirmado{plano ? ` — plano ${plano}` : ''}. Sua conta
              NexvyBeauty está sendo preparada. Veja os próximos passos:
            </p>
          </div>

          {/* Próximos passos */}
          <div className="px-6 sm:px-8 pb-2 space-y-3">
            {passos.map((p, i) => (
              <div
                key={p.title}
                className="flex items-start gap-4 rounded-2xl border bg-background/60 p-4"
              >
                <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                  <p.icon className="h-5 w-5 text-primary" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-semibold text-primary">Passo {i + 1}</span>
                  </div>
                  <h3 className="font-semibold leading-tight">{p.title}</h3>
                  <p className="text-sm text-muted-foreground mt-0.5">{p.desc}</p>
                </div>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="px-6 sm:px-8 py-6">
            <Button asChild size="lg" className="w-full gap-2">
              <Link to="/login">
                Já tenho meu acesso — Entrar <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3">
              Ainda não recebeu o e-mail? Confira o spam ou aguarde alguns minutos —
              ele chega logo.
            </p>
          </div>

          {/* Rodapé LGPD (D4) */}
          <div className="px-6 sm:px-8 py-4 border-t bg-muted/30">
            <div className="flex items-start gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-4 w-4 shrink-0 mt-0.5" />
              <p>
                Ao seguir com a implantação, você declara ter consentimento legítimo
                para o uso dos dados pessoais das suas clientes. Você é a{' '}
                <strong>Controladora</strong> desses dados; a Nexvy atua como{' '}
                <strong>Operadora</strong>, tratando-os exclusivamente para operar o seu
                atendimento, conforme a LGPD.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
