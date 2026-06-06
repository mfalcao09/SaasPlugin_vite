import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import {
  Dumbbell, Zap, Users, CreditCard, CheckSquare, DollarSign,
  BarChart3, Brain, ChevronRight, Star, TrendingUp, Shield,
  Clock, Target, ArrowRight, Play
} from "lucide-react";

const features = [
  { icon: Users, title: "Gestão Completa de Alunos", desc: "Cadastro, histórico, frequência, plano e tudo sobre cada aluno em um só lugar." },
  { icon: CreditCard, title: "Planos e Mensalidades", desc: "Crie planos flexíveis, controle vencimentos e nunca perca uma renovação." },
  { icon: CheckSquare, title: "Check-ins em Tempo Real", desc: "Registre presenças rapidamente e acompanhe a frequência de cada aluno." },
  { icon: DollarSign, title: "Financeiro Organizado", desc: "Receitas, despesas, inadimplências e saldo sempre visíveis e atualizados." },
  { icon: BarChart3, title: "Relatórios Inteligentes", desc: "Visualize a saúde do seu negócio com gráficos e KPIs em tempo real." },
  { icon: Brain, title: "AI Growth Engine", desc: "Inteligência artificial que identifica oportunidades e sugere ações para crescer mais." },
];

const benefits = [
  { icon: TrendingUp, title: "Mais renovações", desc: "O sistema alerta automaticamente quando um aluno está prestes a cancelar ou sumir." },
  { icon: Clock, title: "Menos trabalho manual", desc: "Automatize cobranças, alertas de vencimento e comunicação com alunos." },
  { icon: Target, title: "Retenção com IA", desc: "O AI Growth Engine identifica quem está em risco e sugere a mensagem certa na hora certa." },
  { icon: Shield, title: "Tudo organizado", desc: "Financeiro, equipe, agenda e alunos em um só lugar. Sem planilha, sem papel." },
];

const testimonials = [
  { name: "Marina Costa", role: "Dona de Studio Pilates", text: "Antes eu perdia renovação toda semana. Com o GymBoss, a IA me avisa com antecedência e eu já entro em contato. Dobrei a retenção.", avatar: "M" },
  { name: "Carlos Menezes", role: "Dono de Box CrossFit", text: "O controle de frequência e financeiro juntos num sistema dark e profissional. Minha equipe amou.", avatar: "C" },
  { name: "Patricia Lima", role: "Gestora de Academia Funcional", text: "O AI Growth Engine gerou a mensagem pra mim, mandei pro WhatsApp e o aluno renovou no mesmo dia.", avatar: "P" },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-gym-surface text-gym-text font-inter">

      {/* NAV */}
      <header className="fixed top-0 w-full z-50 border-b border-gym-border backdrop-blur-md bg-white/95">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 bg-gym-orange rounded-lg flex items-center justify-center shadow-sm">
              <Dumbbell className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-gym-text text-lg tracking-tight">GymBoss <span className="text-gym-orange">AI</span></span>
          </div>
          <div className="flex items-center gap-3">
            <Link to="/demo/dashboard" className="text-sm text-gym-muted hover:text-gym-text transition-colors hidden sm:block">Ver demonstração</Link>
            <button onClick={() => base44.auth.redirectToLogin(window.location.origin + "/app/dashboard")}
              className="text-sm text-gym-muted hover:text-gym-text border border-gym-border/60 bg-white px-4 py-2 rounded-lg transition-all hidden sm:block">
              Entrar
            </button>
            <Link to="/demo/dashboard"
              className="bg-gym-orange hover:bg-gym-orange-light text-white text-sm font-semibold px-4 py-2 rounded-lg transition-all shadow-sm">
              Ver demo
            </Link>
          </div>
        </div>
      </header>

      {/* HERO */}
      <section className="pt-32 pb-20 px-6 relative overflow-hidden bg-gradient-to-b from-white to-gym-surface">
        {/* glow bg */}
        <div className="absolute top-20 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-gym-orange/3 rounded-full blur-3xl pointer-events-none" />
        <div className="max-w-5xl mx-auto text-center relative">
          <div className="inline-flex items-center gap-2 bg-gym-orange/10 border border-gym-orange/20 rounded-full px-4 py-1.5 text-xs text-gym-orange font-semibold mb-6 uppercase tracking-wide">
            <Zap className="w-3 h-3" />
            Inteligência Artificial para Academias
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight tracking-tight mb-6">
            Gerencie sua academia.<br />
            <span className="text-gym-orange">Retenha mais alunos.</span><br />
            <span className="text-white/60">Com inteligência artificial.</span>
          </h1>
          <p className="text-lg text-gym-muted max-w-2xl mx-auto mb-10 leading-relaxed">
            O GymBoss AI é o sistema operacional completo para academias, studios e boxes. 
            Controle alunos, planos, financeiro e deixe a IA trabalhar para você crescer.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/demo/dashboard"
              className="inline-flex items-center justify-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white font-bold text-base px-8 py-4 rounded-xl transition-all shadow-lg shadow-gym-orange/20 hover:shadow-gym-orange/30">
              <Play className="w-4 h-4" />
              Ver demonstração ao vivo
            </Link>
            <a href="#beneficios"
              className="inline-flex items-center justify-center gap-2 border border-gym-border text-gym-muted hover:text-gym-text hover:border-gym-border font-semibold text-base px-8 py-4 rounded-xl transition-all">
              Saber mais
              <ChevronRight className="w-4 h-4" />
            </a>
          </div>
          <p className="text-xs text-gym-subtle mt-4">Sem cartão de crédito. Sem instalação. Acesse agora.</p>
        </div>

        {/* Dashboard mockup */}
        <div className="max-w-5xl mx-auto mt-16 relative">
          <div className="absolute inset-0 bg-gradient-to-t from-gym-surface via-transparent to-transparent z-10 pointer-events-none" style={{ top: "60%" }} />
          <div className="bg-white border border-gym-border rounded-2xl overflow-hidden shadow-xl">
            {/* Fake topbar */}
            <div className="bg-gym-surface border-b border-gym-border px-4 py-3 flex items-center gap-3">
              <div className="flex gap-1.5">
                <div className="w-3 h-3 rounded-full bg-gym-red/60" />
                <div className="w-3 h-3 rounded-full bg-gym-yellow/60" />
                <div className="w-3 h-3 rounded-full bg-gym-green/60" />
              </div>
              <div className="flex-1 bg-gym-orange/10 rounded-md h-5 max-w-xs" />
            </div>
            {/* Fake dashboard layout */}
            <div className="flex h-[360px]">
              {/* Fake sidebar */}
              <div className="w-48 bg-gym-dark border-r border-gym-border p-3 hidden md:block flex-shrink-0">
                <div className="flex items-center gap-2 mb-5 px-2 pt-1">
                  <div className="w-6 h-6 bg-gym-orange rounded-md flex items-center justify-center"><Dumbbell className="w-3 h-3 text-white" /></div>
                  <span className="text-xs font-bold text-white">GymBoss AI</span>
                </div>
                {["Dashboard", "Alunos", "Planos", "Check-ins", "Financeiro", "AI Growth"].map((item, i) => (
                  <div key={item} className={`flex items-center gap-2 px-2 py-2 rounded-lg text-xs mb-0.5 ${i === 0 ? "bg-gym-orange/15 text-gym-orange font-semibold" : "text-gym-subtle"}`}>
                    <div className={`w-1.5 h-1.5 rounded-full ${i === 0 ? "bg-gym-orange" : "bg-gym-border"}`} />
                    {item}
                  </div>
                ))}
              </div>
              {/* Fake content */}
              <div className="flex-1 p-4 overflow-hidden">
                <div className="grid grid-cols-3 gap-3 mb-4">
                  {[
                     { label: "Alunos Ativos", value: "247", color: "text-gym-orange" },
                     { label: "Check-ins Hoje", value: "38", color: "text-gym-green" },
                     { label: "Receita do Mês", value: "R$ 28.4k", color: "text-gym-blue" },
                   ].map(({ label, value, color }) => (
                     <div key={label} className="bg-gym-surface border border-gym-border rounded-xl p-3">
                       <div className={`text-lg font-bold ${color} text-tabular`}>{value}</div>
                       <div className="text-[10px] text-gym-subtle mt-0.5">{label}</div>
                     </div>
                   ))}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-gym-surface border border-gym-border rounded-xl p-3">
                    <div className="text-[10px] text-gym-subtle mb-3">Check-ins — Últimos 7 dias</div>
                    <div className="flex items-end gap-1.5 h-16">
                      {[40, 65, 55, 80, 70, 90, 75].map((h, i) => (
                        <div key={i} className="flex-1 bg-gym-orange/20 rounded-sm relative" style={{ height: `${h}%` }}>
                          {i === 5 && <div className="absolute inset-0 bg-gym-orange rounded-sm" />}
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="bg-gym-surface border border-gym-border rounded-xl p-3">
                    <div className="text-[10px] text-gym-subtle mb-2">AI Growth — Alertas</div>
                    {["⚡ Ana Lima ausente 32 dias", "💳 Carlos — plano vence em 2 dias", "📉 3 alunos em queda de frequência"].map((a, i) => (
                      <div key={i} className="text-[9px] text-gym-muted py-1 border-b border-gym-border/30 last:border-0">{a}</div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PROBLEMA QUE RESOLVE */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-black mb-4 text-gym-text">Sua academia ainda perde alunos sem saber por quê?</h2>
          <p className="text-gym-muted text-lg mb-12 max-w-2xl mx-auto">
            A maioria das academias perde 20-40% dos alunos todo mês por falta de acompanhamento. 
            O GymBoss AI resolve isso com dados e inteligência artificial.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {[
              { emoji: "📉", problem: "Alunos somem sem avisar", solution: "IA identifica risco antes do cancelamento" },
              { emoji: "💸", problem: "Mensalidades vencendo esquecidas", solution: "Alertas automáticos de renovação" },
              { emoji: "📊", problem: "Sem visão financeira clara", solution: "Dashboard com KPIs em tempo real" },
            ].map(({ emoji, problem, solution }) => (
              <div key={problem} className="bg-white border border-gym-border rounded-xl p-6 text-left shadow-sm">
                <div className="text-3xl mb-3">{emoji}</div>
                <div className="text-sm text-gym-red font-semibold mb-2">Problema: {problem}</div>
                <div className="text-sm text-gym-green">✓ {solution}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FEATURES */}
      <section className="py-20 px-6 bg-gym-surface" id="beneficios">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black mb-4 text-gym-text">Tudo que sua academia precisa</h2>
            <p className="text-gym-muted max-w-xl mx-auto">Um sistema completo e integrado. Não são ferramentas separadas — é um OS completo para o seu negócio.</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {features.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border border-gym-border hover:shadow-md rounded-xl p-6 transition-all group shadow-sm">
                <div className="w-10 h-10 bg-gym-orange/12 rounded-lg flex items-center justify-center mb-4 group-hover:bg-gym-orange/15 transition-all">
                  <Icon className="w-5 h-5 text-gym-orange" />
                </div>
                <h3 className="font-bold text-gym-text mb-2">{title}</h3>
                <p className="text-sm text-gym-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* AI GROWTH ENGINE */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
            <div>
              <div className="inline-flex items-center gap-2 bg-gym-orange/10 border border-gym-orange/20 rounded-full px-3 py-1 text-xs text-gym-orange font-semibold mb-4 uppercase tracking-wide">
                <Zap className="w-3 h-3" /> AI Growth Engine
              </div>
              <h2 className="text-3xl font-black mb-4 text-gym-text">A IA que trabalha para você crescer</h2>
              <p className="text-gym-muted mb-6 leading-relaxed">
                O AI Growth Engine analisa os dados da sua academia automaticamente e identifica as oportunidades 
                que você estaria perdendo — alunos prestes a sair, renovações chegando, inadimplências acumulando.
              </p>
              <div className="space-y-3 mb-8">
                {[
                  "Identifica alunos em risco de cancelamento",
                  "Alerta sobre planos vencendo nos próximos dias",
                  "Detecta queda de frequência antes que o aluno suma",
                  "Sugere mensagens personalizadas por WhatsApp",
                  "Gera texto de reativação em 1 clique com IA",
                ].map(item => (
                  <div key={item} className="flex items-center gap-3 text-sm">
                    <div className="w-5 h-5 rounded-full bg-gym-green/20 flex items-center justify-center flex-shrink-0">
                      <div className="w-1.5 h-1.5 rounded-full bg-gym-green" />
                    </div>
                    <span className="text-gym-muted">{item}</span>
                  </div>
                ))}
              </div>
              <Link to="/demo/ai-growth"
                className="inline-flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white font-semibold px-6 py-3 rounded-lg transition-all text-sm">
                <Zap className="w-4 h-4" /> Ver AI Growth em ação
              </Link>
              <Link to="/demo/dashboard"
                className="inline-flex items-center gap-2 border border-gym-border text-gym-muted hover:text-gym-text font-semibold px-6 py-3 rounded-lg transition-all text-sm">
                <Play className="w-4 h-4" /> Ver demo completa
              </Link>
            </div>
            {/* AI mockup card */}
            <div className="bg-gym-surface border border-gym-border rounded-2xl p-5 space-y-3 shadow-sm">
              <div className="flex items-center gap-2 mb-4">
                <Zap className="w-4 h-4 text-gym-orange" />
                <span className="text-sm font-bold text-gym-text">AI Growth Engine</span>
                <span className="ml-auto text-[10px] text-gym-orange bg-gym-orange/10 px-2 py-0.5 rounded-full font-semibold">3 alertas</span>
              </div>
              {[
                { priority: "alta", color: "text-gym-red", bg: "border-gym-red/20 bg-gym-red/5", title: "Ana Lima ausente há 34 dias", action: "Enviar reativação urgente", metric: "34 dias sem check-in" },
                { priority: "alta", color: "text-gym-yellow", bg: "border-gym-yellow/20 bg-gym-yellow/5", title: "Carlos M. — plano vence em 2 dias", action: "Oferecer renovação com desconto", metric: "Vence em 2 dias" },
                { priority: "media", color: "text-gym-blue", bg: "border-gym-blue/20 bg-gym-blue/5", title: "5 alunos com queda de frequência", action: "Criar campanha de reengajamento", metric: "Menos de 4 check-ins no mês" },
              ].map(({ priority, color, bg, title, action, metric }) => (
                <div key={title} className={`border ${bg} rounded-xl p-4`}>
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-semibold text-white">{title}</span>
                    <span className={`text-[9px] uppercase font-bold border px-1.5 py-0.5 rounded ${color} border-current`}>{priority}</span>
                  </div>
                  <div className="text-xs text-gym-subtle mb-2">{metric}</div>
                  <div className="text-xs text-gym-orange">{action}</div>
                  <button className="mt-2 text-[10px] border border-gym-orange/30 text-gym-orange px-2 py-1 rounded flex items-center gap-1">
                    <Zap className="w-2.5 h-2.5" /> Gerar mensagem IA
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS */}
      <section className="py-20 px-6 bg-gym-surface">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black mb-4 text-gym-text">Resultados reais para o seu negócio</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {benefits.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="bg-white border border-gym-border rounded-xl p-6 text-center shadow-sm">
                <div className="w-12 h-12 bg-gym-orange/12 rounded-xl flex items-center justify-center mx-auto mb-4">
                  <Icon className="w-6 h-6 text-gym-orange" />
                </div>
                <h3 className="font-bold text-gym-text mb-2">{title}</h3>
                <p className="text-sm text-gym-muted leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* DEPOIMENTOS */}
      <section className="py-20 px-6 bg-white">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl font-black mb-4 text-gym-text">Quem usa, não volta para planilha</h2>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {testimonials.map(({ name, role, text, avatar }) => (
              <div key={name} className="bg-white border border-gym-border rounded-xl p-6 shadow-sm">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, i) => <Star key={i} className="w-3.5 h-3.5 text-gym-yellow fill-gym-yellow" />)}
                </div>
                <p className="text-sm text-gym-muted leading-relaxed mb-4">"{text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-gym-orange/15 flex items-center justify-center text-gym-orange font-bold text-sm">{avatar}</div>
                  <div>
                    <div className="text-sm font-semibold text-gym-text">{name}</div>
                    <div className="text-xs text-gym-subtle">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-24 px-6 relative overflow-hidden bg-gym-surface">
        <div className="absolute inset-0 bg-gym-orange/3 pointer-events-none" />
        <div className="max-w-3xl mx-auto text-center relative">
          <h2 className="text-4xl font-black mb-4 text-gym-text">Pronto para transformar sua academia?</h2>
          <p className="text-gym-muted text-lg mb-8">Veja o sistema funcionando ao vivo. Sem login, sem compromisso.</p>
          <Link to="/demo/dashboard"
            className="inline-flex items-center gap-2 bg-gym-orange hover:bg-gym-orange-light text-white font-bold text-lg px-10 py-4 rounded-xl transition-all shadow-xl shadow-gym-orange/30">
            <Play className="w-5 h-5" />
            Explorar demonstração
          </Link>
          <p className="text-xs text-gym-subtle mt-4">Demonstração completa. Sem cadastro.</p>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-gym-border py-8 px-6 bg-white">
        <div className="max-w-5xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 bg-gym-orange rounded-md flex items-center justify-center shadow-sm">
              <Dumbbell className="w-3 h-3 text-white" />
            </div>
            <span className="text-sm font-bold text-gym-text">GymBoss <span className="text-gym-orange">AI</span></span>
          </div>
          <div className="text-xs text-gym-subtle text-center">Sistema operacional para academias, studios e boxes.</div>
          <Link to="/demo/dashboard" className="text-xs text-gym-orange hover:underline">Ver demonstração</Link>
        </div>
      </footer>
    </div>
  );
}