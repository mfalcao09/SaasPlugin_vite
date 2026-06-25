// Painel — dashboard comercial (tempo real). Extraído da aba "Painel" do Conversas.
// Renderiza o AttendancePanel (que já traz seu próprio header "Painel de Atendimentos").
import { useNavigate } from 'react-router-dom'
import { AttendancePanel } from '@/components/admin/webchat/AttendancePanel'

export default function Painel() {
  const navigate = useNavigate()
  return (
    <div className="p-6">
      <AttendancePanel onOpenConversation={(id) => navigate(`/conversas?conv=${id}`)} />
    </div>
  )
}
