// ─── Cockpit V2 — "Minha IA" ────────────────────────────────────────────
// As superfícies de IA que a dona do salão precisa ver (agentes, campanhas,
// cadências e as OFERTAS que a IA vende) ficam soltas em tabs do /admin. Aqui as
// reunimos numa casca leve (tabs), reusando os MESMOS componentes de seção (zero
// motor novo) — mesma ideia do CaptacaoHub. Aba endereçada por ?tab= (deep-link:
// /minha-ia?tab=ofertas cai direto nas ofertas — Fase 2 do plano de menus).
//
// Nota: a aba "Copiloto" (AIChat) foi OMITIDA de propósito. O AIChat exige a
// prop obrigatória `productName` (e usa `productId`) derivada do produto
// selecionado em pages/Index.tsx — não monta standalone sem esse contexto.

import { lazy, Suspense } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelLoader } from '@/components/brand/WheelLoader'

const AgentsManager = lazy(() => import('@/components/admin/agents/AgentsManager').then(m => ({ default: m.AgentsManager })))
const CampaignsManager = lazy(() => import('@/components/admin/campaigns/CampaignsManager').then(m => ({ default: m.CampaignsManager })))
const CadencesManager = lazy(() => import('@/components/admin/cadences/CadencesManager').then(m => ({ default: m.CadencesManager })))
const Produtos = lazy(() => import('@/cockpit/Produtos'))

const TABS = [
  { id: 'agentes', label: 'Agentes', C: AgentsManager },
  { id: 'campanhas', label: 'Campanhas', C: CampaignsManager },
  { id: 'cadencias', label: 'Cadências', C: CadencesManager },
  { id: 'ofertas', label: 'Ofertas da IA', C: Produtos },
] as const

export default function MinhaIAHub() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('tab')
  const tab = raw && TABS.some((t) => t.id === raw) ? raw : 'agentes'
  const setTab = (v: string) => setParams({ tab: v }, { replace: true })

  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Minha IA</h1>
        <p className="text-sm text-muted-foreground">
          Sua assistente trabalhando por você — agentes, campanhas, sequências e o que ela vende, num lugar só.
        </p>
      </div>
      <Tabs value={tab} onValueChange={setTab}>
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
