import { useSearchParams, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  CheckCircle2,
  Mail,
  MessageCircle,
  Clock,
  Rocket,
  QrCode,
  Smartphone,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

/**
 * Tela pós-checkout (passo 1 do onboarding). O Cakto redireciona a compradora
 * para cá logo após o pagamento aprovado. É PÚBLICA — a compradora ainda não
 * tem sessão.
 *
 * O que esta página PODE prometer (e só isso):
 *   - o link individual de montagem é `/implantacao/<token>`; o token é um
 *     SEGREDO gerado server-to-server no webhook (só o sha256 fica no banco).
 *     Esta tela NÃO tem como descobri-lo nem montá-lo — e não deve tentar:
 *     buscar por e-mail vindo de query string entregaria a conta de qualquer
 *     pessoa a quem soubesse o e-mail dela;
 *   - o envio real acontece em segundos por DOIS canais, e é isso que a página
 *     comunica: WhatsApp (agente Lia, na mesma conversa da venda) + e-mail com
 *     o acesso. Ver `supabase/functions/_shared/onboarding-handoff.ts`
 *     (LIA_GREETING_BUBBLES_WITH_LINK / ONBOARDING_LINK_TTL_MS).
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

  const saudacao = nome ? `Bem-vinda, ${nome}!` : 'Pagamento confirmado!';

  // O que acontece depois que ela abrir o link — expectativa honesta do wizard.
  const comoFunciona = [
    {
      icon: Rocket,
      title: '9 passos rápidos, e salva sozinho',
      desc: 'Seu espaço, horários, serviços, sua equipe. Pode parar no meio e voltar depois de onde parou.',
    },
    {
      icon: QrCode,
      title: 'No fim, o QR do WhatsApp',
      desc: 'O último passo conecta o WhatsApp do seu espaço. Abra o link no computador ou em outro celular — o QR precisa ser escaneado com o SEU aparelho.',
    },
    {
      icon: MessageCircle,
      title: 'A Lia fica com você',
      desc: 'Nossa equipe acompanha pelo WhatsApp durante toda a montagem. Travou em algum passo? É só responder ali.',
    },
  ];

  return (
    <div className="min-h-screen w-full bg-gradient-to-b from-primary/5 via-background to-background flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-xl">
        <div className="rounded-3xl border bg-card shadow-lg overflow-hidden">
          {/* Header de confirmação */}
          <div className="px-6 sm:px-8 pt-10 pb-6 text-center">
            <img
              src="/email/logo-v1.png"
              alt="NexvyBeauty"
              className="h-10 md:h-12 mx-auto mb-5"
            />
            <div className="mx-auto w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mb-4">
              <CheckCircle2 className="h-9 w-9 text-primary" />
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold mb-2">{saudacao}</h1>
            <p className="text-muted-foreground max-w-md mx-auto">
              Seu pagamento foi confirmado{plano ? ` — plano ${plano}` : ''} e sua conta já
              está criada. Agora falta só um passo: montar o seu espaço.
            </p>
          </div>

          {/* Bloco principal: onde está o link dela */}
          <div className="px-6 sm:px-8">
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <h2 className="font-semibold text-base sm:text-lg mb-1">
                O link para montar seu espaço já foi enviado
              </h2>
              <p className="text-sm text-muted-foreground mb-4">
                Ele é pessoal e chega por estes dois canais — por segurança, não conseguimos
                mostrá-lo aqui nesta tela.
              </p>

              <div className="space-y-3">
                <div className="flex items-start gap-3 rounded-xl bg-background/70 border p-3">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <MessageCircle className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold leading-tight">No seu WhatsApp</h3>
                      <span className="text-[11px] font-semibold text-primary bg-primary/10 rounded-full px-2 py-0.5">
                        mais rápido
                      </span>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      A Lia manda o link na mesma conversa em que você falou com a gente.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3 rounded-xl bg-background/70 border p-3">
                  <div className="shrink-0 w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Mail className="h-4 w-4 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">No seu e-mail</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {email
                        ? `Enviamos para ${email} o mesmo link, junto com os seus dados de acesso.`
                        : 'Enviamos o mesmo link para o e-mail da sua compra, junto com os seus dados de acesso.'}
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 mt-4 text-sm font-medium text-primary">
                <Clock className="h-4 w-4 shrink-0" />
                <span>Costuma chegar em segundos. Pode deixar esta aba aberta.</span>
              </div>
            </div>
          </div>

          {/* Como funciona a montagem */}
          <div className="px-6 sm:px-8 pt-6">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Quando você abrir o link
            </h2>
            <div className="space-y-3">
              {comoFunciona.map((p) => (
                <div
                  key={p.title}
                  className="flex items-start gap-4 rounded-2xl border bg-background/60 p-4"
                >
                  <div className="shrink-0 w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                    <p.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-semibold leading-tight">{p.title}</h3>
                    <p className="text-sm text-muted-foreground mt-0.5">{p.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Se não chegou */}
          <div className="px-6 sm:px-8 pt-6">
            <div className="rounded-2xl border bg-muted/30 p-5">
              <div className="flex items-center gap-2 mb-2">
                <Smartphone className="h-4 w-4 text-muted-foreground shrink-0" />
                <h2 className="font-semibold">E se não chegar?</h2>
              </div>
              <ul className="text-sm text-muted-foreground space-y-2">
                <li>
                  <strong className="text-foreground">Comece pelo WhatsApp.</strong> É o canal
                  mais rápido e o mais difícil de se perder — abra a conversa em que você falou
                  com a gente.
                </li>
                <li>
                  <strong className="text-foreground">No e-mail, confira o spam</strong> e as
                  abas de promoções{email ? ` da caixa ${email}` : ''} — às vezes o primeiro
                  e-mail cai por lá.
                </li>
                <li>
                  <strong className="text-foreground">Ainda nada?</strong> Responda essa mesma
                  conversa do WhatsApp dizendo que o link não chegou — a gente reenvia.
                </li>
              </ul>
            </div>
          </div>

          {/* CTA — honesto: entrar só faz sentido depois de definir a senha */}
          <div className="px-6 sm:px-8 py-6">
            <Button asChild size="lg" variant="outline" className="w-full gap-2">
              <Link to="/login">
                Já defini minha senha — Entrar <ArrowRight className="h-4 w-4" />
              </Link>
            </Button>
            <p className="text-center text-xs text-muted-foreground mt-3">
              Ainda não definiu a senha? Use primeiro o link do WhatsApp ou do e-mail — é por
              ele que a montagem começa.
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
