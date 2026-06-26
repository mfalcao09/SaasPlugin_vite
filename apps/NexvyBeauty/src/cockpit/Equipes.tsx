// Equipes & Setores — gestão de usuários/permissões do salão. Movida do admin
// para a seção Gestão do cockpit (reusa o TeamManager, escopado por org).
import { TeamManager } from '@/components/admin/TeamManager'

export default function Equipes() {
  return <div className="p-6"><TeamManager /></div>
}
