import { Share2 } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { AffiliatesList } from './AffiliatesList';
import { CommissionsTable } from './CommissionsTable';
import { PayoutPanel } from './PayoutPanel';

export function AffiliatesPanel() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-3">
            <Share2 className="h-6 w-6 text-primary" /> Afiliados
          </h1>
          <p className="text-sm text-muted-foreground">
            Gestão de afiliados próprios — cadastro, links de indicação, comissões e pagamentos via PIX.
          </p>
        </div>
      </div>

      <Tabs defaultValue="list">
        <TabsList>
          <TabsTrigger value="list">Afiliados</TabsTrigger>
          <TabsTrigger value="commissions">Comissões</TabsTrigger>
          <TabsTrigger value="payout">Pagamentos</TabsTrigger>
        </TabsList>

        <TabsContent value="list" className="pt-4">
          <AffiliatesList />
        </TabsContent>

        <TabsContent value="commissions" className="pt-4">
          <CommissionsTable />
        </TabsContent>

        <TabsContent value="payout" className="pt-4">
          <PayoutPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
