import { Trophy } from 'lucide-react'

export default function Metas() {
  return (
    <div className="p-6">
      <div className="flex items-center gap-2 mb-6">
        <Trophy className="h-5 w-5 text-violet-500" />
        <h1 className="text-xl font-bold text-white">Metas</h1>
      </div>
      <div className="rounded-xl bg-slate-900 border border-slate-700 p-8 text-center">
        <p className="text-slate-400 text-sm">Módulo em implementação.</p>
      </div>
    </div>
  )
}
