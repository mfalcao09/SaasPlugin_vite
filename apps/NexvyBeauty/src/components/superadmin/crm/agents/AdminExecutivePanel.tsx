// AdminExecutivePanel (product-scoped, super_admin) — RELIGADO.
//
// Antes: stub "Painel Executivo em breve" (edge/tabela ausentes). Agora:
//   • Seleção de "produtos sob acompanhamento" do Agente Admin, persistida em
//     platform_crm_admin_monitored_products (via hook, tabela nova product-scoped).
//   • Relatório executivo ON-DEMAND: botão dispara a edge
//     platform-admin-executive-report, que agrega leads/conversas/vendas/agentes
//     dos produtos monitorados e sintetiza via IA. Resultado renderizado como
//     TEXTO PURO (whitespace-pre-wrap) — React escapa por padrão, ZERO innerHTML
//     (anti-XSS, §11.2).
//
// Difere do painel org-scoped da fonte (src/components/admin/agents/AdminExecutivePanel):
// aqui é product-scoped puro (ZERO organization_id), super_admin, e o agendamento
// diário/semanal fica DEFERIDO (ver TODO(cron) abaixo) — só o ON-DEMAND é entregue.
import { useEffect, useMemo, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Crown, Package, Check, Save, Sparkles, FileText, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { usePlatformCrmProducts } from '@/components/superadmin/crm/data/usePlatformCrmProducts';
import {
  usePlatformCrmAdminMonitoredProducts,
  useSavePlatformCrmAdminMonitoredProducts,
  useGeneratePlatformAdminExecutiveReport,
  type PlatformAdminExecutiveReport,
} from '@/components/superadmin/crm/data/usePlatformCrmAdminMonitoredProducts';

interface AdminExecutivePanelProps {
  /** Compact mode shrinks paddings and hides header — used inside AgentEditor. */
  compact?: boolean;
  /**
   * Id do Agente Admin em edição (platform_crm_product_agents.id). Necessário para
   * PERSISTIR os produtos monitorados. Ausente (agente novo não salvo) → a seleção
   * fica só em memória e o relatório roda sobre a seleção atual / todos os produtos.
   */
  adminAgentId?: string | null;
}

const PERIOD_OPTIONS = [
  { value: 7, label: 'Últimos 7 dias' },
  { value: 30, label: 'Últimos 30 dias' },
  { value: 90, label: 'Últimos 90 dias' },
];

export function AdminExecutivePanel({ compact = false, adminAgentId }: AdminExecutivePanelProps) {
  const { data: products, isLoading: productsLoading } = usePlatformCrmProducts();
  const { data: monitoredIds } = usePlatformCrmAdminMonitoredProducts(adminAgentId);
  const saveMonitored = useSavePlatformCrmAdminMonitoredProducts();
  const generateReport = useGeneratePlatformAdminExecutiveReport();

  const [selected, setSelected] = useState<string[]>([]);
  const [hasChanges, setHasChanges] = useState(false);
  const [periodDays, setPeriodDays] = useState<number>(7);
  const [report, setReport] = useState<PlatformAdminExecutiveReport | null>(null);

  // Hidrata a seleção a partir dos monitorados persistidos.
  useEffect(() => {
    if (monitoredIds) {
      setSelected(monitoredIds);
      setHasChanges(false);
    }
  }, [monitoredIds]);

  const toggleProduct = (productId: string) => {
    setSelected((prev) =>
      prev.includes(productId) ? prev.filter((id) => id !== productId) : [...prev, productId],
    );
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!adminAgentId) {
      toast.error('Salve o agente antes de configurar os produtos monitorados.');
      return;
    }
    try {
      await saveMonitored.mutateAsync({ adminAgentId, productIds: selected });
      setHasChanges(false);
      toast.success('Produtos monitorados salvos.');
    } catch (e: any) {
      toast.error('Falha ao salvar: ' + (e?.message ?? 'erro'));
    }
  };

  const handleGenerate = async () => {
    try {
      const result = await generateReport.mutateAsync({
        adminAgentId,
        productIds: selected,
        periodDays,
      });
      setReport(result);
    } catch (e: any) {
      toast.error('Falha ao gerar relatório: ' + (e?.message ?? 'erro'));
    }
  };

  const productList = useMemo(() => products ?? [], [products]);

  if (productsLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className={cn('space-y-6', compact && 'space-y-4')}>
      {!compact && (
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h3 className="text-lg font-semibold flex items-center gap-2">
              <Crown className="h-5 w-5 text-primary" />
              Painel Executivo do Agente Admin
              <Badge variant="secondary" className="ml-2 text-xs">
                <Sparkles className="h-3 w-3 mr-1" />
                IA
              </Badge>
            </h3>
            <p className="text-sm text-muted-foreground max-w-2xl">
              Escolha quais produtos o agente acompanha e gere um relatório executivo
              consolidado (leads, conversas, vendas e agentes) sintetizado por IA.
            </p>
          </div>
        </div>
      )}

      {/* Produtos sob acompanhamento */}
      <Card className="border-primary/20 ring-1 ring-primary/10">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4 text-primary" />
            Produtos sob acompanhamento
          </CardTitle>
          <CardDescription>
            Selecione quais produtos o agente deve vigiar. Vazio = todos os produtos da plataforma.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="flex flex-wrap gap-1.5">
            {productList.length === 0 && (
              <span className="text-xs text-muted-foreground italic">Nenhum produto cadastrado.</span>
            )}
            {productList.map((p) => {
              const active = selected.includes(p.id);
              return (
                <button
                  type="button"
                  key={p.id}
                  onClick={() => toggleProduct(p.id)}
                  className={cn(
                    'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium transition-colors',
                    active
                      ? 'bg-primary/10 border-primary/40 text-primary'
                      : 'bg-muted/40 border-border hover:border-primary/40 text-muted-foreground',
                  )}
                >
                  {active && <Check className="h-3 w-3" />}
                  <Package className="h-3 w-3" />
                  {p.name}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button
              size="sm"
              onClick={handleSave}
              disabled={!adminAgentId || !hasChanges || saveMonitored.isPending}
            >
              {saveMonitored.isPending ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Save className="h-4 w-4 mr-2" />
              )}
              Salvar produtos monitorados
            </Button>
            {!adminAgentId && (
              <span className="text-xs text-muted-foreground">
                Salve o agente para persistir a seleção (o relatório abaixo já funciona).
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Relatório executivo ON-DEMAND */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <FileText className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle className="text-base">Relatório executivo</CardTitle>
                <CardDescription>
                  Consolidado on-demand dos produtos selecionados (ou todos, se vazio).
                </CardDescription>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Label className="sr-only">Período</Label>
              <Select value={String(periodDays)} onValueChange={(v) => setPeriodDays(parseInt(v, 10))}>
                <SelectTrigger className="w-[170px] h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PERIOD_OPTIONS.map((opt) => (
                    <SelectItem key={opt.value} value={String(opt.value)}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleGenerate} disabled={generateReport.isPending}>
                {generateReport.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : report ? (
                  <RefreshCw className="h-4 w-4 mr-2" />
                ) : (
                  <Sparkles className="h-4 w-4 mr-2" />
                )}
                {report ? 'Gerar novamente' : 'Gerar relatório executivo'}
              </Button>
            </div>
          </div>
        </CardHeader>
        {report && (
          <CardContent className="pt-0 space-y-3">
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <Badge variant="outline" className="text-[10px]">
                {report.product_count} produto(s)
              </Badge>
              <Badge variant="outline" className="text-[10px]">
                {report.period_days} dia(s)
              </Badge>
              <Badge variant={report.ai_used ? 'secondary' : 'outline'} className="text-[10px]">
                {report.ai_used ? (
                  <>
                    <Sparkles className="h-3 w-3 mr-1" />
                    Sintetizado por IA
                  </>
                ) : (
                  'Resumo determinístico (IA indisponível)'
                )}
              </Badge>
              <span>Gerado em {new Date(report.generated_at).toLocaleString('pt-BR')}</span>
            </div>

            {/* TEXTO PURO — React escapa {report.report}; sem dangerouslySetInnerHTML (anti-XSS §11.2). */}
            <div className="rounded-lg border bg-muted/30 p-4">
              <p className="whitespace-pre-wrap text-sm text-foreground/90 leading-relaxed">
                {report.report}
              </p>
            </div>
          </CardContent>
        )}
      </Card>

      {/*
        TODO(cron): relatório diário agendado — requer pg_cron/launchd (infra externa),
        fora do escopo desta onda. Quando existir, um scheduler chamaria a mesma edge
        (platform-admin-executive-report, service-role) por admin_agent_id e despacharia
        o texto (WhatsApp/e-mail). Nenhum botão "agendar" é exibido aqui de propósito
        (nada de controle morto).
      */}
    </div>
  );
}
