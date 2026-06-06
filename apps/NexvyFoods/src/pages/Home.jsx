import React from 'react';
import { Link } from 'react-router-dom';
import { base44 } from '@/api/base44Client';
import { useDocumentTitle } from '@/hooks/useDocumentTitle';
import { ArrowRight, CheckCircle, Zap, BarChart3, Smartphone, TrendingUp, Clock, MapPin, ChefHat, Truck, Star, ShoppingBag } from 'lucide-react';

export default function Home() {
  useDocumentTitle('FoodControl AI — Seu Delivery Próprio, Sem Comissão');
  
  const handleLogin = () => {
    window.location.href = '/login';
  };
  return (
    <div className="min-h-screen bg-[#F8F7F3] font-inter">
      {/* Navigation */}
      <nav className="bg-[#F8F7F3] border-b border-[#1a1a1a]/12 sticky top-0 z-50 backdrop-blur-sm">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-accent rounded-lg flex items-center justify-center">
              <ChefHat className="w-4 h-4 text-white" />
            </div>
            <span className="text-lg font-bold text-foreground">FoodControl AI</span>
          </div>
          <button 
            onClick={handleLogin}
            className="px-5 py-2 bg-foreground text-background rounded-lg text-sm font-medium hover:bg-foreground/90 transition-colors"
          >
            Entrar
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="pt-20 pb-24 px-6">
        <div className="max-w-4xl mx-auto text-center">
          <div className="inline-flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-full px-4 py-2 mb-8">
            <span className="w-2 h-2 bg-accent rounded-full"></span>
            <span className="text-sm font-medium text-accent">Parte do ecossistema TurboSaaS</span>
          </div>
          <h1 className="text-5xl md:text-6xl font-bold text-foreground leading-tight mb-6">
            Seu delivery próprio.<br />
            <span className="text-accent">Sem pagar comissão</span><br />
            para ninguém.
          </h1>
          <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto leading-relaxed">
            Crie seu cardápio, gere um link de pedidos direto para seus clientes e opere tudo — cozinha, entrega e financeiro — em um só lugar.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Link to="/demo/dashboard">
              <button className="inline-flex items-center gap-2 px-8 py-4 bg-accent text-white rounded-xl text-lg font-semibold hover:bg-accent/90 transition-colors">
                Ver Demo ao Vivo <ArrowRight className="w-5 h-5" />
              </button>
            </Link>
            <Link to="/demo/pedidos">
              <button className="inline-flex items-center gap-2 px-8 py-4 bg-white border border-border rounded-xl text-lg font-medium hover:bg-secondary transition-colors text-foreground">
                Como funciona
              </button>
            </Link>
          </div>
          <p className="text-sm text-muted-foreground mt-6">Sem cadastro necessário. Demo completa disponível agora.</p>
        </div>
      </section>

      {/* Problema */}
      <section className="py-20 px-6 bg-foreground text-background">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">O problema real</p>
            <h2 className="text-4xl font-bold leading-tight">
              Você trabalha muito.<br />Mas boa parte do lucro vai para o app.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            <div className="space-y-3 p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-3xl font-bold text-accent">30%</div>
              <h3 className="font-bold text-lg">De comissão por pedido</h3>
              <p className="text-sm text-white/60">Marketplaces cobram uma fatia enorme de cada venda. Em cima do seu preço, do seu produto, do seu cliente.</p>
            </div>
            <div className="space-y-3 p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-3xl font-bold text-accent">0</div>
              <h3 className="font-bold text-lg">Controle sobre seus dados</h3>
              <p className="text-sm text-white/60">Os apps de terceiros guardam os dados dos seus clientes. Você não sabe quem são, não pode fidelizar, não tem histórico.</p>
            </div>
            <div className="space-y-3 p-6 rounded-2xl bg-white/5 border border-white/10">
              <div className="text-3xl font-bold text-accent">∞</div>
              <h3 className="font-bold text-lg">Dependência crescente</h3>
              <p className="text-sm text-white/60">Quanto mais você cresce nos apps, mais você depende deles. Taxas, posição no ranking, campanhas pagas. Tudo sob controle deles.</p>
            </div>
          </div>
        </div>
      </section>

      {/* Solução */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">A virada</p>
            <h2 className="text-4xl font-bold text-foreground">Canal próprio + operação organizada</h2>
            <p className="text-lg text-muted-foreground mt-4 max-w-2xl mx-auto">
              Com o FoodControl AI, você tem seu próprio canal de pedidos — sem comissão — e uma operação interna completa para processar tudo.
            </p>
          </div>
          <div className="grid md:grid-cols-2 gap-12 items-center">
            <div className="space-y-6">
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Smartphone className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">Link próprio de pedidos</h3>
                  <p className="text-sm text-muted-foreground">Um link seu, com sua marca, no seu Instagram, no seu WhatsApp, em qualquer lugar. O cliente abre, escolhe, pede.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <ChefHat className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">Painel da cozinha</h3>
                  <p className="text-sm text-muted-foreground">Pedido chega, cozinha vê em tempo real. Itens, observações, prioridade. Tudo claro, tudo rápido.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Truck className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">Gestão de motoboys e entregas</h3>
                  <p className="text-sm text-muted-foreground">Atribua motoboys, acompanhe o status da entrega, calcule taxas por bairro automaticamente.</p>
                </div>
              </div>
              <div className="flex gap-4">
                <div className="w-10 h-10 bg-accent/10 rounded-xl flex items-center justify-center flex-shrink-0">
                  <Zap className="w-5 h-5 text-accent" />
                </div>
                <div>
                  <h3 className="font-bold text-foreground mb-1">IA para crescer mais</h3>
                  <p className="text-sm text-muted-foreground">Detecta clientes inativos, horários fracos, combos, bairros fortes. Sugere ações concretas para vender mais.</p>
                </div>
              </div>
            </div>
            <div className="bg-foreground rounded-2xl p-6 text-background">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-10 h-10 bg-accent rounded-xl flex items-center justify-center">
                  <ChefHat className="w-5 h-5 text-white" />
                </div>
                <div>
                  <p className="font-bold">Hamburgueria do Zé</p>
                  <p className="text-xs text-white/50">foodcontrol.app/pedido/hamburgueria-ze</p>
                </div>
              </div>
              <div className="space-y-3">
                {[
                  { name: 'Smash Burger Duplo', price: 'R$ 32,00', tag: '🔥 Destaque' },
                  { name: 'X-Bacon Especial', price: 'R$ 28,00', tag: '' },
                  { name: 'Batata Frita Grande', price: 'R$ 16,00', tag: '' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between bg-white/5 rounded-xl p-3">
                    <div>
                      <p className="font-medium text-sm">{item.name}</p>
                      {item.tag && <span className="text-xs text-accent">{item.tag}</span>}
                    </div>
                    <p className="font-bold text-accent text-sm">{item.price}</p>
                  </div>
                ))}
              </div>
              <button className="w-full mt-4 py-3 bg-accent rounded-xl text-white font-semibold text-sm">
                Fazer Pedido →
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Funcionalidades */}
      <section className="py-20 px-6 bg-white border-y border-border">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">Módulos completos</p>
            <h2 className="text-4xl font-bold text-foreground">Tudo que sua operação precisa</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { icon: ShoppingBag, title: 'Cardápio Digital', desc: 'Categorias, produtos, fotos, adicionais, preços. Atualize em tempo real, ative ou pause itens.' },
              { icon: Clock, title: 'Gestão de Pedidos', desc: 'Receba, aceite, organize por status. Cozinha acompanha em tempo real. Fluxo completo.' },
              { icon: Truck, title: 'Entregas e Motoboys', desc: 'Cadastre sua equipe de entrega, atribua pedidos, acompanhe o status de cada rota.' },
              { icon: MapPin, title: 'Taxas por Bairro', desc: 'Configure as regiões atendidas e as taxas de entrega. O sistema calcula automaticamente.' },
              { icon: BarChart3, title: 'Financeiro e Relatórios', desc: 'Faturamento, ticket médio, produtos mais vendidos, horários de pico, bairros mais fortes.' },
              { icon: Zap, title: 'IA Growth Engine', desc: 'Insights automáticos para recuperar clientes inativos, criar combos, disparar campanhas.' },
            ].map((feature, i) => (
              <div key={i} className="p-6 rounded-2xl border border-border bg-[#F8F7F3] hover:border-accent/30 transition-colors">
                <feature.icon className="w-6 h-6 text-accent mb-4" />
                <h3 className="font-bold text-foreground mb-2">{feature.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Fluxo do Pedido */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">Fluxo do pedido</p>
            <h2 className="text-4xl font-bold text-foreground">Do link ao prato na mesa</h2>
          </div>
          <div className="relative">
            <div className="hidden md:block absolute top-8 left-[10%] right-[10%] h-px bg-border"></div>
            <div className="grid md:grid-cols-5 gap-6">
              {[
                { step: '01', icon: Smartphone, label: 'Cliente abre seu link' },
                { step: '02', icon: ShoppingBag, label: 'Escolhe os produtos' },
                { step: '03', icon: CheckCircle, label: 'Pedido confirmado' },
                { step: '04', icon: ChefHat, label: 'Cozinha prepara' },
                { step: '05', icon: Truck, label: 'Motoboy entrega' },
              ].map((s, i) => (
                <div key={i} className="flex flex-col items-center text-center">
                  <div className="w-16 h-16 bg-white border-2 border-border rounded-2xl flex items-center justify-center mb-4 relative z-10">
                    <s.icon className="w-6 h-6 text-accent" />
                  </div>
                  <span className="text-xs font-bold text-accent mb-1">{s.step}</span>
                  <p className="text-sm font-medium text-foreground">{s.label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* AI Growth */}
      <section className="py-20 px-6 bg-white border-y border-border">
        <div className="max-w-5xl mx-auto grid md:grid-cols-2 gap-12 items-center">
          <div>
            <p className="text-sm font-semibold text-accent uppercase tracking-wider mb-4">IA Growth Engine</p>
            <h2 className="text-4xl font-bold text-foreground mb-6">A IA que faz você vender mais, não só operar</h2>
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Enquanto você opera, a IA analisa seus dados e entrega insights concretos: quem está sumindo, qual produto está parado, qual bairro está crescendo, qual combo vai bombar.
            </p>
            <div className="space-y-4">
              {[
                'Detecta clientes inativos e sugere mensagem de reativação',
                'Identifica horários fracos e propõe promoções específicas',
                'Aponta produtos parados para reposicionamento ou retirada',
                'Sugere combos baseados nos pedidos mais frequentes',
                'Mensagens prontas para copiar e disparar no WhatsApp',
              ].map((item, i) => (
                <div key={i} className="flex gap-3">
                  <CheckCircle className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
                  <p className="text-sm text-muted-foreground">{item}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="space-y-4">
            {[
              { type: '🔴 Alerta', title: '4 clientes inativos há 15+ dias', action: 'Gerar mensagem de reativação', color: 'border-red-200 bg-red-50' },
              { type: '🟡 Oportunidade', title: 'Terça-feira tem 60% menos pedidos', action: 'Criar promoção de terça', color: 'border-yellow-200 bg-yellow-50' },
              { type: '🟢 Insight', title: 'Smash + Batata são pedidos juntos em 78% das vezes', action: 'Criar combo com desconto', color: 'border-green-200 bg-green-50' },
            ].map((insight, i) => (
              <div key={i} className={`p-5 rounded-xl border ${insight.color}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground mb-1">{insight.type}</p>
                    <p className="font-bold text-foreground text-sm mb-2">{insight.title}</p>
                    <button className="text-xs font-medium text-accent hover:underline">{insight.action} →</button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Social Proof */}
      <section className="py-20 px-6">
        <div className="max-w-5xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-3xl font-bold text-foreground">Para quem é o FoodControl AI?</h2>
          </div>
          <div className="grid md:grid-cols-5 gap-4">
            {['🍔 Hamburguerias', '🍕 Pizzarias', '🥗 Marmitarias', '🍦 Açaís', '☕ Cafeterias'].map((tipo, i) => (
              <div key={i} className="text-center p-6 bg-white border border-border rounded-2xl">
                <p className="font-medium text-foreground">{tipo}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 grid md:grid-cols-3 gap-6">
            {[
              { quote: 'Antes eu pagava R$800 por mês em comissão pro app. Hoje mando o link no grupo do WhatsApp e os pedidos chegam direto.', author: 'Marcos, Hamburgueria SP' },
              { quote: 'A cozinha ficou muito mais organizada. Todo mundo vê o pedido na tela, sem confusão, sem esquecimento.', author: 'Carla, Pizzaria BH' },
              { quote: 'O IA Growth me avisou que tinha 6 clientes sumidos. Mandei mensagem no WhatsApp e 3 compraram no mesmo dia.', author: 'Rafael, Açaí Delivery RJ' },
            ].map((t, i) => (
              <div key={i} className="bg-white border border-border rounded-2xl p-6">
                <div className="flex gap-1 mb-4">
                  {[...Array(5)].map((_, j) => <Star key={j} className="w-4 h-4 fill-accent text-accent" />)}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">"{t.quote}"</p>
                <p className="text-xs font-medium text-foreground">{t.author}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* TurboSaaS */}
      <section className="py-16 px-6 border-y border-border bg-secondary/30">
        <div className="max-w-3xl mx-auto text-center">
          <p className="text-xs font-bold text-muted-foreground uppercase tracking-widest mb-4">PARTE DO ECOSSISTEMA</p>
          <h2 className="text-2xl font-bold text-foreground mb-3">FoodControl AI é um sistema TurboSaaS</h2>
          <p className="text-muted-foreground text-sm max-w-xl mx-auto">
            Desenvolvido sobre a biblioteca TurboSaaS, o FoodControl AI é uma plataforma SaaS multiempresa white-label, pronta para ser vendida e operada para o nicho food service.
          </p>
          <a href="https://turbosaas.pro/" target="_blank" rel="noopener noreferrer" className="inline-block mt-6 text-sm font-medium text-accent hover:underline">
            Conheça o TurboSaaS →
          </a>
        </div>
      </section>

      {/* CTA Final */}
      <section className="py-24 px-6 bg-foreground text-background">
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-4xl font-bold mb-6">
            Pronto para ter o seu próprio<br />canal de delivery?
          </h2>
          <p className="text-white/60 mb-10 text-lg">Sem comissão para app. Sem dependência de terceiros. Com operação organizada.</p>
          <Link to="/demo/dashboard">
            <button className="inline-flex items-center gap-2 px-10 py-4 bg-accent text-white rounded-xl text-lg font-semibold hover:bg-accent/90 transition-colors">
              Explorar a Demo Completa <ArrowRight className="w-5 h-5" />
            </button>
          </Link>
          <p className="text-sm text-white/40 mt-6">Demo pública, sem cadastro, sem comprometimento.</p>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-foreground border-t border-white/10 py-10 px-6">
        <div className="max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-accent rounded-lg flex items-center justify-center">
              <ChefHat className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white">FoodControl AI</span>
          </div>
          <p className="text-sm text-white/40">© 2024 FoodControl AI. Parte do TurboSaaS.</p>
          <div className="flex gap-6">
            <Link to="/demo/dashboard" className="text-sm text-white/50 hover:text-white transition-colors">Demo</Link>
            <button onClick={handleLogin} className="text-sm text-white/50 hover:text-white transition-colors">Entrar</button>
            <a href="https://turbosaas.pro/" target="_blank" rel="noopener noreferrer" className="text-sm text-white/50 hover:text-white transition-colors">TurboSaaS</a>
          </div>
        </div>
      </footer>
    </div>
  );
}