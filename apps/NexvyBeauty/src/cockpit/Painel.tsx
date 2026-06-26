// Painel — centro de comando comercial (tempo real). Absorveu a antiga "Central de
// Operação" do admin (OperationCenter: KPIs + prioridades + agenda/tarefas + leads
// recentes) e mantém a fila de atendimento (AttendancePanel) como SEÇÃO abaixo.
// Os links do OperationCenter são remapeados para as rotas do cockpit (não voltam
// ao admin): leads→/leads, inbox→/conversas, calendar→/agenda.
import { useNavigate } from 'react-router-dom'
import { OperationCenter } from '@/components/admin/operation/OperationCenter'
import { AttendancePanel } from '@/components/admin/webchat/AttendancePanel'

const SECTION_ROUTE: Record<string, string> = {
  leads: '/leads',
  inbox: '/conversas',
  calendar: '/agenda',
}

export default function Painel() {
  const navigate = useNavigate()
  return (
    <div className="p-6 space-y-8">
      <OperationCenter onNavigate={(s) => navigate(SECTION_ROUTE[s] ?? `/admin?tab=${s}`)} />
      <div className="border-t pt-6">
        <AttendancePanel onOpenConversation={(id) => navigate(`/conversas?conv=${id}`)} />
      </div>
    </div>
  )
}
