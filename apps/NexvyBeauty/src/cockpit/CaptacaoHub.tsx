// ─── Cockpit V1 — "Atrair Clientes" ─────────────────────────────────────
// O Admin não tem uma tela única de captação — são 8 seções soltas em tabs do
// /admin. Aqui as agrupamos numa casca leve (tabs), reusando os MESMOS
// componentes de seção (zero motor novo), pra a cabeleireira ter UM lugar de
// "trazer mais cliente" sem cair no painel de TI.

import { lazy, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelLoader } from '@/components/brand/WheelLoader'
import { FeatureGate } from '@/components/plan/FeatureGate'

// Quiz agora é um hub de 2 sub-abas (Novo Quiz + Templates Quizzes).
const QuizHub = lazy(() => import('./QuizHub').then(m => ({ default: m.QuizHub })))
// Formulários e WhatsApp viraram hubs de 2 sub-abas (Novo + Templates).
const FormsHub = lazy(() => import('./FormsHub').then(m => ({ default: m.FormsHub })))
const WhatsAppHub = lazy(() => import('./WhatsAppHub').then(m => ({ default: m.WhatsAppHub })))
const WidgetSection = lazy(() => import('@/components/admin/capture/channels/WidgetSection').then(m => ({ default: m.WidgetSection })))
const ChatBotSection = lazy(() => import('@/components/admin/capture/channels/ChatBotSection').then(m => ({ default: m.ChatBotSection })))
const CaptureResultsSection = lazy(() => import('@/components/admin/capture/channels/CaptureResultsSection').then(m => ({ default: m.CaptureResultsSection })))

// `feature: 'capture_funnels'` marca os FUNIS VISUAIS (builder FlowCanvas: quiz,
// widget do site, chatbot) — feature paga por plano. Formulários, WhatsApp e
// Resultados NÃO são gateados (features liberadas em todos os planos). Abas com
// `feature` são envolvidas por <FeatureGate> (fail-open enquanto carrega).
const TABS = [
  { id: 'quiz', label: 'Quiz', C: QuizHub, feature: 'capture_funnels' },
  { id: 'forms', label: 'Formulários', C: FormsHub },
  { id: 'whatsapp', label: 'WhatsApp', C: WhatsAppHub },
  { id: 'site', label: 'No meu site', C: WidgetSection, feature: 'capture_funnels' },
  { id: 'chat', label: 'Chat', C: ChatBotSection, feature: 'capture_funnels' },
  { id: 'resultados', label: 'Resultados', C: CaptureResultsSection },
] as const

export default function CaptacaoHub() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-foreground">Atrair Clientes</h1>
        <p className="text-sm text-muted-foreground">
          Ferramentas para trazer mais gente para o seu negócio — quiz, formulários, link de WhatsApp e mais.
        </p>
      </div>
      <Tabs defaultValue="quiz">
        <TabsList className="flex flex-wrap h-auto">
          {TABS.map((t) => (
            <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>
          ))}
        </TabsList>
        {TABS.map((t) => {
          const { id, C } = t
          const feature = 'feature' in t ? t.feature : undefined
          const body = (
            <Suspense fallback={<div className="py-12 flex justify-center"><WheelLoader size={48} /></div>}>
              <C />
            </Suspense>
          )
          return (
            <TabsContent key={id} value={id} className="mt-4">
              {feature ? <FeatureGate feature={feature}>{body}</FeatureGate> : body}
            </TabsContent>
          )
        })}
      </Tabs>
    </div>
  )
}
