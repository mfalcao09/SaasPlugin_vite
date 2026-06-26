// Aba "WhatsApp" do Atrair Clientes, com 2 sub-abas: "Novo Fluxo de WhatsApp"
// (lista + criar — o WhatsAppSection atual) e "Templates de Fluxos WhatsApp"
// (galeria de fluxos prontos). Espelha o QuizHub/FormsHub (zero motor novo).
import { lazy, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelLoader } from '@/components/brand/WheelLoader'

const WhatsAppSection = lazy(() =>
  import('@/components/admin/capture/channels/WhatsAppSection').then((m) => ({ default: m.WhatsAppSection })))
const WhatsAppTemplatesSection = lazy(() =>
  import('@/components/admin/capture/channels/WhatsAppTemplatesSection').then((m) => ({ default: m.WhatsAppTemplatesSection })))

const fallback = <div className="py-12 flex justify-center"><WheelLoader size={48} /></div>

export function WhatsAppHub() {
  return (
    <Tabs defaultValue="novo" className="space-y-4">
      <TabsList>
        <TabsTrigger value="novo">Novo Fluxo de WhatsApp</TabsTrigger>
        <TabsTrigger value="templates">Templates de Fluxos WhatsApp</TabsTrigger>
      </TabsList>
      <TabsContent value="novo">
        <Suspense fallback={fallback}><WhatsAppSection /></Suspense>
      </TabsContent>
      <TabsContent value="templates">
        <Suspense fallback={fallback}><WhatsAppTemplatesSection /></Suspense>
      </TabsContent>
    </Tabs>
  )
}
