import { Link } from "react-router-dom";
import {
  Zap, ArrowRight, CheckCircle2, Car, Users, FileText, ClipboardList,
  DollarSign, BarChart3, Brain, Settings, Shield, ChevronRight,
  Play, Layers, Globe, Copy, TrendingUp, Clock, Wrench, Sparkles, LayoutDashboard
} from "lucide-react";
import { base44 } from "@/api/base44Client";

const modules = [
  { icon: LayoutDashboard, label: "Dashboard", desc: "Visão completa da operação em tempo real" },
  { icon: Users, label: "Clientes", desc: "Ficha completa com histórico e veículos vinculados" },
  { icon: Car, label: "Veículos", desc: "Cadastro com KM, histórico e revisões programadas" },
  { icon: FileText, label: "Orçamentos", desc: "Criação, aprovação e conversão em OS com 1 clique" },
  { icon: ClipboardList, label: "Ordens de Serviço", desc: "Acompanhamento por etapa com técnico responsável" },
  { icon: DollarSign, label: "Financeiro", desc: "Recebimentos, pendências, ticket médio e lucro" },
  { icon: BarChart3, label: "Relatórios", desc: "Faturamento, serviços mais realizados e muito mais" },
  { icon: Brain, label: "AI Growth", desc: "IA que identifica oportunidades e gera mensagens" },
  { icon: Settings, label: "Configurações", desc: "White-label: nome, logo, cores e identidade visual" },
];

const painPoints = [
  "Orçamentos enviados e esquecidos",
  "Clientes que sumem e não voltam",
  "OS sem controle de andamento",
  "Técnico sem visibilidade da fila",
  "Caixa sem clareza de recebimentos",
  "Perda de faturamento por falta de follow-up",
];

const turbosaasPoints = [
  { title: "Sistema pronto para operar", desc: "Funcional desde o primeiro acesso. Sem configuração técnica." },
  { title: "Clone em minutos no Base44", desc: "Você recebe o projeto completo para clonar na sua conta." },
  { title: "Personalize a marca e revenda", desc: "Troque nome, logo, cor e revenda como seu próprio produto SaaS." },
  { title: "Lucro real desde o primeiro cliente", desc: "Estrutura SaaS multiempresa, pronta para faturar recorrência." },
];

const faqItems = [
  { q: "Preciso saber programar para usar?", a: "Não. O sistema é 100% visual, intuitivo e configurável sem código." },
  { q: "Posso usar minha própria marca?", a: "Sim. O white-label permite nome, logo, cores e identidade da sua empresa." },
  { q: "É possível ter múltiplas oficinas?", a: "Sim. A arquitetura é multiempresa — cada oficina tem seus próprios dados isolados." },
  { q: "Como funciona a IA?", a: "A IA opera em modo assistido: identifica oportunidades, sugere ações e gera mensagens prontas para você copiar e enviar." },
];

// Shared styles
const btnPrimary = "inline-flex items-center gap-2 text-white font-bold px-6 py-3 rounded text-sm transition-all hover:opacity-90";
const btnSecondary = "inline-flex items-center gap-2 font-semibold px-6 py-3 rounded text-sm transition-all border";
const card = "rounded border p-5";

export default function LandingPage() {
  return (
    <div className="min-h-screen font-inter" style={{ backgroundColor: "var(--surface)", color: "var(--ink)" }}>

      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-50" style={{ backgroundColor: "var(--surface-raised)", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded flex items-center justify-center" style={{ backgroundColor: "var(--brand)" }}>
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-base tracking-tight" style={{ color: "var(--ink)" }}>AutoFlow AI</span>
          </div>
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium" style={{ color: "var(--ink-muted)" }}>
            <a href="#como-funciona" className="hover:opacity-100 transition-opacity" style={{ color: "var(--ink-muted)" }}>Como funciona</a>
            <a href="#modulos" className="hover:opacity-100 transition-opacity" style={{ color: "var(--ink-muted)" }}>Módulos</a>
            <a href="#turbosaas" className="hover:opacity-100 transition-opacity" style={{ color: "var(--ink-muted)" }}>TurboSaaS</a>
            <a href="#demo" className="hover:opacity-100 transition-opacity" style={{ color: "var(--ink-muted)" }}>Demo</a>
          </nav>
          <button
            onClick={() => base44.auth.redirectToLogin()}
            className="text-sm font-semibold px-4 py-2 rounded border transition-all cursor-pointer hover:opacity-80"
            style={{ borderColor: "var(--line)", color: "var(--ink)", backgroundColor: "transparent" }}
          >
            Entrar
          </button>
        </div>
      </header>

      {/* HERO */}
      <section className="pt-32 pb-24 px-4">
        <div className="max-w-5xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-semibold px-4 py-2 rounded-full mb-8 border"
            style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand)", color: "var(--brand)" }}>
            <Sparkles className="w-3.5 h-3.5" />
            Sistema SaaS por nicho — TurboSaaS Ecosystem
          </div>
          <h1 className="text-5xl sm:text-6xl lg:text-7xl font-black mb-6 leading-tight tracking-tight" style={{ color: "var(--ink)" }}>
            A plataforma que vai{" "}
            <br />
            <span style={{ color: "var(--brand)" }}>transformar sua oficina</span>
          </h1>
          <p className="text-lg sm:text-xl mb-10 max-w-3xl mx-auto leading-relaxed" style={{ color: "var(--ink-muted)" }}>
            Orçamentos, ordens de serviço, clientes, veículos e IA para retorno de clientes — tudo em um sistema feito para a operação real de oficinas e auto centers.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link
              to="/demo/dashboard"
              className={btnPrimary}
              style={{ backgroundColor: "var(--brand)" }}
            >
              <Play className="w-4 h-4" />
              Ver Demonstração
              <ArrowRight className="w-4 h-4" />
            </Link>
            <a
              href="#modulos"
              className={btnSecondary}
              style={{ borderColor: "var(--line)", color: "var(--ink)", backgroundColor: "transparent" }}
            >
              Explorar módulos
            </a>
          </div>
          <div className="mt-10 flex flex-wrap justify-center gap-5 text-sm" style={{ color: "var(--ink-muted)" }}>
            {["Multiempresa", "White-label", "IA assistida", "Orçamento → OS", "Modo Demo incluso"].map((t) => (
              <div key={t} className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" style={{ color: "var(--brand)" }} />
                {t}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TURBOSAAS */}
      <section id="turbosaas" className="py-16 px-4" style={{ backgroundColor: "var(--surface-raised)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full mb-4 border"
              style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand)", color: "var(--brand)" }}>
              <Layers className="w-3.5 h-3.5" />
              TURBOSAAS ECOSYSTEM
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: "var(--ink)" }}>
              Este sistema faz parte do <span style={{ color: "var(--brand)" }}>TurboSaaS</span>
            </h2>
            <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--ink-muted)" }}>
              O AutoFlow AI não é apenas um software para oficina — é um <strong style={{ color: "var(--ink)" }}>ativo SaaS pronto para clonar, personalizar e revender</strong> como seu próprio produto.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {turbosaasPoints.map((p, i) => (
              <div key={i} className={card} style={{ backgroundColor: "var(--surface)", borderColor: "var(--line-soft)" }}>
                <div className="w-8 h-8 rounded text-sm font-black flex items-center justify-center mb-4 text-white" style={{ backgroundColor: "var(--brand)" }}>{i + 1}</div>
                <h3 className="font-bold mb-2 text-sm" style={{ color: "var(--ink)" }}>{p.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>{p.desc}</p>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/demo/dashboard" className={btnPrimary} style={{ backgroundColor: "var(--brand)" }}>
              <Copy className="w-4 h-4" />
              Ver o sistema em ação
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* DOR DO MERCADO */}
      <section className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: "var(--ink)" }}>Sua oficina ainda sofre com isso?</h2>
            <p className="text-base" style={{ color: "var(--ink-muted)" }}>Problemas comuns em oficinas que operam sem um sistema adequado.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {painPoints.map((p, i) => (
              <div key={i} className={card + " flex items-start gap-3"} style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
                <div className="w-1.5 h-1.5 rounded-full mt-2 flex-shrink-0" style={{ backgroundColor: "var(--ink)" }} />
                <span className="text-sm" style={{ color: "var(--ink)" }}>{p}</span>
              </div>
            ))}
          </div>
          <div className="text-center mt-10">
            <p className="text-base mb-6" style={{ color: "var(--ink-muted)" }}>O AutoFlow AI resolve todos esses pontos de uma vez.</p>
            <Link to="/demo/dashboard" className={btnPrimary} style={{ backgroundColor: "var(--brand)" }}>
              Ver como funciona na prática
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="py-20 px-4" style={{ backgroundColor: "var(--surface-raised)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: "var(--ink)" }}>Como funciona na prática</h2>
            <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--ink-muted)" }}>Fluxo completo do atendimento ao fechamento, com IA assistindo cada etapa.</p>
          </div>
          <div className="grid md:grid-cols-4 gap-5">
            {[
              { icon: Users, step: "01", title: "Cadastro de cliente e veículo", desc: "Crie a ficha completa com histórico vinculado ao veículo." },
              { icon: FileText, step: "02", title: "Orçamento detalhado", desc: "Monte o orçamento com itens, valores e envie para aprovação." },
              { icon: ClipboardList, step: "03", title: "Aprovação → Ordem de Serviço", desc: "Orçamento aprovado vira OS automaticamente, reaproveitando todos os itens." },
              { icon: Brain, step: "04", title: "IA monitora e sugere", desc: "A IA identifica oportunidades e gera mensagens de follow-up prontas." },
            ].map((s) => (
              <div key={s.step} className={card} style={{ backgroundColor: "var(--surface)", borderColor: "var(--line-soft)" }}>
                <div className="font-black text-3xl mb-3 opacity-20" style={{ color: "var(--ink)" }}>{s.step}</div>
                <s.icon className="w-5 h-5 mb-3" style={{ color: "var(--brand)" }} />
                <h3 className="font-bold text-sm mb-2" style={{ color: "var(--ink)" }}>{s.title}</h3>
                <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* MÓDULOS */}
      <section id="modulos" className="py-20 px-4">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-14">
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: "var(--ink)" }}>Módulos completos do sistema</h2>
            <p className="text-base" style={{ color: "var(--ink-muted)" }}>Tudo que uma oficina precisa, em um único lugar.</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {modules.map((m) => (
              <div key={m.label} className={card + " flex items-start gap-4 group transition-all cursor-default"} style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
                <div className="w-9 h-9 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--brand-subtle)" }}>
                  <m.icon className="w-4 h-4" style={{ color: "var(--brand)" }} />
                </div>
                <div>
                  <h3 className="font-bold text-sm mb-1" style={{ color: "var(--ink)" }}>{m.label}</h3>
                  <p className="text-xs leading-relaxed" style={{ color: "var(--ink-muted)" }}>{m.desc}</p>
                </div>
              </div>
            ))}
          </div>
          <div className="text-center mt-8">
            <Link to="/demo/dashboard" className={btnPrimary} style={{ backgroundColor: "var(--brand)" }}>
              Explorar todos os módulos na demo
              <ArrowRight className="w-4 h-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* IA EXPLICADA */}
      <section className="py-20 px-4" style={{ backgroundColor: "var(--surface-raised)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="grid lg:grid-cols-2 gap-12 items-start">
            <div>
              <div className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full mb-6 border"
                style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand)", color: "var(--brand)" }}>
                <Brain className="w-3.5 h-3.5" />
                AI GROWTH ENGINE
              </div>
              <h2 className="text-3xl sm:text-4xl font-black mb-6" style={{ color: "var(--ink)" }}>
                IA que trabalha <span style={{ color: "var(--brand)" }}>por você</span>
              </h2>
              <p className="text-base mb-8" style={{ color: "var(--ink-muted)" }}>
                O AI Growth Engine monitora sua operação 24h e identifica oportunidades que você perderia manualmente.
              </p>
              <div className="space-y-3">
                {[
                  { icon: Clock, title: "Clientes sem retorno", desc: "Detecta clientes inativos e sugere momento ideal de contato" },
                  { icon: FileText, title: "Orçamentos parados", desc: "Identifica follow-ups em aberto e gera mensagem personalizada" },
                  { icon: Wrench, title: "OS paradas", desc: "Alerta quando uma OS está parada além do prazo esperado" },
                  { icon: TrendingUp, title: "Revisões próximas", desc: "Avisa quando veículo está próximo do KM ou prazo de revisão" },
                ].map((item) => (
                  <div key={item.title} className={card + " flex items-start gap-4"} style={{ backgroundColor: "var(--surface)", borderColor: "var(--line-soft)" }}>
                    <div className="w-8 h-8 rounded flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "var(--brand-subtle)" }}>
                      <item.icon className="w-4 h-4" style={{ color: "var(--brand)" }} />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm" style={{ color: "var(--ink)" }}>{item.title}</h4>
                      <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{item.desc}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* AI Preview card */}
            <div className={card} style={{ backgroundColor: "var(--surface)", borderColor: "var(--line)" }}>
              <div className="text-xs font-bold mb-4 flex items-center gap-2" style={{ color: "var(--brand)" }}>
                <Brain className="w-3.5 h-3.5" />
                AI GROWTH — INSIGHTS ATIVOS
              </div>
              {[
                { badge: "URGENTE", urgent: true, msg: "Fernanda Costa está há 90 dias sem retornar. Mensagem sugerida disponível." },
                { badge: "URGENTE", urgent: true, msg: "Orçamento de R$ 2.340 sem resposta há 4 dias (correia dentada — risco real)." },
                { badge: "ATENÇÃO", urgent: false, msg: "Honda HR-V de Ricardo está próximo dos 25.000 km. Agendar revisão preventiva." },
              ].map((item, i) => (
                <div key={i} className={card + " mb-3"} style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
                  <div className="mb-2">
                    <span className="text-xs font-bold px-2 py-0.5 rounded"
                      style={{
                        backgroundColor: item.urgent ? "#FEE2E2" : "#FEF3C7",
                        color: item.urgent ? "#991B1B" : "#92400E"
                      }}>
                      {item.badge}
                    </span>
                  </div>
                  <p className="text-sm" style={{ color: "var(--ink)" }}>{item.msg}</p>
                  <button className="mt-2 text-xs font-semibold flex items-center gap-1" style={{ color: "var(--brand)" }}>
                    Ver mensagem sugerida <ChevronRight className="w-3 h-3" />
                  </button>
                </div>
              ))}
              <Link
                to="/demo/ai-growth"
                className="text-sm font-semibold flex items-center justify-center gap-2 py-2 mt-1"
                style={{ color: "var(--brand)" }}
              >
                Ver todos os insights na demo <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* DEMO CTA */}
      <section id="demo" className="py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full mb-6 border"
            style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand)", color: "var(--brand)" }}>
            <Play className="w-3.5 h-3.5" />
            DEMONSTRAÇÃO AO VIVO
          </div>
          <h2 className="text-4xl sm:text-5xl font-black mb-6" style={{ color: "var(--ink)" }}>
            Veja o sistema <span style={{ color: "var(--brand)" }}>funcionando agora</span>
          </h2>
          <p className="text-lg mb-10 max-w-2xl mx-auto" style={{ color: "var(--ink-muted)" }}>
            Acesse a demo pública com dados reais fictícios. Sem cadastro, sem login — navegue à vontade por todos os módulos.
          </p>
          <Link
            to="/demo/dashboard"
            className="inline-flex items-center gap-3 text-white font-black px-10 py-5 rounded text-xl transition-all hover:opacity-90"
            style={{ backgroundColor: "var(--brand)" }}
          >
            <Play className="w-6 h-6" />
            Acessar Demonstração Gratuita
            <ArrowRight className="w-6 h-6" />
          </Link>
          <p className="text-xs mt-4" style={{ color: "var(--ink-muted)" }}>Sem cadastro · Dados fictícios · Navegação livre</p>
        </div>
      </section>

      {/* WHITE LABEL */}
      <section className="py-20 px-4" style={{ backgroundColor: "var(--surface-raised)", borderTop: "1px solid var(--line-soft)", borderBottom: "1px solid var(--line-soft)" }}>
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-12">
            <div className="inline-flex items-center gap-2 text-xs font-bold px-4 py-2 rounded-full mb-4 border"
              style={{ backgroundColor: "var(--brand-subtle)", borderColor: "var(--brand)", color: "var(--brand)" }}>
              <Globe className="w-3.5 h-3.5" />
              WHITE-LABEL
            </div>
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: "var(--ink)" }}>Sua marca. Seu produto. Seu negócio.</h2>
            <p className="text-base max-w-2xl mx-auto" style={{ color: "var(--ink-muted)" }}>
              Cada oficina configura sua própria identidade. Você revende como seu SaaS automotivo premium.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: "Nome e Logo personalizados", desc: "Coloque o nome e logo da sua empresa ou do seu cliente." },
              { title: "Cor principal e secundária", desc: "Adapte a identidade visual para qualquer marca." },
              { title: "Dados da oficina", desc: "Endereço, telefone, horários e informações de contato." },
              { title: "Mensagens padrão", desc: "Textos personalizados para cada etapa da jornada do cliente." },
              { title: "Plano e licença", desc: "Controle de acesso por plano com painel master dedicado." },
              { title: "Multiempresa isolado", desc: "Cada oficina tem seu ambiente totalmente isolado." },
            ].map((item, i) => (
              <div key={i} className={card} style={{ backgroundColor: "var(--surface)", borderColor: "var(--line-soft)" }}>
                <CheckCircle2 className="w-4 h-4 mb-3" style={{ color: "var(--brand)" }} />
                <h3 className="font-bold text-sm mb-1" style={{ color: "var(--ink)" }}>{item.title}</h3>
                <p className="text-xs" style={{ color: "var(--ink-muted)" }}>{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-20 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-black mb-4" style={{ color: "var(--ink)" }}>Perguntas frequentes</h2>
          </div>
          <div className="space-y-3">
            {faqItems.map((item, i) => (
              <div key={i} className={card} style={{ backgroundColor: "var(--surface-raised)", borderColor: "var(--line-soft)" }}>
                <h3 className="font-bold text-sm mb-1" style={{ color: "var(--ink)" }}>{item.q}</h3>
                <p className="text-sm" style={{ color: "var(--ink-muted)" }}>{item.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA FINAL */}
      <section className="py-24 px-4" style={{ backgroundColor: "var(--brand)", borderTop: "1px solid var(--line)" }}>
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-4xl sm:text-5xl font-black mb-6 text-white">
            Pronto para ver o AutoFlow AI em ação?
          </h2>
          <p className="text-lg mb-10 text-white/75">
            Acesse a demonstração completa agora mesmo. Sem cadastro, sem compromisso.
          </p>
          <Link
            to="/demo/dashboard"
            className="inline-flex items-center gap-3 font-black px-10 py-5 rounded text-xl transition-all hover:opacity-90"
            style={{ backgroundColor: "var(--surface)", color: "var(--brand)" }}
          >
            <Zap className="w-6 h-6" />
            Acessar Demo Gratuita
            <ArrowRight className="w-6 h-6" />
          </Link>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4" style={{ backgroundColor: "var(--ink)", borderTop: "1px solid #2a2a2a" }}>
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded flex items-center justify-center" style={{ backgroundColor: "var(--brand)" }}>
              <Zap className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="text-white font-bold">AutoFlow AI</span>
            <span className="text-gray-600 text-sm">— TurboSaaS Ecosystem</span>
          </div>
          <div className="text-sm" style={{ color: "#6B6B6B" }}>Sistema SaaS para oficinas e auto centers</div>
        </div>
      </footer>
    </div>
  );
}