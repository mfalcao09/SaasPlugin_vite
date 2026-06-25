// Radar IA — oportunidades quentes DENTRO das conversas (lente micro). Extraído da
// aba "Radar IA" do Conversas. RadarPanel já traz seu próprio header "Radar IA".
// Acima dele, a triagem determinística "Precisa de você" (sempre visível, sem LLM):
// lead aguardando resposta + IA travada que precisa de humano.
import { useNavigate } from 'react-router-dom'
import { RadarPanel } from '@/components/admin/radar/RadarPanel'
import PrecisaDeVoce from './PrecisaDeVoce'

export default function RadarIA() {
  const navigate = useNavigate()
  return (
    <div className="p-6 space-y-6">
      <PrecisaDeVoce />
      <RadarPanel onOpenConversation={(id) => navigate(`/conversas?conv=${id}`)} />
    </div>
  )
}
