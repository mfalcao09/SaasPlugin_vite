// Tarefas — central de tarefas no Cockpit (seção Comercial). Reusa o TaskCenter
// (CRM) escopado ao usuário logado. Fecha o ciclo das tarefas criadas no Radar IA
// ("Criar tarefa") e nos follow-ups, que antes não tinham onde ser acompanhadas.
import { useAuth } from '@/hooks/useAuth'
import { TaskCenter } from '@/components/seller/TaskCenter'

export default function Tarefas() {
  const { user } = useAuth()
  if (!user?.id) return null
  return (
    <div className="p-6">
      <TaskCenter userId={user.id} />
    </div>
  )
}
