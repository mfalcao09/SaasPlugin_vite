import { useParams } from 'react-router-dom'
import { Scissors } from 'lucide-react'

export default function AgendarPublico() {
  const { slug } = useParams<{ slug: string }>()

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="h-14 w-14 rounded-2xl bg-blue-700 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-blue-700/25">
          <Scissors className="h-7 w-7 text-white" />
        </div>
        <h1 className="text-2xl font-bold text-white">Agendamento Online</h1>
        <p className="text-slate-400 text-sm mt-1">Barbearia: <span className="text-blue-400 font-mono">{slug}</span></p>
        <p className="text-slate-500 text-xs mt-4">Página de agendamento público — em construção.</p>
      </div>
    </div>
  )
}
