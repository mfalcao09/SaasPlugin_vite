import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { BarChart3, Loader2, PackageSearch, Phone, BadgeCheck, DoorOpen, Users } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useActivePlatformProduct } from '@/contexts/PlatformProductContext';
import { SEG_META, SEG_KEYS, SOURCE_META, leadSourceOf, fmtNum, type LeadSource } from '@/components/superadmin/crm/prospeccao/_shared';
import type { LeadSegment } from '@/components/superadmin/crm/data/usePlatformProspeccao';

/**
 * DASHBOARD DE PROSPECÇÃO — funil AGREGADO da base (super_admin, product-scoped).
 *
 * Lê o TOPO do funil (todos os leads capturados, ANTES do Portão de aprovação):
 *  • total + quebra por FONTE  ← soma de `total_found` das extrações (barato, ~dezenas de linhas)
 *  • segmento / telefone / qualificado / aprovado  ← counts leves (head:true, sem payload)
 * de `platform_crm_extracted_leads`. NÃO usa a view consolidada (que é PÓS-aprovação e
 * hoje tem só os ~8 aprovados) — senão o dashboard mostraria ~8 e pareceria "vazio".
 */

interface FunnelData {
  totalRows: number;                              // count(*) exato da base capturada
  totalFromSources: number;                       // soma de total_found (p/ barras por fonte)
  buscasCount: number;
  bySource: { source: LeadSource; leads: number; buscas: number }[];
  bySegment: Record<LeadSegment, number>;
  comTelefone: number;
  qualificados: number;
  aprovados: number;
}

function useProspeccaoFunnel(productId: string | null) {
  return useQuery({
    queryKey: ['platform-prospeccao-funnel', productId],
    enabled: !!productId,
    queryFn: async (): Promise<FunnelData> => {
      const pid = productId as string;

      // 1) Extrações → total por busca + fonte (barato).
      const { data: exsRaw, error: exErr } = await supabase
        .from('platform_crm_lead_extractions' as never)
        .select('keywords, total_found')
        .eq('product_id', pid)
        .limit(200);
      if (exErr) throw exErr;
      const exs = (exsRaw ?? []) as unknown as { keywords: string[] | null; total_found: number | null }[];

      // 2) Counts leves (head:true → sem payload) na tabela de leads.
      const countOf = async (build: (q: any) => any): Promise<number> => {
        const { count, error } = await build(
          supabase
            .from('platform_crm_extracted_leads' as never)
            .select('*', { count: 'exact', head: true })
            .eq('product_id', pid),
        );
        if (error) throw error;
        return count ?? 0;
      };
      const [totalRows, salao, afiliado, revisao, comTelefone, qualificados, aprovados] = await Promise.all([
        countOf((q) => q),
        countOf((q) => q.eq('segment', 'salao_cliente')),
        countOf((q) => q.eq('segment', 'afiliado_infoproduto')),
        countOf((q) => q.eq('segment', 'revisao')),
        countOf((q) => q.not('telefone', 'is', null).neq('telefone', '')),
        countOf((q) => q.eq('qualified', true)),
        countOf((q) => q.not('approved_at', 'is', null)),
      ]);

      // 3) Agrega extrações por FONTE.
      const bySourceMap = new Map<LeadSource, { leads: number; buscas: number }>();
      for (const ex of exs) {
        const source = leadSourceOf(ex);
        const acc = bySourceMap.get(source) ?? { leads: 0, buscas: 0 };
        acc.leads += ex.total_found ?? 0;
        acc.buscas += 1;
        bySourceMap.set(source, acc);
      }
      const bySource = (Object.keys(SOURCE_META) as LeadSource[])
        .map((source) => ({ source, ...(bySourceMap.get(source) ?? { leads: 0, buscas: 0 }) }))
        .filter((s) => s.buscas > 0)
        .sort((a, b) => b.leads - a.leads);
      const totalFromSources = bySource.reduce((s, b) => s + b.leads, 0);

      return {
        totalRows,
        totalFromSources,
        buscasCount: exs.length,
        bySource,
        bySegment: { salao_cliente: salao, afiliado_infoproduto: afiliado, revisao },
        comTelefone,
        qualificados,
        aprovados,
      };
    },
  });
}

function StatCard({ icon, label, value, hint }: { icon: ReactNode; label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">{icon}{label}</div>
      <div className="mt-1 text-2xl font-semibold text-foreground">{value}</div>
      {hint && <div className="text-xs text-muted-foreground mt-0.5">{hint}</div>}
    </div>
  );
}

function Bar({ label, value, pct }: { label: ReactNode; value: string; pct: number }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs mb-0.5">
        <span className="text-foreground">{label}</span>
        <span className="text-muted-foreground">{value} · {pct}%</span>
      </div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <div className="h-full bg-primary" style={{ width: `${Math.min(100, pct)}%` }} />
      </div>
    </div>
  );
}

export function ProspeccaoDashboard() {
  const { effectiveProductId, activeProductId, products } = useActivePlatformProduct();
  const productId = effectiveProductId ?? null;
  const isAllProducts = activeProductId == null && products.length > 1;
  const { data, isLoading } = useProspeccaoFunnel(isAllProducts ? null : productId);

  const pctOf = (n: number, total: number) => (total > 0 ? Math.round((n / total) * 100) : 0);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="h-6 w-6 text-primary" /> Dashboard de prospecção
        </h1>
        <p className="text-muted-foreground mt-1">
          Funil da base capturada — todas as fontes, <b>antes</b> do Portão de aprovação. Números lidos ao vivo do banco.
        </p>
      </div>

      {isAllProducts ? (
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 flex items-start gap-3">
          <PackageSearch className="h-5 w-5 text-primary shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground">
            Selecione um produto no topo (ex.: <b>NexvyBeauty</b>) para ver o funil da base.
          </p>
        </div>
      ) : isLoading || !data ? (
        <div className="p-10 text-center text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin inline" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatCard icon={<Users className="h-4 w-4" />} label="Leads capturados" value={fmtNum(data.totalRows)} hint={`${data.buscasCount} busca(s)`} />
            <StatCard icon={<Phone className="h-4 w-4" />} label="Com telefone" value={fmtNum(data.comTelefone)} hint={`${pctOf(data.comTelefone, data.totalRows)}% da base`} />
            <StatCard icon={<BadgeCheck className="h-4 w-4" />} label="Qualificados" value={fmtNum(data.qualificados)} hint={`${pctOf(data.qualificados, data.totalRows)}% da base`} />
            <StatCard icon={<DoorOpen className="h-4 w-4" />} label="Aprovados (Base)" value={fmtNum(data.aprovados)} hint="passaram no Portão" />
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground mb-3">Por fonte</h2>
            <div className="space-y-2.5">
              {data.bySource.map((s) => (
                <Bar
                  key={s.source}
                  label={<>{SOURCE_META[s.source].icon} {SOURCE_META[s.source].label} <span className="text-muted-foreground">· {s.buscas} busca(s)</span></>}
                  value={fmtNum(s.leads)}
                  pct={pctOf(s.leads, data.totalFromSources)}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground mb-1">Por segmento <span className="text-muted-foreground font-normal">(posicionamento — quem o lead é)</span></h2>
            <div className="space-y-2.5 mt-3">
              {SEG_KEYS.map((seg) => (
                <Bar
                  key={seg}
                  label={<>{SEG_META[seg].dot} {SEG_META[seg].label}</>}
                  value={fmtNum(data.bySegment[seg])}
                  pct={pctOf(data.bySegment[seg], data.totalRows)}
                />
              ))}
            </div>
          </div>

          <div className="rounded-lg border border-border bg-card p-4">
            <h2 className="text-sm font-medium text-foreground mb-3">Funil de aprovação</h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="rounded-md bg-muted px-3 py-1.5 text-foreground">{fmtNum(data.totalRows)} capturados</span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded-md bg-muted px-3 py-1.5 text-foreground">
                {fmtNum(data.qualificados)} qualificados <span className="text-muted-foreground">({pctOf(data.qualificados, data.totalRows)}%)</span>
              </span>
              <span className="text-muted-foreground">→</span>
              <span className="rounded-md bg-green-500/15 text-green-700 border border-green-500/30 px-3 py-1.5">{fmtNum(data.aprovados)} aprovados</span>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              Só os <b>aprovados</b> no Portão da Base consolidada entram nas Campanhas de disparo.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

export default ProspeccaoDashboard;
