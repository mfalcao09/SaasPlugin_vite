// Aba "Quiz" do Atrair Clientes, com 2 sub-abas: "Novo Quiz" (lista + criar) e
// "Templates Quizzes" (galeria de modelos prontos). Reusa QuizSection +
// CaptureTemplatesSection (zero motor novo) — a galeria de templates deixa de
// viver no admin e passa a morar aqui, no contexto de criar quiz.
import { lazy, Suspense } from 'react'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { WheelLoader } from '@/components/brand/WheelLoader'

const QuizSection = lazy(() =>
  import('@/components/admin/capture/channels/QuizSection').then((m) => ({ default: m.QuizSection })))
const CaptureTemplatesSection = lazy(() =>
  import('@/components/admin/capture/channels/CaptureTemplatesSection').then((m) => ({ default: m.CaptureTemplatesSection })))

const fallback = <div className="py-12 flex justify-center"><WheelLoader size={48} /></div>

export function QuizHub() {
  return (
    <Tabs defaultValue="novo" className="space-y-4">
      <TabsList>
        <TabsTrigger value="novo">Novo Quiz</TabsTrigger>
        <TabsTrigger value="templates">Templates Quizzes</TabsTrigger>
      </TabsList>
      <TabsContent value="novo">
        <Suspense fallback={fallback}><QuizSection /></Suspense>
      </TabsContent>
      <TabsContent value="templates">
        <Suspense fallback={fallback}><CaptureTemplatesSection /></Suspense>
      </TabsContent>
    </Tabs>
  )
}
