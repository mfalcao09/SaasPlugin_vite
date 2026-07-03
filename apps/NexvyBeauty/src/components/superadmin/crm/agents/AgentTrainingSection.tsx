// STUB (edge/tabela ausente) do `AgentTrainingSection` da fonte Bizon.
// D3 P1/F1d — o treinamento (upload de PDFs/docs para RAG do agente) depende de
// tabela `agent_training_documents` + Edge de ingestao, que NAO tem twin
// `platform_crm_*` nesta onda. UI presente; acao real: // TODO(edge).
import { GraduationCap } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  agentId: string;
  productId: string | null;
}

export function AgentTrainingSection({ agentId, productId }: Props) {
  // TODO(edge): ingestao de material (PDF/doc) para a base de conhecimento do agente.
  // Requer tabela de documentos + Edge Function de embedding — inexistente na plataforma.
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
