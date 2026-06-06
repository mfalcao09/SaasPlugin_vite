import { Sparkles } from 'lucide-react'

export default function AIGrowth() {
  return (
    <div className="p-6 flex flex-col items-center justify-center min-h-[60vh] text-center">
      <div className="h-16 w-16 rounded-2xl bg-orange-600/20 flex items-center justify-center mb-4">
        <Sparkles className="h-8 w-8 text-orange-400" />
      </div>
      <h1 className="text-2xl font-bold text-white mb-2">AI Assistant</h1>
      <p className="text-slate-400 max-w-md">
        Assistente de IA para crescimento da oficina. Em breve: analise de clientes inativos, sugestao de servicos preventivos e insights de faturamento.
      </p>
    </div>
  )
}
