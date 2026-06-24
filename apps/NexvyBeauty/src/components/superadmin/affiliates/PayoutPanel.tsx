import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ApprovedPayoutsTable } from './ApprovedPayoutsTable';
import { PayoutBatchesTable } from './PayoutBatchesTable';

export function PayoutPanel() {
  return (
    <Tabs defaultValue="pending">
      <TabsList>
        <TabsTrigger value="pending">Aprovadas / Gerar lote</TabsTrigger>
        <TabsTrigger value="batches">Lotes</TabsTrigger>
      </TabsList>

      <TabsContent value="pending" className="pt-4">
        <ApprovedPayoutsTable />
      </TabsContent>

      <TabsContent value="batches" className="pt-4">
        <PayoutBatchesTable />
      </TabsContent>
    </Tabs>
  );
}
