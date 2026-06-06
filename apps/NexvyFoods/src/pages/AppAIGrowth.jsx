import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { useCompany } from '@/hooks/useCompany';
import { Zap, Loader2, Copy, Check, ChevronRight, AlertCircle, RefreshCw } from 'lucide-react';

function InsightCard({ insight }) {
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const handleCopy = () => {
    if (!insight.message) return;
    navigator.clipboard.writeText(insight.message);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const colorMap = {
    alta: 'border-red-200 bg-red-50',
    média: 'border-yellow-200 bg-yellow-50',
    baixa: 'border-blue-200 bg-blue-50',
    positivo: 'border-green-200 bg-green-50',
  };

  const badgeMap = {
    alta: 'bg-red-100 text-red-700',
    média: 'bg-yellow-100 text-yellow-700',
    baixa: 'bg-blue-100 text-blue-700',
    positivo: 'bg-green-100 text-green-700',
  };

  return (
    <div className={`border rounded-xl p-5 ${colorMap[insight.priority] || colorMap.baixa}`}>
      <div className="flex items-start justify-between gap-2 mb-3">
        <h3 className="font-bold text-foreground text-sm leading-snug">{insight.title}</h3>
        <span className={`text-xs px-2 py-0.5 rounded-full font-semibold flex-shrink-0 ${badgeMap[insight.priority] || badgeMap.baixa}`}>
          {insight.priority}
        </span>
      </div>
      <p className="text-sm text-muted-foreground leading-relaxed mb-4">{insight.description}</p>

      {insight.suggested_action && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="flex items-center gap-1.5 text-xs font-semibold text-foreground hover:text-accent transition-colors"
        >
          <Zap className="w-3 h-3" />
          {insight.suggested_action}
          <ChevronRight className={`w-3 h-3 transition-transform ${expanded ? 'rotate-90' : ''}`} />
        </button>
      )}

      {expanded && insight.message && (
        <div className="mt-4 bg-white rounded-xl border p-4">
          <p className="text-xs font-semibold text-muted-foreground mb-2">Mensagem pronta para WhatsApp:</p>
          <p className="text-sm text-foreground leading-relaxed whitespace-pre-wrap">{insight.message}</p>
          <button
            onClick={handleCopy}
            className="mt-3 flex items-center gap-2 px-3 py-1.5 bg-foreground text-background rounded-lg text-xs font-medium"
          >
            {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
            {copied ? 'Copiado!' : 'Copiar Mensagem'}
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppAIGrowth() {
  const { company, user, loading: companyLoading } = useCompany();
  const [insights, setInsights] = useState([]);
  const [loading, setLoading] = useState(false);
  const [generated, setGenerated] = useState(false);

  const generateInsights = async () => {
    if (!user?.company_id || !company) return;
    setLoading(true);

    try {
      const [orders, customers, products] = await Promise.all([
        base44.entities.Order.filter({ company_id: user.company_id }, '-created_date', 100),
        base44.entities.Customer.filter({ company_id: user.company_id }),
        base44.entities.MenuItem.filter({ company_id: user.company_id, active: true }),
      ]);

      const inactiveCustomers = customers.filter(c => {
        if (!c.last_order_at) return false;
        const days = (Date.now() - new Date(c.last_order_at)) / (1000 * 60 * 60 * 24);
        return days > 15;
      });

      const ordersByDay = {};
      orders.forEach(o => {
        if (!o.created_date) return;
        const day = new Date(o.created_date).getDay();
        ordersByDay[day] = (ordersByDay[day] || 0) + 1;
      });
      const weakDays = Object.entries(ordersByDay).filter(([, v]) => v < (orders.length / 7) * 0.6);

      const prompt = `Você é um especialista em marketing para delivery. Com base nos dados abaixo, gere insights de crescimento:

Empresa: ${company.name}
Slug: ${company.slug}
Total de pedidos: ${orders.length}
Total de clientes: ${customers.length}
Clientes inativos (15+ dias): ${inactiveCustomers.length} (${inactiveCustomers.slice(0, 3).map(c => c.name).join(', ')})
Dias fracos: ${weakDays.length > 0 ? 'sim' : 'não'}
Produtos ativos: ${products.slice(0, 5).map(p => p.name).join(', ')}

Gere exatamente 4 insights concretos e acionáveis. Para cada insight com mensagem de WhatsApp, escreva o texto pronto para copiar.`;

      const result = await base44.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: 'object',
          properties: {
            insights: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  priority: { type: 'string', enum: ['alta', 'média', 'baixa', 'positivo'] },
                  suggested_action: { type: 'string' },
                  message: { type: 'string' },
                },
              },
            },
          },
        },
      });

      setInsights(result.insights || []);
      setGenerated(true);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  if (companyLoading) return <div className="flex items-center justify-center h-64"><div className="w-6 h-6 border-2 border-accent border-t-transparent rounded-full animate-spin" /></div>;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Zap className="w-5 h-5 text-accent" />
            <h1 className="text-2xl font-bold text-foreground">IA Growth Engine</h1>
          </div>
          <p className="text-sm text-muted-foreground">Insights automáticos para aumentar suas vendas</p>
        </div>
        {generated && (
          <button
            onClick={generateInsights}
            disabled={loading}
            className="flex items-center gap-2 px-3 py-2 border border-border rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Atualizar
          </button>
        )}
      </div>

      {!company && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-5">
          <p className="text-sm text-yellow-800 font-medium">Configure sua empresa primeiro para gerar insights personalizados.</p>
        </div>
      )}

      {!generated && !loading && company && (
        <div className="py-16 text-center">
          <div className="w-16 h-16 bg-accent/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Zap className="w-8 h-8 text-accent" />
          </div>
          <h2 className="font-bold text-foreground text-lg mb-3">Pronto para analisar sua operação</h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-sm mx-auto">
            A IA vai analisar seus pedidos, clientes e produtos para gerar insights concretos sobre como vender mais.
          </p>
          <button
            onClick={generateInsights}
            className="inline-flex items-center gap-2 px-8 py-3 bg-accent text-white rounded-xl font-semibold text-sm hover:bg-accent/90 transition-colors"
          >
            <Zap className="w-4 h-4" />
            Gerar Insights com IA
          </button>
        </div>
      )}

      {loading && (
        <div className="py-16 text-center">
          <Loader2 className="w-10 h-10 mx-auto mb-4 text-accent animate-spin" />
          <p className="text-sm text-muted-foreground">Analisando sua operação...</p>
        </div>
      )}

      {generated && !loading && (
        <div className="space-y-4">
          {insights.length === 0 ? (
            <div className="py-12 text-center">
              <AlertCircle className="w-10 h-10 mx-auto mb-3 text-muted-foreground opacity-30" />
              <p className="text-sm text-muted-foreground">Não foi possível gerar insights. Tente novamente.</p>
            </div>
          ) : (
            insights.map((insight, i) => <InsightCard key={i} insight={insight} />)
          )}
        </div>
      )}
    </div>
  );
}