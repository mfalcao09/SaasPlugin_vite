import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { PlatformCrmKanban } from '@/components/superadmin/crm/kanban/PlatformCrmKanban';
import { PlatformCrmLeadsManager } from '@/components/superadmin/crm/leads/PlatformCrmLeadsManager';

/**
 * Seção "Vendas da Plataforma" do super-admin — CRM de venda de SaaS TOTALMENTE
 * DESACOPLADO do CRM do tenant (lê só tabelas platform_crm_*, RLS super_admin-only).
 * Funil (kanban) + Contatos (leads). Nunca importa nada do CRM do tenant.
 */
export function PlatformCrmSection() {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Vendas da Plataforma</h1>
        <p className="text-muted-foreground">
          Funil de venda de SaaS — prospecção e conversão de salões em assinantes.
        </p>
      </div>
      <Tabs defaultValue="funil">
        <TabsList>
          <TabsTrigger value="funil">Funil</TabsTrigger>
          <TabsTrigger value="contatos">Contatos</TabsTrigger>
        </TabsList>
        <TabsContent value="funil" className="mt-4">
          <PlatformCrmKanban />
        </TabsContent>
        <TabsContent value="contatos" className="mt-4">
          <PlatformCrmLeadsManager />
        </TabsContent>
      </Tabs>
    </div>
  );
}

export default PlatformCrmSection;
