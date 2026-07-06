// Supervisor multi-agente da PLATAFORMA — F2 (O Cérebro).
// Agentes vêm de platform_crm_product_agents; especialistas/regras persistem no
// banco via `../data/usePlatformAgentSupervisor` (tabelas platform_crm_agent_*).
// RESTRIÇÃO: a UI só fala as colunas reais da migration (name/role/focus para
// especialista; trigger_description/target/priority para regra). Sem inventar campos.
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  usePlatformAgentSupervisor,
  type SpecialistUpsertInput,
  type RoutingRuleUpsertInput,
} from '../data/usePlatformAgentSupervisor';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Bot, Plus, Trash2, GitBranch, Users, Zap } from 'lucide-react';

const ROLE_OPTIONS = [
  { value: 'sdr', label: 'SDR (Qualificação)' },
  { value: 'closer', label: 'Closer (Fechamento)' },
  { value: 'support', label: 'Suporte' },
  { value: 'retention', label: 'Retenção' },
  { value: 'recovery', label: 'Recuperação' },
  { value: 'custom', label: 'Outro' },
];

// Rascunhos de edição espelham só as colunas editáveis pela UI.
type SpecialistDraft = SpecialistUpsertInput;
type RuleDraft = RoutingRuleUpsertInput;

export function AgentSupervisorPanel() {
  const { data: allAgents = [] } = useQuery({
    queryKey: ['platform-crm', 'supervisor-all-agents'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('platform_crm_product_agents')
        .select('id, name')
        .order('name');
      if (error) throw error;
      return (data ?? []) as Array<{ id: string; name: string }>;
    },
  });

  const {
    specialists,
    specialistsLoading,
    specialistsError,
    rules,
    rulesLoading,
    rulesError,
    upsertSpecialist,
    isUpsertingSpecialist,
    deleteSpecialist,
    upsertRule,
    isUpsertingRule,
    deleteRule,
  } = usePlatformAgentSupervisor();

  const [editingSpecialist, setEditingSpecialist] = useState<SpecialistDraft | null>(null);
  const [editingRule, setEditingRule] = useState<RuleDraft | null>(null);

  const specialistsById = useMemo(
    () => Object.fromEntries(specialists.map((s) => [s.id, s])),
    [specialists],
  );

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <GitBranch className="h-5 w-5 text-primary" />
              </div>
              <div>
                <CardTitle>Supervisor Multi-agente</CardTitle>
                <CardDescription>
                  Roteamento inteligente: defina especialistas e regras. Quando nenhuma regra bate,
                  o supervisor IA decide automaticamente.
                </CardDescription>
              </div>
            </div>
          </div>
        </CardHeader>
      </Card>

      {/* ESPECIALISTAS */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Users className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Especialistas</CardTitle>
            </div>
            <Button
              size="sm"
              onClick={() =>
                setEditingSpecialist({
                  agent_id: '',
                  name: '',
                  role: 'sdr',
                  focus: '',
                  is_active: true,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Novo especialista
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {specialistsLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {specialistsError && (
            <p className="text-sm text-destructive">
              Erro ao carregar especialistas: {specialistsError.message}
            </p>
          )}
          {!specialistsLoading && !specialistsError && specialists.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhum especialista cadastrado. Vincule seus agentes a um papel pra ativar o roteamento.
            </p>
          )}
          {specialists.map((sp) => {
            const agent = allAgents.find((a) => a.id === sp.agent_id);
            return (
              <div
                key={sp.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card hover:bg-accent/30 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <Bot className="h-4 w-4 text-muted-foreground shrink-0" />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium truncate">{sp.name}</span>
                      <Badge variant="secondary" className="text-xs">
                        {ROLE_OPTIONS.find((r) => r.value === sp.role)?.label ?? sp.role ?? '—'}
                      </Badge>
                      {!sp.is_active && <Badge variant="outline">Inativo</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground truncate">
                      Agente: {agent?.name ?? sp.agent_id}
                      {sp.focus ? ` · ${sp.focus}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditingSpecialist({
                        id: sp.id,
                        agent_id: sp.agent_id,
                        name: sp.name,
                        role: sp.role,
                        focus: sp.focus,
                        is_active: sp.is_active,
                      })
                    }
                  >
                    Editar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover ${sp.name}?`)) deleteSpecialist(sp.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* REGRAS DE ROTEAMENTO */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4 text-muted-foreground" />
              <CardTitle className="text-base">Regras de Roteamento</CardTitle>
            </div>
            <Button
              size="sm"
              disabled={specialists.length === 0}
              onClick={() =>
                setEditingRule({
                  // Regra herda o agente-mãe do especialista alvo (padrão: 1º da lista).
                  agent_id: specialists[0]?.agent_id ?? '',
                  trigger_description: '',
                  target_specialist_id: specialists[0]?.id ?? null,
                  priority: 0,
                  is_active: true,
                })
              }
            >
              <Plus className="h-4 w-4 mr-1" /> Nova regra
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {rulesLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
          {rulesError && (
            <p className="text-sm text-destructive">
              Erro ao carregar regras: {rulesError.message}
            </p>
          )}
          {!rulesLoading && !rulesError && rules.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nenhuma regra. Sem regras, o supervisor IA decide cada handoff automaticamente.
            </p>
          )}
          {rules.map((r) => {
            const target = r.target_specialist_id ? specialistsById[r.target_specialist_id] : null;
            return (
              <div
                key={r.id}
                className="flex items-center justify-between p-3 rounded-lg border bg-card"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-medium truncate">
                      {r.trigger_description || 'Sem gatilho descrito'}
                    </span>
                    {!r.is_active && <Badge variant="outline">Inativa</Badge>}
                    <Badge variant="secondary" className="text-xs">
                      → {target?.name ?? '(sem especialista)'}
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Prioridade {r.priority}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() =>
                      setEditingRule({
                        id: r.id,
                        agent_id: r.agent_id,
                        trigger_description: r.trigger_description,
                        target_specialist_id: r.target_specialist_id,
                        priority: r.priority,
                        is_active: r.is_active,
                      })
                    }
                  >
                    Editar
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    onClick={() => {
                      if (confirm(`Remover esta regra?`)) deleteRule(r.id);
                    }}
                  >
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* DIALOG: ESPECIALISTA */}
      <Dialog open={!!editingSpecialist} onOpenChange={(o) => !o && setEditingSpecialist(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingSpecialist?.id ? 'Editar especialista' : 'Novo especialista'}
            </DialogTitle>
            <DialogDescription>
              Vincule um agente já existente a um papel pra que o supervisor possa rotear conversas pra ele.
            </DialogDescription>
          </DialogHeader>
          {editingSpecialist && (
            <div className="space-y-4">
              <div>
                <Label>Nome</Label>
                <Input
                  value={editingSpecialist.name ?? ''}
                  onChange={(e) =>
                    setEditingSpecialist({ ...editingSpecialist, name: e.target.value })
                  }
                  placeholder="Ex: SDR de WhatsApp"
                />
              </div>
              <div>
                <Label>Papel</Label>
                <Select
                  value={editingSpecialist.role ?? undefined}
                  onValueChange={(v) => setEditingSpecialist({ ...editingSpecialist, role: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um papel" />
                  </SelectTrigger>
                  <SelectContent>
                    {ROLE_OPTIONS.map((o) => (
                      <SelectItem key={o.value} value={o.value}>
                        {o.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Agente</Label>
                <Select
                  value={editingSpecialist.agent_id || undefined}
                  onValueChange={(v) => setEditingSpecialist({ ...editingSpecialist, agent_id: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um agente" />
                  </SelectTrigger>
                  <SelectContent>
                    {allAgents.map((a) => (
                      <SelectItem key={a.id} value={a.id}>
                        {a.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Foco (ajuda o supervisor IA a escolher)</Label>
                <Textarea
                  value={editingSpecialist.focus ?? ''}
                  onChange={(e) =>
                    setEditingSpecialist({ ...editingSpecialist, focus: e.target.value })
                  }
                  placeholder="Ex: especialista em qualificação BANT pra leads novos"
                  rows={2}
                />
              </div>
              <div className="flex items-center justify-between">
                <Label>Ativo</Label>
                <Switch
                  checked={editingSpecialist.is_active ?? true}
                  onCheckedChange={(v) =>
                    setEditingSpecialist({ ...editingSpecialist, is_active: v })
                  }
                />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingSpecialist(null)}>
              Cancelar
            </Button>
            <Button
              disabled={isUpsertingSpecialist}
              onClick={() => {
                if (!editingSpecialist?.name || !editingSpecialist.agent_id) return;
                upsertSpecialist(editingSpecialist, {
                  onSuccess: () => setEditingSpecialist(null),
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* DIALOG: REGRA */}
      <Dialog open={!!editingRule} onOpenChange={(o) => !o && setEditingRule(null)}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingRule?.id ? 'Editar regra' : 'Nova regra de roteamento'}
            </DialogTitle>
            <DialogDescription>
              Descreva o gatilho e escolha o especialista alvo. Quando o gatilho bater, a conversa vai
              pra ele; a menor prioridade é avaliada primeiro.
            </DialogDescription>
          </DialogHeader>
          {editingRule && (
            <div className="space-y-4">
              <div>
                <Label>Gatilho (descrição)</Label>
                <Textarea
                  value={editingRule.trigger_description ?? ''}
                  onChange={(e) =>
                    setEditingRule({ ...editingRule, trigger_description: e.target.value })
                  }
                  placeholder="Ex: Pix abandonado nas últimas 2h vai pra recuperação"
                  rows={2}
                />
              </div>

              <div>
                <Label>Especialista alvo</Label>
                <Select
                  value={editingRule.target_specialist_id ?? undefined}
                  onValueChange={(v) => {
                    const sp = specialistsById[v];
                    // Mantém agent_id da regra coerente com o agente-mãe do especialista.
                    setEditingRule({
                      ...editingRule,
                      target_specialist_id: v,
                      agent_id: sp?.agent_id ?? editingRule.agent_id,
                    });
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione um especialista" />
                  </SelectTrigger>
                  <SelectContent>
                    {specialists.map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name} ({s.role ?? '—'})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Prioridade (menor = primeiro)</Label>
                  <Input
                    type="number"
                    value={editingRule.priority ?? 0}
                    onChange={(e) =>
                      setEditingRule({ ...editingRule, priority: Number(e.target.value) })
                    }
                  />
                </div>
                <div className="flex items-center justify-between pt-6">
                  <Label>Ativa</Label>
                  <Switch
                    checked={editingRule.is_active ?? true}
                    onCheckedChange={(v) => setEditingRule({ ...editingRule, is_active: v })}
                  />
                </div>
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingRule(null)}>
              Cancelar
            </Button>
            <Button
              disabled={isUpsertingRule}
              onClick={() => {
                if (!editingRule?.target_specialist_id || !editingRule.agent_id) return;
                upsertRule(editingRule, {
                  onSuccess: () => setEditingRule(null),
                });
              }}
            >
              Salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
