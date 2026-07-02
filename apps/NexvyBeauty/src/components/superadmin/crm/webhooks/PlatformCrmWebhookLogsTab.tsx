import { useState } from 'react';
import {
  usePlatformCrmWebhookLogs,
  type PlatformCrmWebhookLog,
} from '@/components/superadmin/crm/data/usePlatformCrmWebhooks';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  CheckCircle2,
  XCircle,
  Clock,
  FlaskConical,
  Eye,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface PlatformCrmWebhookLogsTabProps {
  webhookId: string;
}

/** Shape de uma ação executada dentro de `actions_executed` (Json no schema). */
interface ExecutedAction {
  action?: string;
  success?: boolean;
  error?: string;
  result?: unknown;
}

/** Lê `actions_executed` (Json) como lista tipada, defensivamente. */
function readExecutedActions(value: PlatformCrmWebhookLog['actions_executed']): ExecutedAction[] {
  if (!value || !Array.isArray(value)) return [];
  return value as unknown as ExecutedAction[];
}

export function PlatformCrmWebhookLogsTab({ webhookId }: PlatformCrmWebhookLogsTabProps) {
  const { data: logs, isLoading, refetch } = usePlatformCrmWebhookLogs(webhookId);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedLog, setSelectedLog] = useState<PlatformCrmWebhookLog | null>(null);

  const filteredLogs =
    logs?.filter((log) => statusFilter === 'all' || log.status === statusFilter) || [];

  const getStatusIcon = (status: string | null) => {
    switch (status) {
      case 'success':
        return <CheckCircle2 className="h-4 w-4 text-green-500" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-red-500" />;
      case 'skipped':
        return <FlaskConical className="h-4 w-4 text-orange-500" />;
      default:
        return <Clock className="h-4 w-4 text-muted-foreground" />;
    }
  };

  const getStatusBadge = (status: string | null) => {
    switch (status) {
      case 'success':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/20">Sucesso</Badge>;
      case 'error':
        return <Badge variant="destructive">Erro</Badge>;
      case 'skipped':
        return (
          <Badge variant="outline" className="text-orange-600 border-orange-500/30">
            Teste
          </Badge>
        );
      default:
        return <Badge variant="secondary">Pendente</Badge>;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-20 w-full" />
        ))}
      </div>
    );
  }

  const selectedActions = selectedLog ? readExecutedActions(selectedLog.actions_executed) : [];

  return (
    <>
      <div className="space-y-4">
        {/* Filters */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos</SelectItem>
                <SelectItem value="success">Sucesso</SelectItem>
                <SelectItem value="error">Erro</SelectItem>
                <SelectItem value="skipped">Teste</SelectItem>
                <SelectItem value="pending">Pendente</SelectItem>
              </SelectContent>
            </Select>
            <span className="text-sm text-muted-foreground">
              {filteredLogs.length} requisições
            </span>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="h-4 w-4 mr-2" />
            Atualizar
          </Button>
        </div>

        {/* Logs List */}
        {filteredLogs.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Clock className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Nenhum log encontrado</h3>
              <p className="text-muted-foreground">
                As requisições recebidas aparecerão aqui
              </p>
            </CardContent>
          </Card>
        ) : (
          <ScrollArea className="h-[500px]">
            <div className="space-y-2">
              {filteredLogs.map((log) => {
                const executed = readExecutedActions(log.actions_executed);
                return (
                  <Card key={log.id} className="hover:bg-muted/50 transition-colors">
                    <CardContent className="py-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          {getStatusIcon(log.status)}
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{log.request_method}</span>
                              {getStatusBadge(log.status)}
                              {log.processing_time_ms != null && (
                                <span className="text-xs text-muted-foreground">
                                  {log.processing_time_ms}ms
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-muted-foreground">
                              {format(new Date(log.created_at), "dd/MM/yyyy 'às' HH:mm:ss", {
                                locale: ptBR,
                              })}
                              {log.request_ip && ` • IP: ${log.request_ip}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          {executed.length > 0 && (
                            <Badge variant="secondary">{executed.length} ações</Badge>
                          )}
                          <Button variant="ghost" size="sm" onClick={() => setSelectedLog(log)}>
                            <Eye className="h-4 w-4 mr-1" />
                            Detalhes
                          </Button>
                        </div>
                      </div>
                      {log.error_message && (
                        <p className="mt-2 text-xs text-red-500 bg-red-500/10 p-2 rounded">
                          {log.error_message}
                        </p>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          </ScrollArea>
        )}
      </div>

      {/* Log Detail Dialog */}
      <Dialog open={!!selectedLog} onOpenChange={() => setSelectedLog(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Detalhes da Requisição
              {selectedLog && getStatusBadge(selectedLog.status)}
            </DialogTitle>
          </DialogHeader>

          {selectedLog && (
            <ScrollArea className="max-h-[60vh]">
              <div className="space-y-6">
                {/* Meta Info */}
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Data/Hora</p>
                    <p className="font-medium">
                      {format(new Date(selectedLog.created_at), "dd/MM/yyyy 'às' HH:mm:ss", {
                        locale: ptBR,
                      })}
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">IP</p>
                    <p className="font-medium">{selectedLog.request_ip || '—'}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Método</p>
                    <p className="font-medium">{selectedLog.request_method}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Tempo de Processamento</p>
                    <p className="font-medium">{selectedLog.processing_time_ms || 0}ms</p>
                  </div>
                </div>

                {/* Request Body */}
                <div>
                  <p className="text-sm font-medium mb-2">Payload Recebido</p>
                  <pre className="p-3 rounded-lg bg-muted text-xs overflow-auto max-h-48">
                    {JSON.stringify(selectedLog.request_body, null, 2)}
                  </pre>
                </div>

                {/* Parsed Fields */}
                {selectedLog.parsed_fields != null && (
                  <div>
                    <p className="text-sm font-medium mb-2">Campos Parseados</p>
                    <pre className="p-3 rounded-lg bg-muted text-xs overflow-auto max-h-48">
                      {JSON.stringify(selectedLog.parsed_fields, null, 2)}
                    </pre>
                  </div>
                )}

                {/* Actions Executed */}
                {selectedActions.length > 0 && (
                  <div>
                    <p className="text-sm font-medium mb-2">Ações Executadas</p>
                    <div className="space-y-2">
                      {selectedActions.map((action, index) => (
                        <div
                          key={index}
                          className={`p-3 rounded-lg border ${
                            action.success
                              ? 'bg-green-500/5 border-green-500/20'
                              : 'bg-red-500/5 border-red-500/20'
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            {action.success ? (
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-red-500" />
                            )}
                            <span className="font-medium">{action.action}</span>
                          </div>
                          {action.error && (
                            <p className="text-xs text-red-500 mt-1">{action.error}</p>
                          )}
                          {action.result != null && (
                            <pre className="text-xs mt-2 p-2 bg-muted rounded">
                              {JSON.stringify(action.result, null, 2)}
                            </pre>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Error Message */}
                {selectedLog.error_message && (
                  <div>
                    <p className="text-sm font-medium mb-2 text-red-500">Erro</p>
                    <p className="p-3 rounded-lg bg-red-500/10 text-red-500 text-sm">
                      {selectedLog.error_message}
                    </p>
                  </div>
                )}
              </div>
            </ScrollArea>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
