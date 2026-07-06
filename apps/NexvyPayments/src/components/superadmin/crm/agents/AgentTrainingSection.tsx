// STUB (por-escopo) do `AgentTrainingSection` da fonte Bizon.
// D3 P1/F1d — o treinamento por material (upload de PDF/doc para a base de
// conhecimento do agente) existe no schema em `agent_training_materials`
// (colunas: agent_id, product_id, organization_id NOT NULL, title, material_type,
// extracted_content, file_url, processing_status). PORÉM este builder é o
// platform-level (`platform_crm_product_agents`), DELIBERADAMENTE zero-tenant/
// zero-organization_id — escopo é o PRODUTO. Como `agent_training_materials`
// exige `organization_id NOT NULL` e não há tenant neste contexto, gravar aqui
// violaria a arquitetura. Falta: (a) tabela `platform_crm_agent_training_materials`
// (twin sem organization_id) OU um org de plataforma bem-definido, mais (b) a Edge
// de ingestão/embedding. Até lá, UI honesta "em breve". // TODO(edge/schema)
import { GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  agentId: string;
  productId: string | null;
}

export function AgentTrainingSection({ agentId, productId }: Props) {
  // TODO(edge/schema): ver cabeçalho — falta twin sem organization_id + Edge de embedding.
  void agentId;
  void productId;
  return (
    <Card className="border-dashed">
      <CardContent className="flex flex-col items-center justify-center py-10 text-center">
        <div className="h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <GraduationCap className="h-7 w-7 text-primary" />
        </div>
        <p className="font-medium">Treinamento por material em breve</p>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          O upload de PDFs e documentos para a base de conhecimento deste agente sera
          liberado quando a ingestao (Edge Function) estiver disponivel na plataforma.
        </p>
      </CardContent>
    </Card>
  );
}
