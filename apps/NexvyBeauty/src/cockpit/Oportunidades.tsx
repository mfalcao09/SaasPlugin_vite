// ─── Oportunidades — fusão AI Growth + Ações com Clientes (Fase 2 do plano) ──
// Eram dois itens de menu pra MESMA decisão: AI Growth = panorama agregado da
// receita parada; Ações com Clientes = a mesma coisa quebrada por cliente. Aqui
// viram UMA tela com 2 abas, endereçadas por ?tab= (deep-link: /ai-growth?tab=
// cliente cai direto na fila). Reusa os MESMOS componentes (com prop `embedded`
// pra suprimir o header próprio de cada um) — zero motor novo.

import { useSearchParams } from 'react-router-dom'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { PageHeader } from '@/components/layout/PageHeader'
import AiGrowth from '@/cockpit/AiGrowth'
import AcoesClientes from '@/cockpit/AcoesClientes'

export default function Oportunidades() {
  const [params, setParams] = useSearchParams()
  const tab = params.get('tab') === 'cliente' ? 'cliente' : 'geral'
  const setTab = (v: string) => setParams({ tab: v }, { replace: true })

  return (
    <div className="p-6 space-y-6">
      <PageHeader
        title="Oportunidades"
        description="Onde tem dinheiro parado — a IA já achou. Veja o panorama ou vá direto pra fila de quem chamar hoje."
      />
      <Tabs value={tab} onValueChange={setTab}>
        <TabsList>
          <TabsTrigger value="geral">Visão geral</TabsTrigger>
          <TabsTrigger value="cliente">Quem chamar hoje</TabsTrigger>
        </TabsList>
        <TabsContent value="geral" className="mt-4">
          <AiGrowth embedded />
        </TabsContent>
        <TabsContent value="cliente" className="mt-4">
          <AcoesClientes embedded />
        </TabsContent>
      </Tabs>
    </div>
  )
}
