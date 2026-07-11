// AgentTrainingSection (platform-level) — P2.A-1: religado à gêmea product-scoped
// `platform_crm_agent_training_materials` (sem organization_id). Upload de material
// (PDF/doc) para a base de treino DESTE agente: storage `product-documents` →
// insert. Lista/exclui/ativa material real.
//
// Escopo P2.A-1: CRUD (upload/list/delete/toggle). A INGESTÃO/embedding do material
// (process-training-material) e a extração de conteúdo ficam para o P2.A-2 —
// por isso o material nasce com processing_status='pending' e sem extracted_content.
import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Upload, FileText, Trash2, BookOpen, Clock, GraduationCap } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { toast } from 'sonner';

interface Props {
  agentId: string;
  productId: string | null;
}

interface TrainingMaterial {
  id: string;
  title: string;
  material_type: string;
  category: string;
  description: string | null;
  file_url: string | null;
  is_active: boolean;
  processing_status: string;
  created_at: string;
  product_id: string | null;
  agent_id: string | null;
}

const CATEGORIES = [
  { value: 'sales_techniques', label: '🎯 Técnicas de Vendas' },
  { value: 'communication', label: '💬 Comunicação' },
  { value: 'objections', label: '🛡️ Objeções' },
  { value: 'closing', label: '✅ Fechamento' },
  { value: 'prospecting', label: '🔍 Prospecção' },
  { value: 'negotiation', label: '🤝 Negociação' },
  { value: 'general', label: '📋 Geral' },
];

// Gêmea product-scoped ainda fora do types.ts gerado (mesmo padrão de useProductHubStubs).
const db = supabase as any;
const TABLE = 'platform_crm_agent_training_materials';

export function AgentTrainingSection({ agentId, productId }: Props) {
  const { profile } = useAuth();
  const queryClient = useQueryClient();

  const [isUploading, setIsUploading] = useState(false);
  const [newMaterial, setNewMaterial] = useState({ title: '', category: 'sales_techniques', description: '' });
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const { data: materials, isLoading } = useQuery({
    queryKey: ['platform-crm', 'agent-training-materials', agentId],
    queryFn: async () => {
      const { data, error } = await db
        .from(TABLE)
        .select('*')
        .eq('agent_id', agentId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return (data ?? []) as TrainingMaterial[];
    },
    enabled: !!agentId,
  });

  const deleteMaterial = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await db.from(TABLE).delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'agent-training-materials', agentId] });
      toast.success('Material removido');
    },
    onError: () => toast.error('Erro ao remover material'),
  });

  const toggleActive = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await db.from(TABLE).update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'agent-training-materials', agentId] });
    },
  });

  const handleUpload = async () => {
    if (!selectedFile || !newMaterial.title.trim()) {
      toast.error('Preencha o título e selecione um arquivo');
      return;
    }
    if (!productId) {
      toast.error('Selecione um produto para o agente antes de enviar material');
      return;
    }

    setIsUploading(true);
    try {
      const fileExt = selectedFile.name.split('.').pop() || 'bin';
      const fileName = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${fileExt}`;
      const filePath = `platform/training/${productId}/agents/${agentId}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('product-documents')
        .upload(filePath, selectedFile);
      if (uploadError) throw uploadError;

      const publicUrl = supabase.storage.from('product-documents').getPublicUrl(filePath).data.publicUrl;

      const { error: insertError } = await db.from(TABLE).insert({
        product_id: productId,
        agent_id: agentId,
        title: newMaterial.title.trim(),
        material_type: selectedFile.type.includes('pdf') ? 'pdf' : 'text',
        category: newMaterial.category,
        description: newMaterial.description.trim() || null,
        file_url: publicUrl,
        processing_status: 'pending',
        created_by: profile?.id ?? null,
      });
      if (insertError) throw insertError;

      setNewMaterial({ title: '', category: 'sales_techniques', description: '' });
      setSelectedFile(null);
      queryClient.invalidateQueries({ queryKey: ['platform-crm', 'agent-training-materials', agentId] });
      toast.success('Material enviado! A indexação será liberada em breve (P2.A-2).');
    } catch (e: any) {
      console.error('[AgentTrainingSection] upload falhou:', e);
      toast.error('Erro ao enviar material: ' + (e?.message ?? 'desconhecido'));
    } finally {
      setIsUploading(false);
    }
  };

  const getCategoryLabel = (category: string) =>
    CATEGORIES.find((c) => c.value === category)?.label || '📋 Geral';

  return (
    <div className="space-y-4">
      <div className="p-3 rounded-lg bg-muted/50 border">
        <div className="flex items-start gap-2">
          <GraduationCap className="h-4 w-4 text-muted-foreground mt-0.5" />
          <div className="text-sm text-muted-foreground">
            <p className="font-medium text-foreground">Treinamento específico</p>
            <p>
              Adicione PDFs e documentos usados <strong>apenas por este agente</strong>. A indexação
              (embedding) do conteúdo é liberada na próxima onda (P2.A-2).
            </p>
          </div>
        </div>
      </div>

      {/* Upload */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <Upload className="h-4 w-4" /> Adicionar material
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Título *</Label>
              <Input
                value={newMaterial.title}
                onChange={(e) => setNewMaterial({ ...newMaterial, title: e.target.value })}
                placeholder="Ex: Script de Vendas"
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Categoria *</Label>
              <Select
                value={newMaterial.category}
                onValueChange={(value) => setNewMaterial({ ...newMaterial, category: value })}
              >
                <SelectTrigger className="h-8 text-sm">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat.value} value={cat.value}>
                      {cat.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-2">
            <Input
              type="file"
              accept=".pdf,.txt,.doc,.docx"
              onChange={(e) => setSelectedFile(e.target.files?.[0] || null)}
              className="flex-1 h-8 text-sm"
            />
            <Button
              size="sm"
              onClick={handleUpload}
              disabled={isUploading || !selectedFile || !newMaterial.title.trim()}
            >
              {isUploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            </Button>
          </div>
          {!productId && (
            <p className="text-xs text-amber-600">
              Este agente ainda não está vinculado a um produto — o material precisa de um produto para ser salvo.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Lista */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm flex items-center gap-2">
            <BookOpen className="h-4 w-4" /> Materiais ({materials?.length || 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex items-center justify-center py-4">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : materials && materials.length > 0 ? (
            <div className="space-y-2">
              {materials.map((material) => (
                <div
                  key={material.id}
                  className={`flex items-center justify-between p-3 rounded-lg border ${
                    material.is_active ? 'bg-background' : 'bg-muted/50 opacity-60'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <FileText className="h-4 w-4 text-primary flex-shrink-0" />
                    <div className="min-w-0">
                      <p className="text-sm font-medium truncate">{material.title}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-xs text-muted-foreground">
                          {getCategoryLabel(material.category)}
                        </span>
                        <Badge variant="outline" className="gap-1">
                          <Clock className="h-3 w-3" />
                          {material.processing_status === 'completed' ? 'Processado' : 'Pendente'}
                        </Badge>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => toggleActive.mutate({ id: material.id, is_active: !material.is_active })}
                    >
                      {material.is_active ? 'Desativar' : 'Ativar'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive hover:text-destructive"
                      onClick={() => deleteMaterial.mutate(material.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-6 text-muted-foreground">
              <BookOpen className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">Nenhum material específico</p>
              <p className="text-xs">Adicione PDFs acima</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
