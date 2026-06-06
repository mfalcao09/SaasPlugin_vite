import React, { useState } from 'react';
import DemoMode from './DemoMode';
import { DEMO_CUSTOMERS } from '@/lib/demo-data';
import { Zap, Users, Clock, ShoppingBag, MapPin, Copy, Check, AlertCircle, TrendingDown, ChevronRight } from 'lucide-react';

const insights = [
  {
    id: 'i1',
    type: 'alerta',
    priority: 'alta',
    icon: Users,
    color: 'border-red-200 bg-red-50',
    iconColor: 'text-red-600',
    badgeColor: 'bg-red-100 text-red-700',
    title: '2 clientes inativos há mais de 15 dias',
    desc: 'Gabriela Torres e Henrique Costa pararam de pedir. Eles tinham frequência regular.',
    action: 'Enviar mensagem de reativação',
    message: 'Oi, Gabriela! 👋 Sentimos sua falta na Hamburgueria do Zé! Que tal voltar com um Smash Burger hoje? Use o link: foodcontrol.app/pedido/hamburgueria-ze e ganhe batata grátis no seu próximo pedido! 🍟',
  },
  {
    id: 'i2',
    type: 'oportunidade',
    priority: 'média',
    icon: Clock,
    color: 'border-yellow-200 bg-yellow-50',
    iconColor: 'text-yellow-600',
    badgeColor: 'bg-yellow-100 text-yellow-700',
    title: 'Terça e quarta têm 45% menos pedidos',
    desc: 'Nos últimos 30 dias, terças e quartas são os dias mais fracos da semana.',
    action: 'Criar promoção de terça/quarta',
    message: '🍔 Promoção TERÇA E QUARTA na Hamburgueria do Zé! Batata Frita grátis em qualquer pedido acima de R$35. Só hoje e amanhã! Peça agora: foodcontrol.app/pedido/hamburgueria-ze',
  },
  {
    id: 'i3',
    type: 'combo',
    priority: 'alta',
    icon: ShoppingBag,
    color: 'border-green-200 bg-green-50',
    iconColor: 'text-green-600',
    badgeColor: 'bg-green-100 text-green-700',
    title: 'Smash Burger + Batata são pedidos juntos em 78% das vezes',
    desc: 'Você pode criar um combo oficial com desconto e aumentar o ticket médio.',
    action: 'Criar combo "Smash Combo"',
    message: '🔥 Lançamento: SMASH COMBO na Hamburgueria do Zé! Smash Burger Duplo + Batata Frita Rústica por R$44 (economia de R$4). Peça agora: foodcontrol.app/pedido/hamburgueria-ze',
  },
  {
    id: 'i4',
    type: 'produto',
    priority: 'baixa',
    icon: TrendingDown,
    color: 'border-blue-200 bg-blue-50',
    iconColor: 'text-blue-600',
    badgeColor: 'bg-blue-100 text-blue-700',
    title: 'Veggie Burger tem baixo desempenho',
    desc: 'O Veggie Burger teve apenas 12 vendas no mês, muito abaixo dos outros itens.',
    action: 'Reposicionar ou criar promoção',
    message: '🌿 Já experimentou o Veggie Burger da Hamburgueria do Zé? Blend artesanal, rúcula, tomate seco e aioli de limão. Uma experiência diferente! Peça agora: foodcontrol.app/pedido/hamburgueria-ze',
  },
  {
    id: 'i5',
    type: 'bairro',
    priority: 'média',
    icon: MapPin,
    color: 'border-purple-200 bg-purple-50',
    iconColor: 'text-purple-600',
    badgeColor: 'bg-purple-100 text-purple-700',
    title: 'Moema tem demanda, mas poucos pedidos chegam de lá',
    desc: 'Você tem um cliente de Moema, mas a taxa de entrega para lá pode estar inibindo pedidos.',
    action: 'Revisar taxa ou abrir nova zona',
    message: null,
  },
];

function InsightCard({ insight }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const Icon = insight.icon;

  const handleCopy = () => {
    if (!insight.message) return;
    navigator.clipboard.writeText(insight.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className={`border rounded-xl p-5 ${insight.color}`}>
      <div className="flex items-start gap-4">
        <div className={`w-10 h-10 rounded-xl bg-white flex items-center justify-center flex-shrink-0 shadow-sm`}>
          <Icon className={`w-5 h-5 ${insight.iconColor}`} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2 mb-2">
            <h3 className="font-bold text-foreground text-sm leading-snug">{insight.title}</h3>
            <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${insight.badgeColor}`}>
              {insight.priority}
            </span>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{insight.desc}</p>

          {insight.message && (
            <div className="mt-4">
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-accent transition-colors"
              >
                <Zap className="w-3 h-3" />
                {insight.action}
                <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
              </button>

              {expanded && (
                <div className="mt-3 bg-white rounded-xl border border-white/60 p-4">
                  <p className="text-xs font-semibold text-muted-foreground mb-2">Mensagem pronta para WhatsApp:</p>
                  <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{insight.message}</p>
                  <button
                    onClick={handleCopy}
                    className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-lg text-xs font-medium hover:bg-foreground/90 transition-colors"
                  >
                    {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                    {copied ? 'Copiado!' : 'Copiar Mensagem'}
                  </button>
                </div>
              )}
            </div>
          )}

          {!insight.message && (
            <button className="mt-3 text-xs font-semibold text-foreground hover:text-accent transition-colors flex items-center gap-1">
              <ChevronRight className="w-3 h-3" /> {insight.action}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default function DemoAIGrowth() {
  return (
    <DemoMode>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Zap className="w-5 h-5 text-accent" />
              <h1 className="text-2xl font-bold text-foreground">IA Growth Engine</h1>
            </div>
            <p className="text-sm text-muted-foreground">Insights automáticos baseados nos seus dados de operação</p>
          </div>
          <div className="flex items-center gap-2 bg-accent/10 border border-accent/20 rounded-xl px-3 py-2">
            <div className="w-2 h-2 bg-accent rounded-full animate-pulse"></div>
            <span className="text-xs font-semibold text-accent">5 insights ativos</span>
          </div>
        </div>

        {/* Alert de inativos */}
        <div className="bg-foreground text-background rounded-xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <AlertCircle className="w-5 h-5 text-accent" />
            <h2 className="font-bold">Atenção necessária</h2>
          </div>
          <p className="text-sm text-white/70">
            A IA identificou <strong className="text-white">2 clientes inativos</strong> há mais de 15 dias e <strong className="text-white">2 oportunidades de receita</strong> que você pode capturar esta semana.
          </p>
        </div>

        {/* Insights */}
        <div className="space-y-4">
          {insights.map(insight => (
            <InsightCard key={insight.id} insight={insight} />
          ))}
        </div>
      </div>
    </DemoMode>
  );
}