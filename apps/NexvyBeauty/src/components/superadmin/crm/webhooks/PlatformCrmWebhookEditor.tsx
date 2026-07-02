import { useState } from 'react';
import {
  usePlatformCrmWebhook,
  usePlatformCrmWebhookSamples,
  useUpdatePlatformCrmWebhook,
} from '@/components/superadmin/crm/data/usePlatformCrmWebhooks';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ArrowLeft,
  Copy,
  Settings,
  Activity,
  FlaskConical,
  Check,
  Zap,
} from 'lucide-react';
import { PlatformCrmWebhookLogsTab } from './PlatformCrmWebhookLogsTab';
import { toast } from 'sonner';

interface PlatformCrmWebhookEditorProps {
  webhookId: string;
  onBack: () => void;
}

export function PlatformCrmWebhookEditor({ webhookId, onBack }: PlatformCrmWebhookEditorProps) {
  const { data: webhook, isLoading } = usePlatformCrmWebhook(webhookId);
  const { data: samples } = usePlatformCrmWebhookSamples(webhookId);
  const updateWebhook = useUpdatePlatformCrmWebhook();

  const [activeTab, setActiveTab] = useState('config');
  const [copied, setCopied] = useState(false);

  // TODO(edge): a recepção HTTP/parsing/execução de ações roda numa Edge Function
  // dedicada (ex.: `platform-crm-webhook-receiver`). A URL abaixo é o endpoint alvo.
  const webhookUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/platform-crm-webhook-receiver/${webhookId}`;

  const copyUrl = () => {
    navigator.clipboard.writeText(webhookUrl);
    setCopied(true);
    toast.success('URL copiada!');
    setTimeout(() => setCopied(false), 2000);
  };

  const handleToggleActive = async (checked: boolean) => {
    await updateWebhook.mutateAsync({ id: webhookId, is_active: checked });
    toast.success(checked ? 'Webhook ativado!' : 'Webhook desativado');
  };

  const handleToggleTestMode = async (checked: boolean) => {
    await updateWebhook.mutateAsync({ id: webhookId, is_test_mode: checked });
    toast.success(checked ? 'Modo teste ativado' : 'Modo teste desativado');
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!webhook) {
    return (
      <div className="text-center py-12">
        <p className="text-muted-foreground">Webhook não encontrado</p>
        <Button variant="outline" onClick={onBack} className="mt-4">
          Voltar
        </Button>
      </div>
    );
  }

  const sampleCount = samples?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="icon" onClick={onBack} className="flex-shrink-0">
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div className="flex-1 min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-foreground truncate">
              {webhook.name}
            </h1>
            {webhook.description && (
              <p className="text-sm text-muted-foreground truncate">{webhook.description}</p>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:ml-auto">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Modo Teste</span>
            <Switch checked={!!webhook.is_test_mode} onCheckedChange={handleToggleTestMode} />
          </div>
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm text-muted-foreground">Ativo</span>
            <Switch checked={!!webhook.is_active} onCheckedChange={handleToggleActive} />
          </div>
        </div>
      </div>

      {/* URL Card */}
      <Card>
        <CardContent className="py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2 mb-1">
                <p className="text-xs text-muted-foreground">URL do Webhook</p>
                <div className="flex gap-2 sm:hidden">
                  {webhook.is_active ? (
                    <Badge className="bg-primary/10 text-primary border-primary/20">Ativo</Badge>
                  ) : (
                    <Badge variant="secondary">Inativo</Badge>
                  )}
                  {webhook.is_test_mode && (
                    <Badge variant="outline" className="text-orange-600 border-orange-500/30">
                      Teste
                    </Badge>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <code className="flex-1 min-w-0 px-3 py-2 bg-muted rounded-md text-xs sm:text-sm font-mono truncate">
                  {webhookUrl}
                </code>
                <Button variant="outline" size="sm" onClick={copyUrl} className="flex-shrink-0">
                  {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                </Button>
              </div>
            </div>
            <div className="hidden sm:flex gap-2">
              {webhook.is_active ? (
                <Badge className="bg-primary/10 text-primary border-primary/20">Ativo</Badge>
              ) : (
                <Badge variant="secondary">Inativo</Badge>
              )}
              {webhook.is_test_mode && (
                <Badge variant="outline" className="text-orange-600 border-orange-500/30">
                  Modo Teste
                </Badge>
              )}
            </div>
          </div>
          {webhook.is_test_mode && (
            <p className="text-xs text-orange-600 mt-2">
              ⚠️ Em modo teste, as requisições são logadas mas as ações não são executadas.
            </p>
          )}
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="config" className="gap-2">
            <Settings className="h-4 w-4" />
            Configuração
          </TabsTrigger>
          <TabsTrigger value="logs" className="gap-2">
            <Activity className="h-4 w-4" />
            Histórico
            {(webhook.requests_count ?? 0) > 0 && (
              <Badge variant="secondary" className="ml-1">
                {webhook.requests_count}
              </Badge>
            )}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-6">
          {/* Mapeamento de campos + ações (Criar Lead, aplicar tag, dispatch por squad)
              dependem da Edge Function de recepção e de amostras de payload capturadas.
              CORE expõe o resumo; o editor de ações profundo é TODO(edge). */}
          <Card>
            <CardContent className="py-8">
              <div className="flex flex-col items-center text-center gap-3">
                <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Zap className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-medium">Mapeamento de campos e ações</h3>
                  <p className="text-muted-foreground max-w-md mt-1">
                    Capture uma amostra de payload no endpoint acima e mapeie os campos para
                    ações (criar lead, aplicar etiqueta, distribuir por squad). O motor de
                    recepção e execução roda numa Edge Function dedicada.
                  </p>
                  <p className="text-xs text-muted-foreground mt-2">
                    {sampleCount > 0
                      ? `${sampleCount} amostra(s) de payload capturada(s).`
                      : 'Nenhuma amostra capturada ainda.'}
                  </p>
                </div>
                <Button
                  variant="outline"
                  onClick={() =>
                    // TODO(edge): abrir o editor de ações quando a Edge Function
                    // `platform-crm-webhook-receiver` estiver publicada.
                    toast.info('Editor de ações em breve — depende da Edge Function de recepção')
                  }
                >
                  <Zap className="h-4 w-4 mr-2" />
                  Configurar ações
                </Button>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="logs" className="mt-6">
          <PlatformCrmWebhookLogsTab webhookId={webhookId} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
