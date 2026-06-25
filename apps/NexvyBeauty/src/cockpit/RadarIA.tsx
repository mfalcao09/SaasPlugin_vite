// Radar IA — oportunidades quentes DENTRO das conversas (lente micro). Extraído da
// aba "Radar IA" do Conversas. RadarPanel já traz seu próprio header "Radar IA".
import { useNavigate } from 'react-router-dom'
import { RadarPanel } from '@/components/admin/radar/RadarPanel'

export default function RadarIA() {
  const navigate = useNavigate()
  return (
    <div className="p-6">
      <RadarPanel onOpenConversation={(id) => navigate(`/conversas?conv=${id}`)} />
    </div>
  )
}
