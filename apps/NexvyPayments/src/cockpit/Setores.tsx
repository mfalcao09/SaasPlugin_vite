// Setores de atendimento — movido do admin para a seção Gestão do cockpit
// (reusa o SectorsManager, escopado por org).
import { SectorsManager } from '@/components/admin/sectors/SectorsManager'

export default function Setores() {
  return <div className="p-6"><SectorsManager /></div>
}
