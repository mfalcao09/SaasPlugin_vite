// Aba "Formulários" do Atrair Clientes, com 2 sub-abas: "Novo Formulário" (lista +
// criar — o FormsManager atual) e "Templates de Formulário" (galeria de modelos
// prontos). Espelha o QuizHub (zero motor novo).
import { lazy, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelLoader } from '@/components/brand/WheelLoader'

const FormsSection = lazy(() =>
  import('@/components/admin/capture/channels/FormsSection').then((m) => ({ default: m.FormsSection })))
const FormTemplatesSection = lazy(() =>
  import('@/components/admin/capture/channels/FormTemplatesSection').then((m) => ({ default: m.FormTemplatesSection })))

const fallback = <div className="py-12 flex justify-center"><WheelLoader size={48} /></div>

export function FormsHub() {
  return (
    <Tabs defaultValue="novo" className="space-y-4">
      <TabsList>
        <TabsTrigger value="novo">Novo Formulário</TabsTrigger>
        <TabsTrigger value="templates">Templates de Formulário</TabsTrigger>
      </TabsList>
      <TabsContent value="novo">
        <Suspense fallback={fallback}><FormsSection /></Suspense>
      </TabsContent>
      <TabsContent value="templates">
        <Suspense fallback={fallback}><FormTemplatesSection /></Suspense>
      </TabsContent>
    </Tabs>
  )
}
