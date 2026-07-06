// ─── SuperAdmin → Afiliados (gestão de vendas do SaaS) ──────────────────────
// Cópia das telas comerciais que viviam no admin do tenant (Relatórios de venda,
// Financeiro de comissão, Pagamentos e Equipes). Aqui elas servem à PLATAFORMA:
// gerir os AFILIADOS que vendem o NexvyBeauty (vendedores, deals, comissões).
//
// ⚠️ Scaffold: por ora reusa os MESMOS componentes do admin (escopados por org).
// O modelo de dados de afiliado (platform-level) será ligado depois ("depois
// falamos") — por isso o aviso no topo. Zero motor novo; só a CASA nova.
import { lazy, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelLoader } from '@/components/brand/WheelLoader'
import { Handshake, Info } from 'lucide-react'

const ReportsManager = lazy(() =>
  import('@/components/admin/reports/ReportsManager').then((m) => ({ default: m.ReportsManager })))
const FinancialDashboard = lazy(() =>
  import('@/components/admin/FinancialDashboard').then((m) => ({ default: m.FinancialDashboard })))
const TeamManager = lazy(() =>
  import('@/components/admin/TeamManager').then((m) => ({ default: m.TeamManager })))

// Pagamentos saiu daqui — virou página própria no SuperAdmin (item "Pagamentos (Vendas)").
const TABS = [
  { id: 'relatorios', label: 'Relatórios', C: ReportsManager },
  { id: 'financeiro', label: 'Financeiro', C: FinancialDashboard },
  { id: 'equipes', label: 'Equipes', C: TeamManager },
] as const

export function AffiliatesPanel() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Handshake className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-bold">Afiliados</h2>
          <p className="text-sm text-muted-foreground">
            Gestão de vendas do SaaS — afiliados, comissões, pagamentos e equipe comercial.
          </p>
        </div>
      </div>

      <div className="flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-300">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Cópia das telas comerciais (vindas do admin do tenant). O modelo de dados de
          afiliado da plataforma ainda será ligado — por ora os números refletem o escopo atual.
        </span>
      </div>

      <Tabs defaultValue="relatorios">
        <TabsList className="flex flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map(({ id, C }) => (
          <TabsContent key={id} value={id} className="mt-4">
            <Suspense fallback={<div className="py-12 flex justify-center"><WheelLoader size={48} /></div>}>
              <C />
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  )
}
