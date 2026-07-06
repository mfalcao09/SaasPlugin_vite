import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PlatformCrmTeamManager } from './PlatformCrmTeamManager';
import { PlatformCrmSquadsManager } from '../squads/PlatformCrmSquadsManager';

/**
 * EQUIPES — decisão do Marcelo: a seção agrupa **Usuários** (TeamManager: gestão de
 * usuários/reps, papéis, atribuição) + **Squads** (times de venda: performance,
 * auto-dispatch, membros). No original, "Equipes" (adminMenu id `team`) renderiza o
 * TeamManager; SquadManager é feature irmã (não é item de menu próprio). Aqui as duas
 * convivem em abas, fiel à instrução "Equipes = Squads + TeamManager".
 */
export function PlatformCrmEquipes() {
  return (
    <Tabs defaultValue="usuarios" className="w-full space-y-4">
      <TabsList>
        <TabsTrigger value="usuarios">Usuários</TabsTrigger>
        <TabsTrigger value="squads">Squads</TabsTrigger>
      </TabsList>
      <TabsContent value="usuarios">
        <PlatformCrmTeamManager />
      </TabsContent>
      <TabsContent value="squads">
        <PlatformCrmSquadsManager />
      </TabsContent>
    </Tabs>
  );
}

export default PlatformCrmEquipes;
