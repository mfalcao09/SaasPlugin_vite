import { useEffect, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import {
  Sparkles, Calendar, Package, Users, DollarSign, Brain,
  UserCheck, CheckCircle2, AlertCircle, Play, ArrowRight, Zap,
  TrendingUp, MessageCircle, Crown,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from '@/components/ui/accordion';
import { usePlatformName } from '@/hooks/usePlatformName';
import { usePlatformBranding } from '@/hooks/usePlatformBranding';
import { LeadCaptureModal } from '@/components/sales/LeadCaptureModal';
import { captureTrackingFromUrl } from '@/lib/tracking';

// Casca visual portada do projeto beauty-flow (UI/UX premium), preservando a
// fiação de conversão do NexvyBeauty: branding dinâmico, captura de tracking
// (afiliado + UTM → cookie 1st-party que sobrevive ao hop LP→checkout) e o
// LeadCaptureModal (funil de compra). Marca via platformName — sem hardcode.

const GRADIENT = 'bg-gradient-to-r from-rose-500 to-pink-500';
const GRADIENT_TEXT = 'bg-gradient-to-r from-rose-500 to-pink-500 bg-clip-text text-transparent';

// A LP é página pública de marketing → sempre tema CLARO, mesmo que o app
// esteja em dark mode (html.dark). Forçamos os tokens shadcn claros no subtree
// da LP via custom properties inline (vencem a regra .dark{} por cascata), pra
// Card/Badge/Button renderizarem com contraste correto sobre fundo branco.
const LIGHT_THEME = {
  '--background': '0 0% 99%',
  '--foreground': '222 47% 11%',
  '--card': '0 0% 100%',
  '--card-foreground': '222 47% 11%',
  '--popover': '0 0% 100%',
  '--popover-foreground': '222 47% 11%',
  '--primary': '330 81% 60%',
  '--primary-foreground': '0 0% 100%',
  '--secondary': '220 14% 96%',
  '--secondary-foreground': '222 47% 11%',
  '--muted': '220 14% 96%',
  '--muted-foreground': '220 8% 46%',
  '--accent': '330 81% 60%',
  '--accent-foreground': '0 0% 100%',
  '--border': '220 13% 91%',
  '--input': '220 13% 91%',
  '--ring': '330 81% 60%',
} as CSSProperties;

const modulos = [
  { icon: Calendar, tag: 'CORE', title: 'Agenda Inteligente', desc: 'Gestão por profissional, validação de conflitos, bloqueio de horários. Zero double-booking.' },
  { icon: Users, tag: 'CORE', title: 'CRM de Clientes', desc: 'Ficha completa com histórico, observações, preferências, aniversário e indicadores de fidelidade.' },
  { icon: UserCheck, tag: 'OPERACIONAL', title: 'Gestão de Profissionais', desc: 'Cadastro por especialidade, horários por dia, vínculo com agenda, comissão por serviço.' },
  { icon: Package, tag: 'COMERCIAL', title: 'Pacotes & Sessões', desc: 'Pacotes com validade, sessões usadas, pagamentos parcelados, saldo restante por cliente.' },
  { icon: DollarSign, tag: 'GESTÃO', title: 'Financeiro & KPIs', desc: 'Receita por período, ticket médio, formas de pagamento e projeções em tempo real.' },
  { icon: Brain, tag: 'IA', title: 'AI Growth Engine', desc: 'Motor de IA que analisa dados, detecta oportunidades e gera mensagens prontas para enviar.' },
];

const dores = [
  'Agenda no papel ou no WhatsApp — cheia de erros, conflitos e horários perdidos',
  'Clientes sumindo sem que você perceba ou reaja a tempo de reativar',
  'Sem controle de receita real — só um número solto no final do mês',
  'Pacotes vendidos no caderno, sessões perdidas, clientes sem controle',
  'Sem visão de quais serviços geram mais ou quais profissionais são mais rentáveis',
  'No-show alto por falta de confirmação automática e lembrete pré-atendimento',
];

const steps = [
  { n: '01', t: 'Configure seu salão', d: 'Nome, logo, cor da marca, slug público. Sistema com a cara do seu negócio em minutos.' },
  { n: '02', t: 'Cadastre serviços e equipe', d: 'Serviços com duração e valor, profissionais com especialidades e horários por dia.' },
  { n: '03', t: 'Receba agendamentos', d: 'Link público para o cliente agendar sozinho 24/7, ou lançamento manual pela recepção.' },
  { n: '04', t: 'Cresça com IA', d: 'Sistema analisa histórico, sugere ações concretas pra aumentar receita e reativar clientes.' },
];

const aiBenefits = [
  'Reativa clientes inativos automaticamente',
  'Detecta horários fracos e sugere promoções',
  'Mensagens prontas para WhatsApp em 1 clique',
  'Insights de conversão por serviço e profissional',
];

const insights = [
  { tag: 'ALTA', color: 'bg-rose-500/15 text-rose-300 border-rose-500/30', title: '8 clientes inativos há +45 dias', desc: 'Recuperáveis com mensagem personalizada. Impacto estimado +R$ 2.800.' },
  { tag: 'MÉDIA', color: 'bg-amber-500/15 text-amber-300 border-amber-500/30', title: 'Terças 14h-16h: 3 slots vagos', desc: 'Padrão semanal de baixa ocupação. Sugestão: promo manicure expressa.' },
  { tag: 'OPORTUNIDADE', color: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30', title: 'Pacote facial: 60% de conversão', desc: 'Campanha sugerida para base inativa. Impacto estimado +R$ 8.400.' },
];

// Garantias honestas (substituem o social proof fictício) — claims verdadeiros,
// alinhados ao FAQ (trial sem cartão, sem fidelidade, migração assistida).
const garantias = [
  { t: '14 dias grátis', d: 'Teste tudo sem cartão de crédito. Só assina se gostar.' },
  { t: 'Sem fidelidade', d: 'Cancele quando quiser, sem multa e sem burocracia.' },
  { t: 'Migração assistida', d: 'Trazemos sua base de clientes e serviços por planilha (planos Pro e Premium).' },
];

const planos = [
  { nome: 'Starter', preco: 'R$ 197', desc: 'Para salões começando a se organizar.', features: ['Até 2 profissionais', 'Agenda completa', 'CRM de clientes', 'Link público de agendamento', 'Relatórios básicos'] },
  { nome: 'Pro', preco: 'R$ 397', desc: 'O plano mais escolhido por salões em crescimento.', features: ['Até 8 profissionais', 'Tudo do Starter', 'AI Growth Engine', 'Pacotes e sessões', 'WhatsApp ilimitado', 'Suporte prioritário'], destaque: true },
  { nome: 'Premium', preco: 'R$ 697', desc: 'Para redes e operações high-end.', features: ['Profissionais ilimitados', 'White-label', 'Multi-unidade', 'API e integrações', 'Onboarding dedicado', 'Gerente de sucesso'] },
];

const faqs = [
  { q: 'Preciso instalar alguma coisa?', a: 'Não. Roda 100% no navegador, no celular e no computador. Basta criar a conta e começar a usar.' },
  { q: 'E se eu já tiver dados em outro sistema?', a: 'Importamos sua base de clientes e serviços por planilha. Nosso time faz a migração com você nos planos Pro e Premium.' },
  { q: 'A IA realmente funciona?', a: 'Sim. A IA analisa o histórico real do seu salão e gera sugestões concretas — quem reativar, qual horário promover, qual pacote oferecer.' },
  { q: 'Posso cancelar quando quiser?', a: 'Sim, sem multa e sem fidelidade.' },
  { q: 'Funciona para barbearia e estética?', a: 'Funciona para qualquer salão de beleza, estética, barbearia, nail bar ou clínica de bem-estar.' },
  { q: 'Como funciona o link de agendamento público?', a: 'Cada salão recebe um link único. Você compartilha no Instagram e no WhatsApp e o cliente reserva sozinho.' },
];

export default function SalesPage() {
  const { platformName } = usePlatformName();
  usePlatformBranding();
  const [buyOpen, setBuyOpen] = useState(false);
  const openBuy = () => setBuyOpen(true);

  // Captura tracking (ref do afiliado + UTMs) no 1º carregamento e persiste em
  // cookie 1st-party — sobrevive ao hop LP → checkout.
  useEffect(() => { captureTrackingFromUrl(); }, []);

  useEffect(() => {
    if (platformName) document.title = `${platformName} — Sistema premium para salões de beleza`;
  }, [platformName]);

  return (
    <div className="min-h-screen bg-white text-zinc-900" style={LIGHT_THEME}>
      {/* NAVBAR */}
      <header className="sticky top-0 z-40 border-b border-zinc-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
          <a href="#top" className="flex items-center gap-2">
            <div className={`flex h-9 w-9 items-center justify-center rounded-xl ${GRADIENT} text-white shadow-lg shadow-rose-500/30`}>
              <Sparkles className="h-5 w-5" />
            </div>
            <span className="text-lg font-bold tracking-tight">{platformName || 'Nexvy Beauty'}</span>
          </a>
          <nav className="hidden items-center gap-7 text-sm font-medium text-zinc-600 md:flex">
            <a href="#modulos" className="hover:text-zinc-900">Módulos</a>
            <a href="#como" className="hover:text-zinc-900">Como funciona</a>
            <a href="#planos" className="hover:text-zinc-900">Planos</a>
            <Link to="/demo/cockpit" className="hover:text-zinc-900">Demo</Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link to="/login"><Button variant="ghost" size="sm">Entrar</Button></Link>
            <Button size="sm" onClick={openBuy} className={`${GRADIENT} text-white hover:opacity-90`}>Começar grátis</Button>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section id="top" className="relative overflow-hidden px-6 py-24 text-center md:py-32">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,rgba(244,63,94,0.12),transparent_60%)]" />
        <div className="mx-auto max-w-5xl">
          <Badge className={`mb-6 ${GRADIENT} px-4 py-1.5 text-xs font-semibold uppercase tracking-wider text-white shadow-lg shadow-rose-500/30 hover:opacity-90`}>
            <Sparkles className="mr-1.5 h-3 w-3" /> Inteligência artificial para salões premium
          </Badge>
          <h1 className="text-5xl font-black tracking-tight md:text-7xl">
            Seu salão rodando em <br className="hidden md:block" />
            <span className={GRADIENT_TEXT}>piloto automático</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-xl text-zinc-600">
            Agenda inteligente, CRM premium, pacotes, IA de crescimento — tudo em um sistema que entende o seu negócio.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={openBuy} className={`h-14 px-8 text-base font-semibold ${GRADIENT} text-white shadow-xl shadow-rose-500/30 hover:opacity-90`}>
              Começar grátis <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Link to="/demo/cockpit">
              <Button size="lg" variant="outline" className="h-14 border-zinc-300 px-8 text-base font-semibold">
                <Play className="mr-2 h-4 w-4" /> Ver demonstração
              </Button>
            </Link>
          </div>
          <p className="mt-5 text-sm text-zinc-500">Sem cartão de crédito · 14 dias grátis · Setup em 5 minutos</p>
        </div>
      </section>

      {/* STATS — pontos honestos do produto (sem métricas inventadas) */}
      <section className={`${GRADIENT} px-6 py-14 text-white`}>
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 md:grid-cols-4">
          {[
            { v: '14 dias', l: 'Grátis, sem cartão' },
            { v: '5 min', l: 'Para configurar' },
            { v: '6 módulos', l: 'Num só sistema' },
            { v: 'IA', l: 'Nativa de crescimento' },
          ].map((s) => (
            <div key={s.l} className="text-center">
              <div className="text-4xl font-black md:text-5xl">{s.v}</div>
              <div className="mt-1 text-sm font-medium text-white/90">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* MODULOS */}
      <section id="modulos" className="bg-zinc-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <Badge variant="outline" className="mb-3">Plataforma completa</Badge>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">6 módulos. Um sistema. <span className={GRADIENT_TEXT}>Zero fricção.</span></h2>
            <p className="mt-4 text-lg text-zinc-600">Tudo integrado. Adeus às 5 ferramentas diferentes.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {modulos.map((m) => (
              <Card key={m.title} className="group border-zinc-200/80 bg-white transition hover:-translate-y-1 hover:shadow-2xl hover:shadow-rose-500/10">
                <CardContent className="p-7">
                  <div className={`mb-5 flex h-12 w-12 items-center justify-center rounded-xl ${GRADIENT} text-white shadow-lg shadow-rose-500/25`}>
                    <m.icon className="h-6 w-6" />
                  </div>
                  <Badge variant="secondary" className="mb-3 text-[10px] font-bold uppercase tracking-wider">{m.tag}</Badge>
                  <h3 className="text-lg font-bold">{m.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{m.desc}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* PAIN POINTS */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-3 border-rose-300 text-rose-600">Pra quem é</Badge>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">Reconhece alguma dessas dores?</h2>
            <p className="mt-4 text-lg text-zinc-600">Se sim, este sistema foi feito para você.</p>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            {dores.map((d) => (
              <div key={d} className="flex items-start gap-4 rounded-2xl border border-rose-100 bg-rose-50/50 p-6">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-rose-500/10">
                  <AlertCircle className="h-5 w-5 text-rose-600" />
                </div>
                <p className="text-sm font-medium leading-relaxed text-zinc-700">{d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section id="como" className="bg-zinc-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <Badge variant="outline" className="mb-3">Como funciona</Badge>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">Do zero ao operando em <span className={GRADIENT_TEXT}>menos de 1 hora</span></h2>
          </div>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {steps.map((s) => (
              <div key={s.n} className="rounded-2xl border border-zinc-200 bg-white p-7">
                <div className={`text-5xl font-black ${GRADIENT_TEXT}`}>{s.n}</div>
                <h3 className="mt-4 text-lg font-bold">{s.t}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI GROWTH SECTION */}
      <section className="bg-zinc-900 px-6 py-24 text-white">
        <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
          <div>
            <Badge className={`${GRADIENT} mb-4 text-white`}><Brain className="mr-1.5 h-3 w-3" /> AI Growth Engine</Badge>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">IA que cresce o seu salão <span className={GRADIENT_TEXT}>no automático</span></h2>
            <p className="mt-4 text-lg text-zinc-400">Não é só um chatbot. É um motor que analisa seu histórico, identifica oportunidades reais e entrega ações prontas.</p>
            <ul className="mt-8 space-y-3">
              {aiBenefits.map((b) => (
                <li key={b} className="flex items-start gap-3">
                  <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${GRADIENT}`}>
                    <CheckCircle2 className="h-3.5 w-3.5 text-white" />
                  </div>
                  <span className="font-medium text-zinc-200">{b}</span>
                </li>
              ))}
            </ul>
            <Button size="lg" onClick={openBuy} className={`mt-8 ${GRADIENT} h-12 px-7 text-white hover:opacity-90`}>Começar grátis <ArrowRight className="ml-2 h-4 w-4" /></Button>
          </div>
          <div className="space-y-4">
            {insights.map((i) => (
              <div key={i.title} className="rounded-2xl border border-zinc-800 bg-gradient-to-br from-zinc-800/60 to-zinc-900 p-6 shadow-2xl">
                <div className="flex items-center justify-between">
                  <Badge variant="outline" className={`${i.color} font-bold`}>{i.tag}</Badge>
                  <Zap className="h-4 w-4 text-zinc-500" />
                </div>
                <h4 className="mt-3 font-bold text-white">{i.title}</h4>
                <p className="mt-1.5 text-sm text-zinc-400">{i.desc}</p>
                <div className="mt-4 flex gap-2">
                  <Button size="sm" className={`${GRADIENT} h-8 text-xs text-white hover:opacity-90`}><MessageCircle className="mr-1 h-3 w-3" /> Gerar mensagem</Button>
                  <Button size="sm" variant="ghost" className="h-8 text-xs text-zinc-300 hover:bg-zinc-800 hover:text-white">Detalhes</Button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GARANTIAS — trust honesto (substitui depoimentos fictícios) */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center">
            <Badge variant="outline" className="mb-3">Sem pegadinha</Badge>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">Feito pra rodar <span className={GRADIENT_TEXT}>sem dor de cabeça</span></h2>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {garantias.map((g) => (
              <Card key={g.t} className="border-zinc-200 bg-white">
                <CardContent className="p-7">
                  <div className={`mb-4 flex h-11 w-11 items-center justify-center rounded-xl ${GRADIENT} text-white`}>
                    <CheckCircle2 className="h-5 w-5" />
                  </div>
                  <h3 className="text-lg font-bold">{g.t}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-600">{g.d}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* PRICING */}
      <section id="planos" className="bg-zinc-50 px-6 py-24">
        <div className="mx-auto max-w-6xl">
          <div className="mb-14 text-center">
            <Badge variant="outline" className="mb-3">Planos</Badge>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">Para cada <span className={GRADIENT_TEXT}>tamanho de salão</span></h2>
            <p className="mt-4 text-lg text-zinc-600">14 dias grátis em qualquer plano. Sem cartão.</p>
          </div>
          <div className="grid gap-6 md:grid-cols-3">
            {planos.map((p) => (
              <Card key={p.nome} className={p.destaque ? 'relative scale-105 border-0 bg-zinc-900 text-white shadow-2xl shadow-rose-500/20' : 'border-zinc-200 bg-white'}>
                {p.destaque && (
                  <Badge className={`absolute -top-3 left-1/2 -translate-x-1/2 ${GRADIENT} text-white shadow-lg`}>
                    <Crown className="mr-1 h-3 w-3" /> Mais escolhido
                  </Badge>
                )}
                <CardContent className="p-8">
                  <h3 className="text-xl font-bold">{p.nome}</h3>
                  <div className="mt-3">
                    <span className="text-5xl font-black">{p.preco}</span>
                    <span className={p.destaque ? 'text-zinc-400' : 'text-zinc-500'}>/mês</span>
                  </div>
                  <p className={`mt-3 text-sm ${p.destaque ? 'text-zinc-400' : 'text-zinc-600'}`}>{p.desc}</p>
                  <ul className="mt-7 space-y-3">
                    {p.features.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <CheckCircle2 className={`mt-0.5 h-4 w-4 shrink-0 ${p.destaque ? 'text-rose-400' : 'text-rose-500'}`} />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button onClick={openBuy} className={p.destaque ? `mt-7 w-full ${GRADIENT} text-white hover:opacity-90` : 'mt-7 w-full'} variant={p.destaque ? 'default' : 'outline'}>Começar grátis</Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="px-6 py-24">
        <div className="mx-auto max-w-3xl">
          <div className="mb-10 text-center">
            <Badge variant="outline" className="mb-3">Dúvidas</Badge>
            <h2 className="text-4xl font-black tracking-tight md:text-5xl">Perguntas frequentes</h2>
          </div>
          <Accordion type="single" collapsible className="space-y-3">
            {faqs.map((f, i) => (
              <AccordionItem key={f.q} value={`q${i}`} className="rounded-xl border border-zinc-200 bg-white px-5">
                <AccordionTrigger className="text-left font-semibold hover:no-underline">{f.q}</AccordionTrigger>
                <AccordionContent className="text-zinc-600">{f.a}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className={`${GRADIENT} px-6 py-24 text-center text-white`}>
        <div className="mx-auto max-w-3xl">
          <TrendingUp className="mx-auto mb-5 h-12 w-12" />
          <h2 className="text-4xl font-black tracking-tight md:text-5xl">Pronto para crescer no automático?</h2>
          <p className="mt-4 text-lg text-white/90">Transforme a gestão do seu salão com inteligência artificial.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Button size="lg" onClick={openBuy} className="h-14 bg-white px-8 text-base font-bold text-rose-600 hover:bg-zinc-100">
              Começar grátis agora <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
            <Link to="/demo/cockpit">
              <Button size="lg" variant="outline" className="h-14 border-white/40 bg-transparent px-8 text-base font-semibold text-white hover:bg-white/10 hover:text-white">
                <Play className="mr-2 h-4 w-4" /> Ver demonstração
              </Button>
            </Link>
          </div>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="bg-zinc-900 px-6 py-12 text-zinc-400">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2">
            <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${GRADIENT}`}><Sparkles className="h-4 w-4 text-white" /></div>
            <span className="font-bold text-white">{platformName || 'Nexvy Beauty'}</span>
          </div>
          <p className="text-sm">© {new Date().getFullYear()} {platformName || 'Nexvy Beauty'} — Sistema premium para salões de beleza</p>
        </div>
      </footer>

      <LeadCaptureModal open={buyOpen} onOpenChange={setBuyOpen} />
    </div>
  );
}
