import { useState, useRef, useEffect } from 'react';
import { motion, useInView } from 'framer-motion';
import { 
  BarChart3, MessageSquare, Zap, FileText, Webhook, Bot, 
  Users, PieChart, CalendarDays, DollarSign, ChevronRight,
  ArrowRight, CheckCircle2, Sparkles, Shield, Rocket,
  Send, Loader2
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { usePlatformName } from '@/hooks/usePlatformName';
import { usePlatformBranding } from '@/hooks/usePlatformBranding';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Logo } from '@/components/ui/Logo';
import { LeadCaptureModal } from '@/components/sales/LeadCaptureModal';
import { captureTrackingFromUrl } from '@/lib/tracking';

const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.6 } },
};

const stagger = {
  visible: { transition: { staggerChildren: 0.1 } },
};

function AnimatedSection({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once: true, margin: '-50px' });
  return (
    <motion.div
      ref={ref}
      initial="hidden"
      animate={isInView ? 'visible' : 'hidden'}
      variants={stagger}
      className={className}
    >
      {children}
    </motion.div>
  );
}

const FEATURES = [
  { icon: CalendarDays, title: 'Agenda Inteligente', desc: 'Horários online sem conflito. O cliente marca sozinho pelo seu link e a agenda se organiza.' },
  { icon: Users, title: 'Profissionais & Comissões', desc: 'Cadastre a equipe, controle a agenda de cada um e calcule comissões automaticamente.' },
  { icon: MessageSquare, title: 'WhatsApp Centralizado', desc: 'Todas as conversas num só lugar, com IA que responde, agenda e confirma horários 24/7.' },
  { icon: Sparkles, title: 'Lembretes Anti-Falta', desc: 'Confirmações e lembretes automáticos no WhatsApp reduzem faltas e horários vazios.' },
  { icon: Bot, title: 'Atendente com IA', desc: 'Um agente treinado pro seu salão tira dúvidas, agenda e vende enquanto você atende.' },
  { icon: DollarSign, title: 'Financeiro & Caixa', desc: 'Entradas, saídas e caixa do dia sob controle. Saiba quanto cada serviço e profissional rende.' },
  { icon: CheckCircle2, title: 'Clientes & Fidelização', desc: 'Histórico, preferências e campanhas pra fazer cada cliente voltar sempre.' },
  { icon: Zap, title: 'Pacotes & Vendas', desc: 'Venda pacotes, planos e produtos com pipeline visual pra fechar mais e acompanhar tudo.' },
  { icon: PieChart, title: 'Relatórios em Tempo Real', desc: 'Faturamento, ocupação da agenda e ranking de profissionais e serviços — num painel só.' },
  { icon: Rocket, title: 'Tudo Integrado', desc: 'Agenda, atendimento, financeiro e vendas conversando entre si, com IA nativa.' },
];

const STEPS = [
  { number: '01', title: 'Organize', desc: 'Cadastre serviços, profissionais e clientes. Em minutos seu salão está pronto pra usar.', icon: Sparkles },
  { number: '02', title: 'Atenda', desc: 'Agenda cheia, WhatsApp respondido pela IA e lembretes que acabam com as faltas.', icon: CalendarDays },
  { number: '03', title: 'Cresça', desc: 'Fidelize clientes, venda pacotes e acompanhe o faturamento crescer.', icon: Rocket },
];

export default function SalesPage() {
  const { platformName } = usePlatformName();
  usePlatformBranding();
  const formRef = useRef<HTMLDivElement>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [buyOpen, setBuyOpen] = useState(false);

  // Captura o tracking (ref do afiliado + UTMs) no 1º carregamento da LP e
  // persiste no cookie 1st-party — sobrevive ao hop LP→checkout.
  useEffect(() => { captureTrackingFromUrl(); }, []);
  const [form, setForm] = useState({
    company_name: '',
    contact_name: '',
    email: '',
    phone: '',
    company_size: '',
    segment: '',
    main_challenge: '',
  });

  const scrollToForm = () => {
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.company_name.trim() || !form.contact_name.trim() || !form.email.trim()) {
      toast.error('Preencha os campos obrigatórios.');
      return;
    }

    setIsSubmitting(true);
    try {
      const params = new URLSearchParams(window.location.search);
      const { error } = await supabase.from('sales_leads').insert({
        ...form,
        utm_source: params.get('utm_source') || null,
        utm_medium: params.get('utm_medium') || null,
        utm_campaign: params.get('utm_campaign') || null,
      });
      if (error) throw error;
      setIsSubmitted(true);
      toast.success('Mensagem enviada com sucesso!');
    } catch {
      toast.error('Erro ao enviar. Tente novamente.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Nav */}
      <nav className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur-lg border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Logo size="sm" />
          <Button onClick={() => setBuyOpen(true)} size="sm">
            Comprar agora <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-32 pb-20 px-4 sm:px-6 lg:px-8 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-primary/5 via-transparent to-transparent" />
        <div className="max-w-5xl mx-auto text-center relative z-10">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
              <Sparkles className="h-4 w-4" /> Gestão completa pro seu salão
            </motion.div>
            <motion.h1 variants={fadeUp} className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight leading-tight mb-6">
              Seu salão organizado, lotado e lucrativo —{' '}
              <span className="text-primary">com inteligência artificial</span>
            </motion.h1>
            <motion.p variants={fadeUp} className="text-lg sm:text-xl text-muted-foreground max-w-3xl mx-auto mb-8">
              Agenda, WhatsApp, clientes, financeiro e vendas em uma só plataforma — com IA que
              atende, confirma horários e cuida das tarefas chatas, pra você focar no cliente na cadeira.
            </motion.p>
            <motion.div variants={fadeUp} className="flex flex-col sm:flex-row gap-4 justify-center">
              <Button size="xl" onClick={() => setBuyOpen(true)}>
                Comprar agora <ArrowRight className="h-5 w-5" />
              </Button>
              <Button size="xl" variant="outline" onClick={scrollToForm}>
                Falar com consultor
              </Button>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* Features */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-7xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
              Tudo que seu salão precisa em um só lugar
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-lg max-w-2xl mx-auto">
              Funcionalidades pensadas pra cada parte da rotina do seu salão.
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
            {FEATURES.map((f) => (
              <motion.div key={f.title} variants={fadeUp}>
                <Card className="h-full bg-card/50 border-border/50 hover:border-primary/30 transition-colors group">
                  <CardContent className="p-5">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center mb-3 group-hover:bg-primary/20 transition-colors">
                      <f.icon className="h-5 w-5 text-primary" />
                    </div>
                    <h3 className="font-semibold text-sm mb-1.5">{f.title}</h3>
                    <p className="text-xs text-muted-foreground leading-relaxed">{f.desc}</p>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* How it works */}
      <section className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-5xl mx-auto">
          <AnimatedSection className="text-center mb-16">
            <motion.h2 variants={fadeUp} className="text-3xl sm:text-4xl font-bold mb-4">
              Como funciona
            </motion.h2>
            <motion.p variants={fadeUp} className="text-muted-foreground text-lg">
              Três passos pra organizar e fazer seu salão crescer.
            </motion.p>
          </AnimatedSection>

          <AnimatedSection className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {STEPS.map((s) => (
              <motion.div key={s.number} variants={fadeUp} className="text-center">
                <div className="h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                  <s.icon className="h-8 w-8 text-primary" />
                </div>
                <span className="text-xs font-bold text-primary uppercase tracking-widest">{s.number}</span>
                <h3 className="text-xl font-bold mt-1 mb-2">{s.title}</h3>
                <p className="text-muted-foreground text-sm">{s.desc}</p>
              </motion.div>
            ))}
          </AnimatedSection>
        </div>
      </section>

      {/* Custom Plans */}
      <section className="py-20 px-4 sm:px-6 lg:px-8">
        <div className="max-w-3xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp}>
              <Card className="bg-gradient-to-br from-primary/10 via-card to-card border-primary/20 overflow-hidden relative">
                <div className="absolute top-0 right-0 w-64 h-64 bg-primary/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                <CardContent className="p-8 sm:p-12 text-center relative z-10">
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/20 text-primary text-sm font-medium mb-4">
                    <Sparkles className="h-4 w-4" /> Planos sob medida
                  </div>
                  <h2 className="text-2xl sm:text-3xl font-bold mb-4">
                    Cada salão é único. Seu plano também.
                  </h2>
                  <p className="text-muted-foreground mb-8 max-w-lg mx-auto">
                    Não vendemos planos genéricos. Entendemos a rotina do seu salão e montamos
                    a configuração ideal — com os módulos, integrações e suporte que você precisa.
                  </p>
                  <Button size="lg" onClick={() => setBuyOpen(true)}>
                    Comprar agora <ArrowRight className="h-5 w-5" />
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </AnimatedSection>
        </div>
      </section>

      {/* Contact Form */}
      <section ref={formRef} id="contato" className="py-20 px-4 sm:px-6 lg:px-8 bg-muted/30">
        <div className="max-w-2xl mx-auto">
          <AnimatedSection>
            <motion.div variants={fadeUp} className="text-center mb-10">
              <h2 className="text-3xl sm:text-4xl font-bold mb-4">
                Fale com um consultor
              </h2>
              <p className="text-muted-foreground text-lg">
                Preencha o formulário e nossa equipe entra em contato em até 24h.
              </p>
            </motion.div>

            {isSubmitted ? (
              <motion.div variants={fadeUp}>
                <Card className="border-primary/30">
                  <CardContent className="p-8 text-center">
                    <CheckCircle2 className="h-16 w-16 text-primary mx-auto mb-4" />
                    <h3 className="text-2xl font-bold mb-2">Mensagem enviada!</h3>
                    <p className="text-muted-foreground">
                      Nosso consultor entrará em contato em breve. Obrigado pelo interesse!
                    </p>
                  </CardContent>
                </Card>
              </motion.div>
            ) : (
              <motion.div variants={fadeUp}>
                <Card>
                  <CardContent className="p-6 sm:p-8">
                    <form onSubmit={handleSubmit} className="space-y-5">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Nome da empresa *</Label>
                          <Input
                            value={form.company_name}
                            onChange={(e) => setForm(p => ({ ...p, company_name: e.target.value }))}
                            placeholder="Sua empresa"
                            required
                            maxLength={100}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Seu nome *</Label>
                          <Input
                            value={form.contact_name}
                            onChange={(e) => setForm(p => ({ ...p, contact_name: e.target.value }))}
                            placeholder="Nome completo"
                            required
                            maxLength={100}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Email *</Label>
                          <Input
                            type="email"
                            value={form.email}
                            onChange={(e) => setForm(p => ({ ...p, email: e.target.value }))}
                            placeholder="email@empresa.com"
                            required
                            maxLength={255}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label>Telefone / WhatsApp</Label>
                          <Input
                            value={form.phone}
                            onChange={(e) => setForm(p => ({ ...p, phone: e.target.value }))}
                            placeholder="(11) 99999-9999"
                            maxLength={20}
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-2">
                          <Label>Tamanho da empresa</Label>
                          <Select value={form.company_size} onValueChange={(v) => setForm(p => ({ ...p, company_size: v }))}>
                            <SelectTrigger>
                              <SelectValue placeholder="Selecione" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="1-5">1 a 5 pessoas</SelectItem>
                              <SelectItem value="6-20">6 a 20 pessoas</SelectItem>
                              <SelectItem value="21-50">21 a 50 pessoas</SelectItem>
                              <SelectItem value="51-200">51 a 200 pessoas</SelectItem>
                              <SelectItem value="200+">Mais de 200</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-2">
                          <Label>Segmento</Label>
                          <Input
                            value={form.segment}
                            onChange={(e) => setForm(p => ({ ...p, segment: e.target.value }))}
                            placeholder="Ex: SaaS, Varejo, Serviços..."
                            maxLength={100}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <Label>Qual seu principal desafio em vendas?</Label>
                        <Textarea
                          value={form.main_challenge}
                          onChange={(e) => setForm(p => ({ ...p, main_challenge: e.target.value }))}
                          placeholder="Conte um pouco sobre os desafios que sua equipe enfrenta hoje..."
                          rows={4}
                          maxLength={1000}
                        />
                      </div>

                      <Button type="submit" size="lg" className="w-full" disabled={isSubmitting}>
                        {isSubmitting ? (
                          <><Loader2 className="h-5 w-5 animate-spin" /> Enviando...</>
                        ) : (
                          <><Send className="h-5 w-5" /> Enviar mensagem</>
                        )}
                      </Button>
                    </form>
                  </CardContent>
                </Card>
              </motion.div>
            )}
          </AnimatedSection>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-border">
        <div className="max-w-7xl mx-auto text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} {platformName}. Todos os direitos reservados.
        </div>
      </footer>

      <LeadCaptureModal open={buyOpen} onOpenChange={setBuyOpen} />
    </div>
  );
}
